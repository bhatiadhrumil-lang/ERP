/**
 * In-memory mock of @aws-sdk/client-cognito-identity-provider.
 *
 * The real SDK is NEVER exercised by the test suite (no AWS calls, no
 * credentials). This module registers a vi.mock for the SDK and exposes a tiny
 * fake Cognito directory so tests can assert the admin operations the backend
 * performed (AdminCreateUser / AdminDisableUser / AdminEnableUser /
 * AdminDeleteUser, including the RESEND invitation action).
 *
 * Import this module from a test file to activate the mock for that file.
 */
import { vi } from 'vitest';

interface FakeCognitoUser {
  sub: string;
  username: string;
  enabled: boolean;
  status: string;
}

interface CreateCall {
  username: string;
  messageAction?: string;
}

/**
 * vi.hoisted values cannot be exported — expose the shared fake-Cognito state
 * through an accessor instead. Tests must import this module BEFORE any module
 * that (transitively) imports the AWS SDK so the mock is registered in time.
 */
const state = vi.hoisted(() => ({
  users: new Map<string, FakeCognitoUser>(),
  createCalls: [] as CreateCall[],
  reset(): void {
    state.users.clear();
    state.createCalls = [];
  },
  exists(email: string): boolean {
    return state.users.has(email);
  },
  isEnabled(email: string): boolean {
    return state.users.get(email)?.enabled ?? false;
  },
}));

export function getCognitoState() {
  return state;
}

function awsError(name: string): Error & { name: string } {
  const err = new Error(name) as Error & { name: string };
  err.name = name;
  return err;
}

vi.mock('@aws-sdk/client-cognito-identity-provider', () => {
  class CognitoIdentityProviderClient {
    async send(command: { constructor: { name: string }; input: Record<string, unknown> }): Promise<unknown> {
      const name = command.constructor.name;
      const input = command.input as {
        UserPoolId?: string;
        Username?: string;
        MessageAction?: string;
      };
      const username = input.Username ?? '';

      switch (name) {
        case 'AdminCreateUserCommand': {
          const existing = state.users.get(username);
          // RESEND is how Cognito re-sends an invitation for an existing user.
          if (existing && input.MessageAction !== 'RESEND') {
            throw awsError('UsernameExistsException');
          }
          if (existing) {
            state.createCalls.push({ username, messageAction: input.MessageAction });
            return {
              User: {
                Username: existing.username,
                UserStatus: existing.status,
                Attributes: [{ Name: 'sub', Value: existing.sub }],
              },
            };
          }
          const sub = `cognito-sub-${username}`;
          state.users.set(username, { sub, username, enabled: true, status: 'FORCE_CHANGE_PASSWORD' });
          state.createCalls.push({ username, messageAction: input.MessageAction });
          return {
            User: {
              Username: username,
              UserStatus: 'FORCE_CHANGE_PASSWORD',
              Attributes: [
                { Name: 'sub', Value: sub },
                { Name: 'email', Value: username },
                { Name: 'name', Value: input.Username ?? '' },
              ],
            },
          };
        }
        case 'AdminDisableUserCommand': {
          const user = state.users.get(username);
          if (!user) throw awsError('UserNotFoundException');
          user.enabled = false;
          user.status = 'DISABLED';
          return {};
        }
        case 'AdminEnableUserCommand': {
          const user = state.users.get(username);
          if (!user) throw awsError('UserNotFoundException');
          user.enabled = true;
          user.status = 'ACTIVE';
          return {};
        }
        case 'AdminDeleteUserCommand': {
          state.users.delete(username);
          return {};
        }
        default:
          throw new Error(`[cognitoAdminMock] unhandled command: ${name}`);
      }
    }
  }

  return {
    CognitoIdentityProviderClient,
    AdminCreateUserCommand: class {
      constructor(public input: unknown) {}
    },
    AdminDisableUserCommand: class {
      constructor(public input: unknown) {}
    },
    AdminEnableUserCommand: class {
      constructor(public input: unknown) {}
    },
    AdminDeleteUserCommand: class {
      constructor(public input: unknown) {}
    },
  };
});
