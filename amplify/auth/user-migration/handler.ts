import type { UserMigrationTriggerHandler } from 'aws-lambda';
import {
  STSClient,
  AssumeRoleCommand,
  type AssumeRoleCommandOutput,
} from '@aws-sdk/client-sts';
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
  AdminInitiateAuthCommand,
  type AdminGetUserCommandOutput,
  type AttributeType,
} from '@aws-sdk/client-cognito-identity-provider';
import { getMigrationSources, type MigrationSourceConfig } from './config';

const stsClient = new STSClient({});

type AwsClientWithSend = {
  send<Output>(command: unknown): Promise<Output>;
};

async function sendCommand<Output>(client: unknown, command: unknown): Promise<Output> {
  return (client as AwsClientWithSend).send<Output>(command);
}

async function getCognitoClient(source: MigrationSourceConfig): Promise<CognitoIdentityProviderClient> {
  const assumed = await sendCommand<AssumeRoleCommandOutput>(stsClient, new AssumeRoleCommand({
    RoleArn: source.roleArn,
    RoleSessionName: 'MarpAgentUserMigration',
  }));

  return new CognitoIdentityProviderClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: assumed.Credentials!.AccessKeyId!,
      secretAccessKey: assumed.Credentials!.SecretAccessKey!,
      sessionToken: assumed.Credentials!.SessionToken!,
    },
  });
}

function isUserNotFound(error: unknown): boolean {
  return error instanceof Error && error.name === 'UserNotFoundException';
}

type CognitoClientFactory = (
  source: MigrationSourceConfig,
) => Promise<CognitoIdentityProviderClient>;

export async function findUser(
  sources: MigrationSourceConfig[],
  username: string,
  clientFactory: CognitoClientFactory = getCognitoClient,
): Promise<{
  source: MigrationSourceConfig;
  cognito: CognitoIdentityProviderClient;
  userInfo: AdminGetUserCommandOutput;
} | undefined> {
  for (const source of sources) {
    const cognito = await clientFactory(source);
    try {
      const userInfo = await sendCommand<AdminGetUserCommandOutput>(cognito, new AdminGetUserCommand({
        UserPoolId: source.userPoolId,
        Username: username,
      }));
      return { source, cognito, userInfo };
    } catch (error) {
      if (isUserNotFound(error)) {
        continue;
      }
      throw error;
    }
  }

  return undefined;
}

export async function authenticateUser(
  sources: MigrationSourceConfig[],
  username: string,
  password: string,
  clientFactory: CognitoClientFactory = getCognitoClient,
): Promise<AdminGetUserCommandOutput> {
  const found = await findUser(sources, username, clientFactory);
  if (!found) {
    throw new Error('User not found');
  }

  // 利用者が先に見つかった移行元だけでパスワードを検証する。
  // パスワード不一致時に古い移行元へ戻すと、過去のパスワードが復活するため禁止する。
  await sendCommand(found.cognito, new AdminInitiateAuthCommand({
    UserPoolId: found.source.userPoolId,
    ClientId: found.source.userPoolClientId,
    AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
    AuthParameters: {
      USERNAME: username,
      PASSWORD: password,
    },
  }));

  return found.userInfo;
}

function toUserAttributes(attributes: AttributeType[] | undefined, username: string) {
  const attrs = Object.fromEntries(
    (attributes || []).map((attribute) => [attribute.Name, attribute.Value])
  );

  return {
    email: attrs.email || username,
    email_verified: attrs.email_verified || 'true',
  };
}

export const handler: UserMigrationTriggerHandler = async (event) => {
  const sources = getMigrationSources();

  if (event.triggerSource === 'UserMigration_Authentication') {
    try {
      const userInfo = await authenticateUser(
        sources,
        event.userName,
        event.request.password,
      );
      event.response.userAttributes = toUserAttributes(userInfo.UserAttributes, event.userName);
      event.response.finalUserStatus = 'CONFIRMED';
      event.response.messageAction = 'SUPPRESS';
    } catch {
      throw new Error('Authentication failed');
    }
  } else if (event.triggerSource === 'UserMigration_ForgotPassword') {
    try {
      const found = await findUser(sources, event.userName);
      if (!found) {
        throw new Error('User not found');
      }

      event.response.userAttributes = toUserAttributes(found.userInfo.UserAttributes, event.userName);
      event.response.messageAction = 'SUPPRESS';
    } catch {
      throw new Error('User not found');
    }
  }

  return event;
};
