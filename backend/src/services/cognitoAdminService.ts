import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { env, getCognitoConfig } from '../config/env';
import { ApiError, ErrorCodes } from '../utils/ApiError';
import { logger } from '../utils/logger';

/**
 * Cognito administrative operations (AWS SDK v3).
 *
 * This is the ONLY module that talks to the Cognito admin API. Controllers
 * call application services; application services call this module. The
 * frontend NEVER calls Cognito admin operations — every administrative action
 * goes through the backend API.
 *
 * Credentials come from the AWS SDK default credential provider chain
 * (environment variables, ~/.aws profile, or an EC2 instance role in
 * production). No AWS credentials are ever hardcoded or exposed to the
 * frontend.
 *
 * Passwords never pass through this application: Cognito generates the
 * temporary password and emails the invitation itself.
 */

type CognitoError = { name?: string; message?: string };

function isCognitoError(err: unknown): err is CognitoError {
  return typeof err === 'object' && err !== null && 'name' in err;
}

/** Maps an AWS SDK error to a stable ApiError without leaking internals. */
function toApiError(err: unknown, operation: string): ApiError {
  if (isCognitoError(err)) {
    switch (err.name) {
      case 'UsernameExistsException':
        return new ApiError(409, ErrorCodes.CONFLICT, 'A Cognito account with that email already exists');
      case 'UserNotFoundException':
        return new ApiError(404, ErrorCodes.NOT_FOUND, 'The Cognito user does not exist');
      case 'InvalidParameterException':
        return new ApiError(400, ErrorCodes.VALIDATION_ERROR, `Invalid value sent to Cognito (${operation})`);
      case 'NotAuthorizedException':
        return new ApiError(
          500,
          ErrorCodes.COGNITO_ERROR,
          'Cognito admin operation is not authorized — check the backend IAM permissions',
        );
      case 'LimitExceededException':
        return new ApiError(429, ErrorCodes.COGNITO_ERROR, 'Cognito rate limit exceeded — try again shortly');
      case 'CodeDeliveryFailureException':
        return new ApiError(502, ErrorCodes.COGNITO_ERROR, 'Cognito could not deliver the invitation email');
      case 'CredentialsProviderError':
        return new ApiError(
          500,
          ErrorCodes.COGNITO_ERROR,
          'Cognito admin credentials are not configured on the backend (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)',
        );
      default:
        break;
    }
  }
  logger.error(`cognitoAdminService.${operation} failed`, err);
  return new ApiError(500, ErrorCodes.COGNITO_ERROR, `Cognito operation failed (${operation})`);
}

/**
 * Lazily-created SDK client. The default credential provider chain resolves
 * credentials at request time (env vars → ~/.aws profile → EC2 instance role).
 */
let client: CognitoIdentityProviderClient | null = null;

function getClient(): CognitoIdentityProviderClient {
  if (!client) {
    client = new CognitoIdentityProviderClient({ region: env.AWS_REGION });
  }
  return client;
}

/** Test seam: drop the cached client so a mocked module/credential is re-read. */
export function __resetCognitoClientForTests(): void {
  client = null;
}

function getPoolId(): string {
  const { poolId } = getCognitoConfig();
  if (!poolId) {
    throw new ApiError(
      500,
      ErrorCodes.AUTH_CONFIG_ERROR,
      'COGNITO_USER_POOL_ID is not configured — Cognito admin operations are unavailable',
    );
  }
  return poolId;
}

function findAttribute(attributes: { Name?: string; Value?: string }[] | undefined, name: string): string | undefined {
  return attributes?.find((a) => a.Name === name)?.Value;
}

export interface InvitedCognitoUser {
  /** Cognito `sub` — the stable identity key stored on User.cognitoSub. */
  cognitoSub: string;
  /** Cognito username (the email used as the login alias). */
  username: string;
  /** Cognito user status, e.g. FORCE_CHANGE_PASSWORD. */
  status: string;
}

/**
 * Creates the Cognito identity for an invited employee and asks Cognito to
 * send the invitation email (Cognito generates the temporary password itself —
 * no password ever passes through this application).
 */
export async function createInvitedUser(input: { name: string; email: string }): Promise<InvitedCognitoUser> {
  const poolId = getPoolId();
  try {
    const result = await getClient().send(
      new AdminCreateUserCommand({
        UserPoolId: poolId,
        Username: input.email,
        UserAttributes: [
          { Name: 'email', Value: input.email },
          { Name: 'name', Value: input.name },
          // Admin-created identities are trusted — the employee only faces the
          // first-time password challenge, not a separate email-verification step.
          { Name: 'email_verified', Value: 'true' },
        ],
        DesiredDeliveryMediums: ['EMAIL'],
        ForceAliasCreation: false,
      }),
    );
    const sub = findAttribute(result.User?.Attributes, 'sub');
    const username = result.User?.Username;
    if (!sub || !username) {
      throw new ApiError(500, ErrorCodes.COGNITO_ERROR, 'Cognito did not return a user identity for the invitation');
    }
    return { cognitoSub: sub, username, status: result.User?.UserStatus ?? 'UNKNOWN' };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(err, 'createInvitedUser');
  }
}

/** Re-sends the invitation email (new temporary password) for an INVITED user. */
export async function resendInvitation(email: string): Promise<void> {
  const poolId = getPoolId();
  try {
    await getClient().send(
      new AdminCreateUserCommand({
        UserPoolId: poolId,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
        ],
        DesiredDeliveryMediums: ['EMAIL'],
        ForceAliasCreation: false,
        MessageAction: 'RESEND',
      }),
    );
  } catch (err) {
    throw toApiError(err, 'resendInvitation');
  }
}

/**
 * Disables the Cognito identity. A missing Cognito user is treated as
 * "already effectively disabled" (the app database is the authorization
 * authority either way) — the failure is logged, not thrown.
 */
export async function disableCognitoUser(email: string): Promise<void> {
  const poolId = getPoolId();
  try {
    await getClient().send(new AdminDisableUserCommand({ UserPoolId: poolId, Username: email }));
  } catch (err) {
    if (isCognitoError(err) && err.name === 'UserNotFoundException') {
      logger.warn(`cognitoAdminService.disableCognitoUser: Cognito user not found for ${email} — skipping`);
      return;
    }
    logger.error(`cognitoAdminService.disableCognitoUser failed for ${email}`, err);
  }
}

/** Enables a previously-disabled Cognito identity. Failures are logged, not thrown. */
export async function enableCognitoUser(email: string): Promise<void> {
  const poolId = getPoolId();
  try {
    await getClient().send(new AdminEnableUserCommand({ UserPoolId: poolId, Username: email }));
  } catch (err) {
    if (isCognitoError(err) && err.name === 'UserNotFoundException') {
      logger.warn(`cognitoAdminService.enableCognitoUser: Cognito user not found for ${email} — skipping`);
      return;
    }
    logger.error(`cognitoAdminService.enableCognitoUser failed for ${email}`, err);
  }
}

/**
 * Deletes the Cognito identity. Used ONLY as a compensation step when an
 * invite fails between the Cognito create and the PostgreSQL insert — never
 * exposed as an API route (V1 prefers disable over delete).
 */
export async function deleteCognitoUser(email: string): Promise<void> {
  const poolId = getPoolId();
  try {
    await getClient().send(new AdminDeleteUserCommand({ UserPoolId: poolId, Username: email }));
  } catch (err) {
    if (isCognitoError(err) && err.name === 'UserNotFoundException') {
      return;
    }
    logger.error(`cognitoAdminService.deleteCognitoUser failed for ${email}`, err);
  }
}
