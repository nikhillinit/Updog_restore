import type { QueryFunction } from '@tanstack/react-query';
import { QueryClient } from '@tanstack/react-query';

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
  body?: unknown
): Promise<TResponse> {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  };

  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    // Type-safe error extraction
    type ApiError = { message?: string; error?: string };
    const errorData = (await response.json().catch(() => ({}) as ApiError)) as ApiError;
    const errorMessage =
      errorData.message || errorData.error || `API request failed: ${response.statusText}`;
    throw new Error(errorMessage);
  }

  return response.json() as Promise<TResponse>;
}

type UnauthorizedBehavior = 'returnNull' | 'throw';
export function getQueryFn<T>(options: { on401: UnauthorizedBehavior }): QueryFunction<T | null> {
  return async ({ queryKey }) => {
    const res = await fetch(queryKey.join('/') as string, {
      credentials: 'include',
    });

    if (options.on401 === 'returnNull' && res.status === 401) {
      return null;
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
