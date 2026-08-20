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
import { legacyPools, type LegacyPool } from '../legacy-pools.js';

const stsClient = new STSClient({});

type AwsClientWithSend = {
  send<Output>(command: unknown): Promise<Output>;
};

async function sendCommand<Output>(client: unknown, command: unknown): Promise<Output> {
  return (client as AwsClientWithSend).send<Output>(command);
}

async function getOldCognitoClient(pool: LegacyPool): Promise<CognitoIdentityProviderClient> {
  const assumed = await sendCommand<AssumeRoleCommandOutput>(stsClient, new AssumeRoleCommand({
    RoleArn: pool.roleArn,
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

function toUserAttributes(attributes: AttributeType[] | undefined, username: string) {
  const attrs = Object.fromEntries(
    (attributes || []).map((attribute) => [attribute.Name, attribute.Value])
  );

  return {
    email: attrs.email || username,
    email_verified: attrs.email_verified || 'true',
  };
}

/** 旧環境のパスワードで認証し、成功した世代の利用者属性を返す */
async function authenticateAgainstLegacy(
  userName: string,
  password: string,
): Promise<AdminGetUserCommandOutput | undefined> {
  for (const pool of legacyPools()) {
    // パスワード検証にはクライアントIDが要る。持たない世代は照合専用なので飛ばす。
    if (!pool.clientId) continue;
    try {
      const cognito = await getOldCognitoClient(pool);
      await sendCommand(cognito, new AdminInitiateAuthCommand({
        UserPoolId: pool.userPoolId,
        ClientId: pool.clientId,
        AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
        AuthParameters: { USERNAME: userName, PASSWORD: password },
      }));

      const userInfo = await sendCommand<AdminGetUserCommandOutput>(cognito, new AdminGetUserCommand({
        UserPoolId: pool.userPoolId,
        Username: userName,
      }));
      console.log(`[INFO] migrated from ${pool.label}`);
      return userInfo;
    } catch {
      // この世代には居ない、またはパスワードが違う。次の世代を試す。
      continue;
    }
  }
  return undefined;
}

/** 旧環境に利用者が存在するかを世代順に探し、最初に見つかった属性を返す */
async function findInLegacy(userName: string): Promise<AdminGetUserCommandOutput | undefined> {
  for (const pool of legacyPools()) {
    try {
      const cognito = await getOldCognitoClient(pool);
      const userInfo = await sendCommand<AdminGetUserCommandOutput>(cognito, new AdminGetUserCommand({
        UserPoolId: pool.userPoolId,
        Username: userName,
      }));
      console.log(`[INFO] found in ${pool.label}`);
      return userInfo;
    } catch {
      continue;
    }
  }
  return undefined;
}

export const handler: UserMigrationTriggerHandler = async (event) => {
  if (event.triggerSource === 'UserMigration_Authentication') {
    const userInfo = await authenticateAgainstLegacy(event.userName, event.request.password);
    if (!userInfo) throw new Error('Authentication failed');

    event.response.userAttributes = toUserAttributes(userInfo.UserAttributes, event.userName);
    event.response.finalUserStatus = 'CONFIRMED';
    event.response.messageAction = 'SUPPRESS';
  } else if (event.triggerSource === 'UserMigration_ForgotPassword') {
    const userInfo = await findInLegacy(event.userName);
    if (!userInfo) throw new Error('User not found');

    event.response.userAttributes = toUserAttributes(userInfo.UserAttributes, event.userName);
  }

  return event;
};
