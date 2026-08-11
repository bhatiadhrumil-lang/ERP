/**
 * Backwards-compatible alias. The authenticated Axios client lives in
 * `apiClient.ts`; existing service modules import it from `./api`.
 */
export { api, apiErrorMessage, setUnauthorizedHandler, AxiosError } from './apiClient';
export type { ApiErrorBody } from './apiClient';