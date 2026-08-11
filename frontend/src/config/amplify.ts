import { Amplify } from 'aws-amplify';

/**
 * Centralized AWS Amplify / Cognito configuration.
 *
 * The AWS region, user pool id and app client id are PUBLIC configuration —
 * they are not secrets and may safely live in the frontend bundle. A Cognito
 * client SECRET must never be placed here or anywhere in frontend code.
 *
 * The user pool id / client id come from Vite environment variables
 * (frontend/.env, git-ignored; see frontend/.env.example).
 */
const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID ?? '';
const userPoolClientId = import.meta.env.VITE_COGNITO_CLIENT_ID ?? '';

/** True when a Cognito user pool is configured. The UI degrades gracefully when false. */
export const isCognitoConfigured = userPoolId.length > 0 && userPoolClientId.length > 0;

/**
 * Public self-registration depends on the user pool's "Allow users to sign
 * themselves up" setting, which we cannot detect from the client. It defaults
 * to OFF; enable with VITE_COGNITO_ALLOW_SIGNUP=true only if the pool allows it.
 */
export const SELF_SIGNUP_ENABLED = import.meta.env.VITE_COGNITO_ALLOW_SIGNUP === 'true';

// Initialize Amplify exactly once, at module load. The region is derived from
// the user pool id prefix (e.g. us-east-1_xxxx).
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId,
      userPoolClientId,
    },
  },
});
