import { describe, expect, it } from 'vitest';
import { getMigrationSources, isUserMigrationEnabled } from './config';

describe('Cognito移行元設定', () => {
  it('PRIMARY、SECONDARYの順で2世代を返す', () => {
    const sources = getMigrationSources({
      MIGRATION_PRIMARY_USER_POOL_ID: 'primary-pool',
      MIGRATION_PRIMARY_USER_POOL_CLIENT_ID: 'primary-client',
      MIGRATION_PRIMARY_ACCOUNT_ROLE_ARN: 'primary-role',
      MIGRATION_SECONDARY_USER_POOL_ID: 'secondary-pool',
      MIGRATION_SECONDARY_USER_POOL_CLIENT_ID: 'secondary-client',
      MIGRATION_SECONDARY_ACCOUNT_ROLE_ARN: 'secondary-role',
    });

    expect(sources).toEqual([
      {
        userPoolId: 'primary-pool',
        userPoolClientId: 'primary-client',
        roleArn: 'primary-role',
      },
      {
        userPoolId: 'secondary-pool',
        userPoolClientId: 'secondary-client',
        roleArn: 'secondary-role',
      },
    ]);
  });

  it('既存のOLD設定を単一移行元として維持する', () => {
    expect(getMigrationSources({
      OLD_USER_POOL_ID: 'old-pool',
      OLD_USER_POOL_CLIENT_ID: 'old-client',
      OLD_ACCOUNT_ROLE_ARN: 'old-role',
    })).toHaveLength(1);
  });

  it('設定が空なら移行を無効にする', () => {
    expect(isUserMigrationEnabled({})).toBe(false);
  });

  it('一部だけ設定された移行元を拒否する', () => {
    expect(() => getMigrationSources({
      MIGRATION_PRIMARY_USER_POOL_ID: 'primary-pool',
    })).toThrow('MIGRATION_PRIMARY');
  });
});
