/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AWS_REGION?: string;
  readonly VITE_COGNITO_USER_POOL_ID?: string;
  readonly VITE_COGNITO_CLIENT_ID?: string;
  readonly VITE_API_BASE_URL?: string;
  /** Set to "true" only if the Cognito user pool allows public self-registration. */
  readonly VITE_COGNITO_ALLOW_SIGNUP?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
