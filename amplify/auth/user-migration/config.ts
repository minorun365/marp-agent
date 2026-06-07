const requiredEnvVars = [
  'OLD_USER_POOL_ID',
  'OLD_USER_POOL_CLIENT_ID',
  'OLD_ACCOUNT_ROLE_ARN',
];

export function isUserMigrationEnabled(): boolean {
  return requiredEnvVars.every((name) => Boolean(process.env[name]?.trim()));
}
