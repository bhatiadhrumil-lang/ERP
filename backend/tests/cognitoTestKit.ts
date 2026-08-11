/**
 * Test kit for backend Cognito JWT authentication tests.
 *
 * Generates an ephemeral RSA key pair and mints REAL RS256 JWTs shaped like
 * AWS Cognito access tokens (issuer, client_id, token_use, exp, sub…). The
 * public JWKS is injected into the verifier via __injectJwksForTests so no
 * network calls to AWS are made.
 */
import { createHmac, createSign, generateKeyPairSync } from 'node:crypto';
import type { Jwks } from 'aws-jwt-verify/jwk';

/** User pool + app client the test middleware is configured with. */
export const TEST_POOL_ID = 'us-east-1_testpool';
export const TEST_CLIENT_ID = 'test-cognito-client';
export const TEST_ISSUER = `https://cognito-idp.us-east-1.amazonaws.com/${TEST_POOL_ID}`;

export interface TestKeys {
  privateKeyPem: string;
  wrongPrivateKeyPem: string;
  jwks: Jwks;
}

let cached: TestKeys | null = null;

function b64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

function signJwt(header: Record<string, unknown>, payload: Record<string, unknown>, privateKeyPem: string): string {
  const headerB64 = b64url(JSON.stringify(header));
  const payloadB64 = b64url(JSON.stringify(payload));
  const signer = createSign('RSA-SHA256');
  signer.update(`${headerB64}.${payloadB64}`);
  signer.end();
  const signature = signer.sign(privateKeyPem, 'base64url');
  return `${headerB64}.${payloadB64}.${signature}`;
}

/** Lazily generate the RSA key pair + JWKS (shared across the suite). */
export function getTestKeys(): TestKeys {
  if (cached) return cached;
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const { privateKey: wrongPrivateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const exported = publicKey.export({ format: 'jwk' });
  const jwks: Jwks = {
    keys: [
      {
        kty: exported.kty ?? 'RSA',
        n: exported.n ?? '',
        e: exported.e ?? '',
        kid: 'test-key-1',
        alg: 'RS256',
        use: 'sig',
      },
    ],
  };
  cached = {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    wrongPrivateKeyPem: wrongPrivateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    jwks,
  };
  return cached;
}

export interface CognitoTokenOptions {
  /** Overrides/custom claims merged into the payload. */
  claims?: Record<string, unknown>;
  /** Seconds from now until expiry (default 3600). Pass a negative value for an already-expired token. */
  expiresInSec?: number;
  /** Sign with the wrong key to produce an invalid signature. */
  wrongSignature?: boolean;
  /** Emit HS256 instead of RS256. */
  hs256?: boolean;
}

/** Mint a token shaped like a valid Cognito ACCESS token. */
export function signCognitoAccessToken(sub: string, options: CognitoTokenOptions = {}): string {
  const keys = getTestKeys();
  const key = options.wrongSignature ? keys.wrongPrivateKeyPem : keys.privateKeyPem;
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub,
    iss: TEST_ISSUER,
    client_id: TEST_CLIENT_ID,
    token_use: 'access',
    scope: 'aws.cognito.signin.user.admin',
    auth_time: now,
    exp: now + (options.expiresInSec ?? 3600),
    iat: now,
    jti: `test-jti-${Math.random().toString(36).slice(2)}`,
    // Like a real Cognito access token: `username` (the Cognito username) is
    // always present, while `email`/`name` are only included when explicitly
    // passed via claims (real access tokens carry them only with a custom
    // pre-token-generation trigger).
    username: options.claims?.email ?? `${sub}@test.example`,
    ...options.claims,
  };
  if (options.hs256) {
    const headerB64 = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payloadB64 = b64url(JSON.stringify(payload));
    const sig = createHmac('sha256', 'wrong-secret').update(`${headerB64}.${payloadB64}`).digest('base64url');
    return `${headerB64}.${payloadB64}.${sig}`;
  }
  return signJwt({ alg: 'RS256', kid: 'test-key-1', typ: 'JWT' }, payload, key);
}

/**
 * Mint a token shaped like a valid Cognito ID token (token_use=id). ID tokens
 * carry the user attributes (email, name) that access tokens omit — the
 * bootstrap flow uses one to recover the admin's real email on pools where
 * Cognito generates UUID usernames (email as an alias).
 */
export function signCognitoIdToken(sub: string, options: CognitoTokenOptions = {}): string {
  const keys = getTestKeys();
  const key = options.wrongSignature ? keys.wrongPrivateKeyPem : keys.privateKeyPem;
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub,
    iss: TEST_ISSUER,
    client_id: TEST_CLIENT_ID,
    aud: TEST_CLIENT_ID,
    token_use: 'id',
    auth_time: now,
    exp: now + (options.expiresInSec ?? 3600),
    iat: now,
    ...options.claims,
  };
  return signJwt({ alg: 'RS256', kid: 'test-key-1', typ: 'JWT' }, payload, key);
}