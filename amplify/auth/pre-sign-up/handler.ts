import type { PreSignUpTriggerHandler } from 'aws-lambda';

// 許可するメールドメイン
const ALLOWED_DOMAIN = 'kddi-agdc.com';

export const handler: PreSignUpTriggerHandler = async (event) => {
  const email = event.request.userAttributes.email;

  if (!email) {
    throw new Error('メールアドレスが必要です');
  }

  const domain = email.split('@')[1]?.toLowerCase();

  if (domain !== ALLOWED_DOMAIN) {
    throw new Error(`このサービスはKAGのメールアドレスでのみ登録できます`);
  }

  // 自動確認（オプション）
  // event.response.autoConfirmUser = true;

  return event;
};
