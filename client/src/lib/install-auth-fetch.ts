/**
 * Global fetch interceptor: attaches the Bearer auth token to same-origin /api/*
 * requests. Fixes the prod gap where hooks calling fetch('/api/...') raw bypass
 * queryClient's apiRequest/getQueryFn wrappers and 401 at the global /api auth
 * boundary (requireAuth, Bearer-only; ADR-034). Installed in all environments.
 *
 * Scope guards:
 * - Same-origin AND path starts with /api/ -> never leaks the token cross-origin.
 * - Only when a token exists (getToken()).
 * - Never overrides an Authorization header the caller already set, so
 *   apiRequest/getQueryFn (which set it explicitly) are untouched.
 */
import { getToken } from './auth-token';

type AuthFetchWindow = Window & {
  __auth_fetch_installed?: boolean;
};

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function isSameOriginApi(url: string): boolean {
  try {
    const resolved = new URL(url, window.location.origin);
    return resolved.origin === window.location.origin && resolved.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

function hasAuthHeader(input: RequestInfo | URL, init?: RequestInit): boolean {
  const source = init?.headers ?? (input instanceof Request ? input.headers : undefined);
  return new Headers(source).has('Authorization');
}

export function installAuthFetch(): void {
  if (typeof window === 'undefined') return;

  const authFetchWindow = window as AuthFetchWindow;
  if (authFetchWindow.__auth_fetch_installed) return;
  authFetchWindow.__auth_fetch_installed = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (isSameOriginApi(getRequestUrl(input)) && !hasAuthHeader(input, init)) {
      const token = getToken();
      if (token) {
        const headers = new Headers(
          init?.headers ?? (input instanceof Request ? input.headers : undefined)
        );
        headers.set('Authorization', `Bearer ${token}`);
        init = { ...init, headers };
      }
    }
    return originalFetch(input, init);
  };
}
