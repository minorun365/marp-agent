export interface MigrationSourceConfig {
  userPoolId: string;
  userPoolClientId: string;
  roleArn: string;
}

type Environment = Record<string, string | undefined>;

function readSource(
  environment: Environment,
  prefix: 'MIGRATION_PRIMARY' | 'MIGRATION_SECONDARY',
): MigrationSourceConfig | undefined {
  const userPoolId = environment[`${prefix}_USER_POOL_ID`]?.trim();
  const userPoolClientId = environment[`${prefix}_USER_POOL_CLIENT_ID`]?.trim();
  const roleArn = environment[`${prefix}_ACCOUNT_ROLE_ARN`]?.trim();

  if (!userPoolId && !userPoolClientId && !roleArn) {
    return undefined;
  }
  if (!userPoolId || !userPoolClientId || !roleArn) {
    throw new Error(`${prefix} のCognito移行設定が不完全です`);
  }

  return { userPoolId, userPoolClientId, roleArn };
}

function readLegacySource(environment: Environment): MigrationSourceConfig | undefined {
  const userPoolId = environment.OLD_USER_POOL_ID?.trim();
  const userPoolClientId = environment.OLD_USER_POOL_CLIENT_ID?.trim();
  const roleArn = environment.OLD_ACCOUNT_ROLE_ARN?.trim();

  if (!userPoolId && !userPoolClientId && !roleArn) {
    return undefined;
  }
  if (!userPoolId || !userPoolClientId || !roleArn) {
    throw new Error('OLD_* のCognito移行設定が不完全です');
  }

  return { userPoolId, userPoolClientId, roleArn };
}

export function getMigrationSources(
  environment: Environment = process.env,
): MigrationSourceConfig[] {
  const primary = readSource(environment, 'MIGRATION_PRIMARY');
  const secondary = readSource(environment, 'MIGRATION_SECONDARY');

  if (secondary && !primary) {
    throw new Error('MIGRATION_SECONDARY_* は MIGRATION_PRIMARY_* と一緒に設定してください');
  }

  if (primary) {
    return secondary ? [primary, secondary] : [primary];
  }

  const legacy = readLegacySource(environment);
  return legacy ? [legacy] : [];
}

export function isUserMigrationEnabled(environment: Environment = process.env): boolean {
  return getMigrationSources(environment).length > 0;
}
