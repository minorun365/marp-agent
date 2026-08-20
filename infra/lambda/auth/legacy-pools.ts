/** 移行元となる旧環境（世代）の定義
 *
 * パワポ作るマンの本番は3世代ある。初代（個人検証アカウント）で始まり、
 * 途中で会社サンドボックスへ移し、最後に専用アカウントへ移した。
 * 途中の世代を移行元から外すと、その期間に登録した利用者は
 * 従来のパスワードでログインできなくなる。
 *
 * 環境変数は世代ごとに接尾辞で分ける。無印が初代、`2` が2代目。
 * 未設定の世代は単に候補から外れるので、新規構築でもそのまま動く。
 */

export interface LegacyPool {
  /** ログに出す世代の呼び名 */
  readonly label: string;
  readonly roleArn: string;
  readonly userPoolId: string;
  /** パスワード検証に使う。Googleの照合だけなら不要なので任意。 */
  readonly clientId?: string;
}

function readPool(label: string, suffix: string): LegacyPool | undefined {
  const roleArn = process.env[`OLD${suffix}_ACCOUNT_ROLE_ARN`];
  const userPoolId = process.env[`OLD${suffix}_USER_POOL_ID`];
  if (!roleArn || !userPoolId) return undefined;
  return {
    label,
    roleArn,
    userPoolId,
    clientId: process.env[`OLD${suffix}_USER_POOL_CLIENT_ID`] || undefined,
  };
}

/** 試す順に並べた移行元の一覧
 *
 * 古い世代から順に試す。どの世代でも認証を試すので、順序は誰を救えるかを変えない。
 * 変わるのは副作用のほうで、古い順にする理由はそこにある。
 *
 * 2代目のUser Poolには、初代から引き継ぐための移行トリガーが今も付いている。
 * そのため2代目へ先に問い合わせると、初代にしか居ない利用者の認証が
 * 「2代目の移行トリガー経由で初代へ」と連鎖し、2代目にも利用者が新規作成される。
 * 2代目は撤去予定の会社アカウントにあるので、そこへ書き足す動きは避ける。
 * 初代を先に試せば、初代に居る利用者は初代で完結し、2代目には触れない。
 */
export function legacyPools(): LegacyPool[] {
  return [
    readPool('初代', ''),
    readPool('2代目', '2'),
  ].filter((pool): pool is LegacyPool => pool !== undefined);
}
