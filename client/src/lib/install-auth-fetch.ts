/**
 * Same-origin API fetch boundary for cookie sessions.
 *
 * Browser credentials remain ambient HttpOnly cookies. Unsafe requests receive
 * the readable double-submit token, bootstrapping it once when necessary. Raw
 * fetch callers and queryClient wrappers therefore share the same protection.
 */

const CSRF_COOKIE_NAME = 'updog.csrf';
const CSRF_HEADER_NAME = 'X-CSRF-Token';
const CSRF_BOOTSTRAP_PATH = '/api/auth/csrf';
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

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

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  return (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
}

function requestHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  return new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
}

function readCookie(name: string): string | null {
  const matches = document.cookie
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  if (matches.length !== 1) return null;

  try {
    return decodeURIComponent(matches[0]!.slice(name.length + 1));
  } catch {
    return null;
  }
}

export function installAuthFetch(): void {
  if (typeof window === 'undefined') return;

  const authFetchWindow = window as AuthFetchWindow;
  if (authFetchWindow.__auth_fetch_installed) return;
  authFetchWindow.__auth_fetch_installed = true;

  const originalFetch = window.fetch.bind(window);
  let csrfBootstrap: Promise<string> | null = null;

  async function bootstrapCsrfToken(): Promise<string> {
    const response = await originalFetch(CSRF_BOOTSTRAP_PATH, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Unable to initialize CSRF protection (${response.status})`);
    }

    const payload = (await response.json().catch(() => null)) as { csrfToken?: unknown } | null;
    if (typeof payload?.csrfToken === 'string' && payload.csrfToken) return payload.csrfToken;
    const token = readCookie(CSRF_COOKIE_NAME);
    if (token) return token;
    throw new Error('CSRF bootstrap did not issue a token');
  }

  async function getCsrfToken(): Promise<string> {
    const existing = readCookie(CSRF_COOKIE_NAME);
    if (existing) return existing;

    csrfBootstrap ??= bootstrapCsrfToken().finally(() => {
      csrfBootstrap = null;
    });
    return csrfBootstrap;
  }

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = getRequestUrl(input);
    if (!isSameOriginApi(requestUrl)) {
      return originalFetch(input, init);
    }

    const headers = requestHeaders(input, init);
    if (UNSAFE_METHODS.has(getRequestMethod(input, init)) && !headers.has(CSRF_HEADER_NAME)) {
      const resolved = new URL(requestUrl, window.location.origin);
      const token =
        resolved.pathname === '/api/auth/login' ? await bootstrapCsrfToken() : await getCsrfToken();
      headers.set(CSRF_HEADER_NAME, token);
    }

    return originalFetch(input, {
      ...init,
      credentials: 'include',
      headers,
    });
  };
}
