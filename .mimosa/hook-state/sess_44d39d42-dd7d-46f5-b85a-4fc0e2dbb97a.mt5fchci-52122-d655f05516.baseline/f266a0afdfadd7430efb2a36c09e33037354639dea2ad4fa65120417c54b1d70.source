import { useQuery } from '@tanstack/react-query';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  fundIds: number[];
}

export interface AuthSession {
  user: AuthenticatedUser;
}

export const AUTH_SESSION_QUERY_KEY = ['auth', 'session'] as const;

export async function fetchAuthSession(): Promise<AuthSession | null> {
  const response = await fetch('/api/auth/session', {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error(`Unable to verify the current session (${response.status})`);
  }

  return response.json() as Promise<AuthSession>;
}

export function useAuthSession(enabled = true) {
  return useQuery({
    queryKey: AUTH_SESSION_QUERY_KEY,
    queryFn: fetchAuthSession,
    enabled,
    retry: false,
    staleTime: 60_000,
  });
}
