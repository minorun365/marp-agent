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

const stsClient = new STSClient({});

type AwsClientWithSend = {
  send<Output>(command: unknown): Promise<Output>;
};

async function sendCommand<Output>(client: unknown, command: unknown): Promise<Output> {
  return (client as AwsClientWithSend).send<Output>(command);
}

async function getOldCognitoClient(): Promise<CognitoIdentityProviderClient> {
  const assumed = await sendCommand<AssumeRoleCommandOutput>(stsClient, new AssumeRoleCommand({
    RoleArn: process.env.OLD_ACCOUNT_ROLE_ARN,
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

export const handler: UserMigrationTriggerHandler = async (event) => {
  const cognito = await getOldCognitoClient();

  if (event.triggerSource === 'UserMigration_Authentication') {
    try {
      await sendCommand(cognito, new AdminInitiateAuthCommand({
        UserPoolId: process.env.OLD_USER_POOL_ID,
        ClientId: process.env.OLD_USER_POOL_CLIENT_ID,
        AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
        AuthParameters: {
          USERNAME: event.userName,
          PASSWORD: event.request.password,
        },
      }));

      const userInfo = await sendCommand<AdminGetUserCommandOutput>(cognito, new AdminGetUserCommand({
        UserPoolId: process.env.OLD_USER_POOL_ID,
        Username: event.userName,
      }));

      event.response.userAttributes = toUserAttributes(userInfo.UserAttributes, event.userName);
      event.response.finalUserStatus = 'CONFIRMED';
      event.response.messageAction = 'SUPPRESS';
    } catch {
      throw new Error('Authentication failed');
    }
  } else if (event.triggerSource === 'UserMigration_ForgotPassword') {
    try {
      const userInfo = await sendCommand<AdminGetUserCommandOutput>(cognito, new AdminGetUserCommand({
        UserPoolId: process.env.OLD_USER_POOL_ID,
        Username: event.userName,
      }));

      event.response.userAttributes = toUserAttributes(userInfo.UserAttributes, event.userName);
      event.response.messageAction = 'SUPPRESS';
    } catch {
      throw new Error('User not found');
    }
  }

  return event;
};
