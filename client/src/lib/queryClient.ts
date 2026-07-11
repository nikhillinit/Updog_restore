import type { QueryFunction } from '@tanstack/react-query';
import { QueryClient } from '@tanstack/react-query';
import { getToken, clearToken } from './auth-token';

/**
 * Structured API error that preserves server response details.
 * Carries status code, error key, and Zod validation issues when present.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly errorCode: string | undefined;
  readonly issues: Array<{ path: (string | number)[]; message: string }> | undefined;

  constructor(
    status: number,
    message: string,
    errorCode?: string,
    issues?: Array<{ path: (string | number)[]; message: string }>
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errorCode = errorCode;
    this.issues = issues;
  }

  /** Map Zod issues to { fieldName: errorMessage } for form integration */
  get fieldErrors(): Record<string, string> {
    if (!this.issues) return {};
    const errors: Record<string, string> = {};
    for (const issue of this.issues) {
      const field = issue.path.join('.');
      if (field && !errors[field]) {
        errors[field] = issue.message;
      }
    }
    return errors;
  }
}

interface ApiRequestOptions {
  headers?: Record<string, string>;
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** On an unexpected 401, drop the (expired/invalid) token and bounce to /login.
 *  Guarded so it never loops when already on the login page. */
function handleUnauthorized(): void {
  clearToken();
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

/**
 * Type-safe API request wrapper with proper error handling
 * @param method - HTTP method (GET, POST, PUT, DELETE, PATCH)
 * @param url - API endpoint URL
 * @param body - Request body (for POST/PUT/PATCH)
 * @returns Typed response data
 * @throws Error with message from API or generic failure message
 */
export async function apiRequest<TResponse = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  url: string,
  body?: unknown,
  requestOptions: ApiRequestOptions = {}
): Promise<TResponse> {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...requestOptions.headers,
    },
    credentials: 'include',
  };

  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    if (response.status === 401 && url !== '/api/auth/login') {
      handleUnauthorized();
    }
    type ErrorBody = {
      message?: string;
      error?: string;
      code?: string;
      issues?: Array<{ path: (string | number)[]; message: string }>;
      details?: unknown;
    };
    const errorData = (await response.json().catch(() => ({}) as ErrorBody)) as ErrorBody;
    const errorMessage =
      errorData.message || errorData.error || `API request failed: ${response.statusText}`;
    const errorCode = errorData.code ?? errorData.error;
    throw new ApiError(response.status, errorMessage, errorCode, errorData.issues);
  }

  return response.json() as Promise<TResponse>;
}

type UnauthorizedBehavior = 'returnNull' | 'throw';
export function getQueryFn<T>(options: { on401: UnauthorizedBehavior }): QueryFunction<T | null> {
  return async ({ queryKey }) => {
    const res = await fetch(queryKey.join('/') as string, {
      credentials: 'include',
      headers: { ...authHeaders() },
    });

    if (res.status === 401) {
      if (options.on401 === 'returnNull') {
        return null;
      }
      handleUnauthorized();
    }

    await throwIfResNotOk(res);
    return (await res.json()) as unknown as T;
  };
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: 'throw' }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
