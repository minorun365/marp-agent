import type { PreSignUpTriggerHandler } from 'aws-lambda';
import {
  AdminGetUserCommand,
  AdminLinkProviderForUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';

const cognito = new CognitoIdentityProviderClient({});
const sts = new STSClient({});

async function existsInOldPool(email: string) {
  const roleArn = process.env.OLD_ACCOUNT_ROLE_ARN;
  const userPoolId = process.env.OLD_USER_POOL_ID;
  if (!roleArn || !userPoolId) return false;

  const assumed = await sts.send(new AssumeRoleCommand({
    RoleArn: roleArn,
    RoleSessionName: 'PawapoGoogleLinkCheck',
  }));
  const oldCognito = new CognitoIdentityProviderClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: assumed.Credentials!.AccessKeyId!,
      secretAccessKey: assumed.Credentials!.SecretAccessKey!,
      sessionToken: assumed.Credentials!.SessionToken!,
    },
  });

  try {
    await oldCognito.send(new AdminGetUserCommand({ UserPoolId: userPoolId, Username: email }));
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === 'UserNotFoundException') return false;
    throw error;
  }
}

export const handler: PreSignUpTriggerHandler = async (event) => {
  if (event.triggerSource !== 'PreSignUp_ExternalProvider') return event;

  const email = event.request.userAttributes.email;
  // CognitoのPreSignUp_ExternalProviderでは、Googleが検証済みメールだけを返しても
  // email_verifiedがトリガー属性へ含まれないことがある。Google IdPから届いた
  // メールアドレスの存在を必須とし、Cognito側ではその値を検証済みとして確定する。
  if (!email) throw new Error('Googleアカウントのメールアドレスが必要です。');
  event.response.autoVerifyEmail = true;

  const users = await cognito.send(new ListUsersCommand({
    UserPoolId: event.userPoolId,
    Filter: `email = "${email.replaceAll('"', '\\"')}"`,
    Limit: 2,
  }));

  if ((users.Users?.length ?? 0) > 1) {
    throw new Error('同じメールアドレスのアカウントが複数あります。サポートへお問い合わせください。');
  }

  const existingUser = users.Users?.[0];
  if (!existingUser?.Username) {
    if (await existsInOldPool(email)) {
      throw new Error('既存ユーザーは、最初の一度だけメールとパスワードでログインしてください。');
    }
    return event;
  }

  const separator = event.userName.indexOf('_');
  if (separator < 1) throw new Error('Googleアカウントの識別情報を確認できませんでした。');
  const providerName = event.userName.slice(0, separator);
  const providerUserId = event.userName.slice(separator + 1);

  await cognito.send(new AdminLinkProviderForUserCommand({
    UserPoolId: event.userPoolId,
    DestinationUser: {
      ProviderName: 'Cognito',
      ProviderAttributeValue: existingUser.Username,
    },
    SourceUser: {
      ProviderName: providerName,
      ProviderAttributeName: 'Cognito_Subject',
      ProviderAttributeValue: providerUserId,
    },
  }));

  return event;
};
