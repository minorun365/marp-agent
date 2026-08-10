import { defineFunction } from '@aws-amplify/backend';

export const userMigration = defineFunction({
  name: 'user-migration',
  entry: './handler.ts',
  environment: {
    OLD_USER_POOL_ID: process.env.OLD_USER_POOL_ID || '',
    OLD_USER_POOL_CLIENT_ID: process.env.OLD_USER_POOL_CLIENT_ID || '',
    OLD_ACCOUNT_ROLE_ARN: process.env.OLD_ACCOUNT_ROLE_ARN || '',
    MIGRATION_PRIMARY_USER_POOL_ID: process.env.MIGRATION_PRIMARY_USER_POOL_ID || '',
    MIGRATION_PRIMARY_USER_POOL_CLIENT_ID: process.env.MIGRATION_PRIMARY_USER_POOL_CLIENT_ID || '',
    MIGRATION_PRIMARY_ACCOUNT_ROLE_ARN: process.env.MIGRATION_PRIMARY_ACCOUNT_ROLE_ARN || '',
    MIGRATION_SECONDARY_USER_POOL_ID: process.env.MIGRATION_SECONDARY_USER_POOL_ID || '',
    MIGRATION_SECONDARY_USER_POOL_CLIENT_ID: process.env.MIGRATION_SECONDARY_USER_POOL_CLIENT_ID || '',
    MIGRATION_SECONDARY_ACCOUNT_ROLE_ARN: process.env.MIGRATION_SECONDARY_ACCOUNT_ROLE_ARN || '',
  },
  timeoutSeconds: 15,
});
