import type { QueryFunction } from '@tanstack/react-query';
import { QueryClient } from '@tanstack/react-query';
import { AUTH_SESSION_QUERY_KEY } from './auth-session';

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

/** Make an unexpected 401 visible to the session-gated application shell. */
function handleUnauthorized(): void {
  queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, null);
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

  if (response.status === 204) return undefined as TResponse;
  return response.json() as Promise<TResponse>;
}

type UnauthorizedBehavior = 'returnNull' | 'throw';
export function getQueryFn<T>(options: { on401: UnauthorizedBehavior }): QueryFunction<T | null> {
  return async ({ queryKey }) => {
    const res = await fetch(queryKey.join('/') as string, {
      credentials: 'include',
    });

    if (res.status === 401) {
      if (options.on401 === 'returnNull') {
        return null;
      }
      handleUnauthorized();
    }

    await throwIfResNotOk(res);
    if (res.status === 204) return undefined as T;
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
