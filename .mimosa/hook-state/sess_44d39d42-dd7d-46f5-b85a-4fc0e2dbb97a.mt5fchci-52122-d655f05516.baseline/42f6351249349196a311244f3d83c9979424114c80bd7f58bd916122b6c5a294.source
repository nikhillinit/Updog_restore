/** The pre-D4 browser credential key. It is retained only for one-way cleanup. */
export const LEGACY_AUTH_TOKEN_KEY = 'updog.authToken';

/** Remove credentials left by the retired localStorage Bearer transport. */
export function purgeLegacyAuthToken(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  } catch {
    // Storage may be unavailable under hardened browser policies.
  }
}
