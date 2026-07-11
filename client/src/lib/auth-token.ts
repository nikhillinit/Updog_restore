/**
 * Single source of truth for the browser auth token (localStorage).
 * XSS-exfiltration risk accepted for internal-tool scale (decision C, ADR-034).
 * `typeof window` guarded for SSR/test safety.
 */
const TOKEN_KEY = 'updog.authToken';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore quota/security errors */
  }
}

export function clearToken(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}
