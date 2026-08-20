import type { PreSignUpTriggerHandler } from 'aws-lambda';
import {
  AdminGetUserCommand,
  AdminLinkProviderForUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { legacyPools, type LegacyPool } from '../legacy-pools.js';

const cognito = new CognitoIdentityProviderClient({});
const sts = new STSClient({});

async function existsIn(pool: LegacyPool, email: string) {
  const assumed = await sts.send(new AssumeRoleCommand({
    RoleArn: pool.roleArn,
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
    await oldCognito.send(new AdminGetUserCommand({ UserPoolId: pool.userPoolId, Username: email }));
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === 'UserNotFoundException') return false;
    throw error;
  }
}

/** 移行元のどれか1つにでも居れば、まずパスワードで移行してもらう */
async function existsInOldPool(email: string) {
  for (const pool of legacyPools()) {
    if (await existsIn(pool, email)) return true;
  }
  return false;
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
  // CognitoはuserNameを "google_<sub>" と小文字の接頭辞で渡すが、
  // AdminLinkProviderForUserはUser Poolへ登録した名前 "Google" と完全一致を求める。
  // 接頭辞をそのまま渡すとInvalidParameterExceptionでサインインが中断される。
  const rawProviderName = event.userName.slice(0, separator);
  const providerName = rawProviderName.toLowerCase() === 'google' ? 'Google' : rawProviderName;
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
