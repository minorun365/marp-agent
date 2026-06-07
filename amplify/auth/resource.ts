import { defineAuth } from '@aws-amplify/backend';
import { isUserMigrationEnabled } from './user-migration/config';
import { userMigration } from './user-migration/resource';

export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  ...(isUserMigrationEnabled()
    ? {
        triggers: {
          userMigration,
        },
      }
    : {}),
});
