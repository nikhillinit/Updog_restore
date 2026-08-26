import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, type ApiError } from '@/lib/queryClient';
import { purgeLegacyAuthToken } from '@/lib/auth-token';
import { AUTH_SESSION_QUERY_KEY, type AuthSession } from '@/lib/auth-session';

interface LoginRequest {
  username: string;
  password: string;
}

/** Establish the HttpOnly cookie session and publish its sanitized identity. */
export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation<AuthSession, ApiError, LoginRequest>({
    mutationFn: (credentials) => apiRequest<AuthSession>('POST', '/api/auth/login', credentials),
    onSuccess: (data) => {
      purgeLegacyAuthToken();
      queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, data);
    },
  });
}
