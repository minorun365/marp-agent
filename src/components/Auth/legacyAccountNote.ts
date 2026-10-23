// 2代目の移行元（2026-08-14 までのUser Pool）を撤去したため、それ以降ログインしていない人は
// 前のパスワードでは入れない。つまずく2か所（パスワードログインの失敗・再設定）でだけ案内する。
// 公開版だけの経緯なので、KAG社内版はマージのあとにこの1行を false にしている。
export const SHOW_LEGACY_ACCOUNT_NOTE = true;
const LEGACY_ACCOUNT_NOTE = '2026年8月14日より前に登録し、それ以降ログインしていない方';
export const SIGNIN_CHECK_MESSAGE = 'メールアドレスまたは認証情報を確認してください。';
const RESET_LEAD = '確認コードをメールでお送りします。';
export const LEGACY_SIGNIN_ERROR = SHOW_LEGACY_ACCOUNT_NOTE
  ? `${SIGNIN_CHECK_MESSAGE}${LEGACY_ACCOUNT_NOTE}は、お手数ですが「アカウントを作成」から登録し直してください。`
  : SIGNIN_CHECK_MESSAGE;
export const LEGACY_RESET_LEAD = SHOW_LEGACY_ACCOUNT_NOTE
  ? `${RESET_LEAD}${LEGACY_ACCOUNT_NOTE}には確認コードをお送りできません。お手数ですが「アカウントを作成」から登録し直してください。`
  : RESET_LEAD;
