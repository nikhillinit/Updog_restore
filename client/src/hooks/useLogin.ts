import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, type ApiError } from '@/lib/queryClient';
import { setToken } from '@/lib/auth-token';

interface LoginRequest {
  username: string;
  password: string;
}

interface LoginResponse {
  token: string;
}

/** POST /api/auth/login -> store JWT in localStorage and refetch authed data. */
export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation<LoginResponse, ApiError, LoginRequest>({
    mutationFn: (credentials) => apiRequest<LoginResponse>('POST', '/api/auth/login', credentials),
    onSuccess: (data) => {
      setToken(data.token);
      void queryClient.invalidateQueries();
    },
  });
}
