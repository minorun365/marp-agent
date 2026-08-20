import { beforeEach, describe, expect, it, vi } from 'vitest';

/** STSとCognitoの呼び出しを記録するモック
 *
 * どの世代のUser Poolへ問い合わせたかを検証したいので、コマンドの入力をそのまま貯める。
 */
const sent: { client: 'sts' | 'cognito'; input: Record<string, unknown> }[] = [];

/** User Pool ID ごとの応答を決める。既定はどの世代にも居ない扱い。 */
let poolBehavior: Record<string, 'ok' | 'fail'> = {};

vi.mock('@aws-sdk/client-sts', () => ({
  STSClient: class {
    async send(command: { input: Record<string, unknown> }) {
      sent.push({ client: 'sts', input: command.input });
      return {
        Credentials: {
          AccessKeyId: 'AKIA_TEST',
          SecretAccessKey: 'secret',
          SessionToken: 'token',
        },
      };
    }
  },
  AssumeRoleCommand: class {
    constructor(public input: Record<string, unknown>) {}
  },
}));

vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: class {
    async send(command: { input: Record<string, unknown> }) {
      sent.push({ client: 'cognito', input: command.input });
      const poolId = command.input.UserPoolId as string;
      if (poolBehavior[poolId] !== 'ok') {
        throw new Error(`NotAuthorizedException for ${poolId}`);
      }
      return { UserAttributes: [{ Name: 'email', Value: 'user@example.com' }] };
    }
  },
  AdminGetUserCommand: class {
    constructor(public input: Record<string, unknown>) {}
  },
  AdminInitiateAuthCommand: class {
    constructor(public input: Record<string, unknown>) {}
  },
}));

const { handler } = await import('./handler.js');

const FIRST_POOL = 'us-east-1_first';
const SECOND_POOL = 'us-east-1_second';

function authEvent() {
  return {
    triggerSource: 'UserMigration_Authentication',
    userName: 'user@example.com',
    request: { password: 'pw' },
    response: {} as Record<string, unknown>,
  };
}

/** 認証を試した順に User Pool ID を返す */
function authAttemptOrder() {
  return sent
    .filter((entry) => entry.client === 'cognito' && 'AuthFlow' in entry.input)
    .map((entry) => entry.input.UserPoolId);
}

beforeEach(() => {
  sent.length = 0;
  poolBehavior = {};
  process.env.OLD_ACCOUNT_ROLE_ARN = 'arn:aws:iam::111111111111:role/first';
  process.env.OLD_USER_POOL_ID = FIRST_POOL;
  process.env.OLD_USER_POOL_CLIENT_ID = 'client-first';
  process.env.OLD2_ACCOUNT_ROLE_ARN = 'arn:aws:iam::222222222222:role/second';
  process.env.OLD2_USER_POOL_ID = SECOND_POOL;
  process.env.OLD2_USER_POOL_CLIENT_ID = 'client-second';
});

describe('複数世代からのユーザー移行', () => {
  it('2代目にしか居ない利用者を移行できる', async () => {
    poolBehavior = { [SECOND_POOL]: 'ok' };

    const event = await handler(authEvent() as never, {} as never, (() => {}) as never);

    expect(event!.response.userAttributes).toEqual({
      email: 'user@example.com',
      email_verified: 'true',
    });
    expect(event!.response.finalUserStatus).toBe('CONFIRMED');
  });

  it('初代にしか居ない利用者も移行できる', async () => {
    poolBehavior = { [FIRST_POOL]: 'ok' };

    const event = await handler(authEvent() as never, {} as never, (() => {}) as never);

    expect(event!.response.finalUserStatus).toBe('CONFIRMED');
  });

  it('初代に居る利用者では2代目へ問い合わせない（2代目への連鎖書き込みを防ぐ）', async () => {
    poolBehavior = { [FIRST_POOL]: 'ok', [SECOND_POOL]: 'ok' };

    await handler(authEvent() as never, {} as never, (() => {}) as never);

    // 2代目のUser Poolには移行トリガーが残っており、問い合わせると利用者が新規作成される。
    // 初代で完結する限り、撤去予定の2代目へ触れない。
    expect(authAttemptOrder()).toEqual([FIRST_POOL]);
  });

  it('どの世代にも居なければ認証失敗にする', async () => {
    await expect(
      handler(authEvent() as never, {} as never, (() => {}) as never),
    ).rejects.toThrow('Authentication failed');
    expect(authAttemptOrder()).toEqual([FIRST_POOL, SECOND_POOL]);
  });

  it('2代目が未設定なら初代だけを見る（新規構築と1世代運用の互換）', async () => {
    delete process.env.OLD2_ACCOUNT_ROLE_ARN;
    delete process.env.OLD2_USER_POOL_ID;
    delete process.env.OLD2_USER_POOL_CLIENT_ID;
    poolBehavior = { [FIRST_POOL]: 'ok' };

    await handler(authEvent() as never, {} as never, (() => {}) as never);

    expect(authAttemptOrder()).toEqual([FIRST_POOL]);
  });

  it('パスワード再設定でも全世代を探す', async () => {
    poolBehavior = { [FIRST_POOL]: 'ok' };
    const event = await handler(
      {
        triggerSource: 'UserMigration_ForgotPassword',
        userName: 'user@example.com',
        request: {},
        response: {} as Record<string, unknown>,
      } as never,
      {} as never,
      (() => {}) as never,
    );

    expect(event!.response.userAttributes).toEqual({
      email: 'user@example.com',
      email_verified: 'true',
    });
  });
});
