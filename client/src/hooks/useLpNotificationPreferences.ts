import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export interface LpNotificationPreferences {
  emailCapitalCalls: boolean;
  emailDistributions: boolean;
  emailQuarterlyReports: boolean;
  emailAnnualReports: boolean;
  emailMarketUpdates: boolean;
  inAppCapitalCalls: boolean;
  inAppDistributions: boolean;
  inAppReports: boolean;
}

export const DEFAULT_LP_NOTIFICATION_PREFERENCES: LpNotificationPreferences = {
  emailCapitalCalls: true,
  emailDistributions: true,
  emailQuarterlyReports: true,
  emailAnnualReports: true,
  emailMarketUpdates: false,
  inAppCapitalCalls: true,
  inAppDistributions: true,
  inAppReports: true,
};

interface LpNotificationPreferencesResponse {
  preferences: LpNotificationPreferences;
}

type LpNotificationPreferencesUpdate = Partial<LpNotificationPreferences>;

const QUERY_KEY = ['lp', 'notification-preferences'] as const;

export function useLpNotificationPreferences() {
  return useQuery<LpNotificationPreferences>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const response = await apiRequest<LpNotificationPreferencesResponse>(
        'GET',
        '/api/lp/notifications/preferences'
      );
      return response.preferences;
    },
    staleTime: 300_000,
  });
}

export function useUpdateLpNotificationPreferences() {
  const queryClient = useQueryClient();

  return useMutation<LpNotificationPreferencesResponse, Error, LpNotificationPreferencesUpdate>({
    mutationFn: async (payload) =>
      apiRequest<LpNotificationPreferencesResponse>(
        'PUT',
        '/api/lp/notifications/preferences',
        payload
      ),
    onSuccess: (response) => {
      queryClient.setQueryData(QUERY_KEY, response.preferences);
    },
  });
}
