/**
 * useLPNotifications Hook
 *
 * Data fetching hook for LP notifications with real-time updates.
 *
 * @module client/hooks/useLPNotifications
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLPContext } from '@/contexts/LPContext';

// ============================================================================
// TYPES
// ============================================================================

export type NotificationType =
  | 'capital_call'
  | 'distribution'
  | 'document'
  | 'report'
  | 'fund_update'
  | 'system';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface LPNotification {
  id: string;
  lpId: number;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  actionUrl: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: LPNotification[];
  nextCursor: string | null;
  hasMore: boolean;
  totalUnread: number;
}

interface UseLPNotificationsOptions {
  unreadOnly?: boolean;
  type?: NotificationType;
  limit?: number;
  enabled?: boolean;
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook for fetching LP notifications
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useLPNotifications({
 *   unreadOnly: true,
 *   limit: 10,
 * });
 * ```
 */
export function useLPNotifications(options: UseLPNotificationsOptions = {}) {
  const { lpId } = useLPContext();
  const { unreadOnly = false, type, limit = 20, enabled = true } = options;

  return useQuery<NotificationsResponse, Error>({
    queryKey: ['lp-notifications', lpId, unreadOnly, type, limit],
    queryFn: async () => {
      if (!lpId) {
        throw new Error('No LP ID available');
      }

      const params = new URLSearchParams();
      params.append('lpId', lpId.toString());
      if (unreadOnly) params.append('unreadOnly', 'true');
      if (type) params.append('type', type);
      params.append('limit', limit.toString());

      const response = await fetch(`/api/lp/notifications?${params.toString()}`);

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(
          errorData.message || `HTTP ${response.status}: Failed to fetch notifications`
        );
      }

      return response.json() as Promise<NotificationsResponse>;
    },
    enabled: enabled && !!lpId,
    staleTime: 30_000, // 30 seconds - notifications should be fresh
    gcTime: 60_000, // 1 minute
    refetchOnWindowFocus: true,
    refetchInterval: 60_000, // Poll every minute
    retry: 2,
  });
}

/**
 * Hook for fetching unread count (optimized for header badge)
 */
export function useLPUnreadCount(options: { enabled?: boolean } = {}) {
  const { lpId } = useLPContext();
  const { enabled = true } = options;

  return useQuery<{ unreadCount: number }>({
    queryKey: ['lp-unread-count', lpId],
    queryFn: async () => {
      if (!lpId) {
        throw new Error('No LP ID available');
      }

      const response = await fetch(`/api/lp/notifications/unread-count?lpId=${lpId}`);

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(
          errorData.message || `HTTP ${response.status}: Failed to fetch unread count`
        );
      }

      return response.json() as Promise<{ unreadCount: number }>;
    },
    enabled: enabled && !!lpId,
    staleTime: 30_000,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    retry: 2,
  });
}

/**
 * Hook for marking notifications as read
 */
export function useMarkNotificationRead() {
  const { lpId } = useLPContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ notificationId }: { notificationId: string }) => {
      if (!lpId) {
        throw new Error('No LP ID available');
      }

      const response = await fetch(`/api/lp/notifications/${notificationId}/read?lpId=${lpId}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(
          errorData.message || `HTTP ${response.status}: Failed to mark notification as read`
        );
      }

      return response.json() as Promise<{ success: boolean }>;
    },
    onSuccess: () => {
      // Invalidate both notifications and unread count queries
      queryClient.invalidateQueries({ queryKey: ['lp-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['lp-unread-count'] });
    },
  });
}

/**
 * Hook for marking all notifications as read
 */
export function useMarkAllNotificationsRead() {
  const { lpId } = useLPContext();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!lpId) {
        throw new Error('No LP ID available');
      }

      const response = await fetch(`/api/lp/notifications/mark-all-read?lpId=${lpId}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(
          errorData.message || `HTTP ${response.status}: Failed to mark all notifications as read`
        );
      }

      return response.json() as Promise<{ success: boolean; count: number }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lp-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['lp-unread-count'] });
    },
  });
}
