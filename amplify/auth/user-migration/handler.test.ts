import { describe, expect, it, vi } from 'vitest';
import type { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { authenticateUser } from './handler';
import type { MigrationSourceConfig } from './config';

const primary: MigrationSourceConfig = {
  userPoolId: 'primary-pool',
  userPoolClientId: 'primary-client',
  roleArn: 'primary-role',
};
const secondary: MigrationSourceConfig = {
  userPoolId: 'secondary-pool',
  userPoolClientId: 'secondary-client',
  roleArn: 'secondary-role',
};

describe('2世代Cognito認証', () => {
  it('PRIMARYに利用者がいれば、パスワード不一致でもSECONDARYへ戻らない', async () => {
    const primarySend = vi.fn(async (command: object) => {
      if (command.constructor.name === 'AdminGetUserCommand') {
        return { UserAttributes: [{ Name: 'email', Value: 'user@example.com' }] };
      }
      const error = new Error('Incorrect username or password');
      error.name = 'NotAuthorizedException';
      throw error;
    });
    const secondarySend = vi.fn();
    const clientFactory = vi.fn(async (source: MigrationSourceConfig) => ({
      send: source === primary ? primarySend : secondarySend,
    }) as unknown as CognitoIdentityProviderClient);

    await expect(authenticateUser(
      [primary, secondary],
      'user@example.com',
      'old-password',
      clientFactory,
    )).rejects.toThrow('Incorrect username or password');

    expect(clientFactory).toHaveBeenCalledTimes(1);
    expect(secondarySend).not.toHaveBeenCalled();
  });

  it('PRIMARYに利用者がいない場合だけSECONDARYへ進む', async () => {
    const primarySend = vi.fn(async () => {
      const error = new Error('User not found');
      error.name = 'UserNotFoundException';
      throw error;
    });
    const secondarySend = vi.fn(async (command: object) => {
      if (command.constructor.name === 'AdminGetUserCommand') {
        return { UserAttributes: [{ Name: 'email', Value: 'user@example.com' }] };
      }
      return { AuthenticationResult: {} };
    });
    const clientFactory = vi.fn(async (source: MigrationSourceConfig) => ({
      send: source === primary ? primarySend : secondarySend,
    }) as unknown as CognitoIdentityProviderClient);

    const user = await authenticateUser(
      [primary, secondary],
      'user@example.com',
      'current-password',
      clientFactory,
    );

    expect(user.UserAttributes?.[0]?.Value).toBe('user@example.com');
    expect(clientFactory).toHaveBeenCalledTimes(2);
    expect(secondarySend).toHaveBeenCalledTimes(2);
  });
});
