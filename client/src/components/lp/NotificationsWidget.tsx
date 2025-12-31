/**
 * Notifications Widget
 *
 * Dashboard widget showing recent notifications with mark-as-read functionality.
 *
 * @module client/components/lp/NotificationsWidget
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useLPNotifications,
  useLPUnreadCount,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  type LPNotification,
  type NotificationType,
  type NotificationPriority,
} from '@/hooks/useLPNotifications';
import {
  Bell,
  DollarSign,
  Banknote,
  FileText,
  TrendingUp,
  Info,
  AlertTriangle,
  CheckCheck,
  ArrowRight,
} from 'lucide-react';
import { useLocation } from 'wouter';
import { formatDistanceToNow } from 'date-fns';

// ============================================================================
// HELPERS
// ============================================================================

const getNotificationIcon = (type: NotificationType) => {
  switch (type) {
    case 'capital_call':
      return <DollarSign className="h-4 w-4" />;
    case 'distribution':
      return <Banknote className="h-4 w-4" />;
    case 'document':
      return <FileText className="h-4 w-4" />;
    case 'report':
      return <TrendingUp className="h-4 w-4" />;
    case 'fund_update':
      return <Info className="h-4 w-4" />;
    default:
      return <Bell className="h-4 w-4" />;
  }
};

const getNotificationIconColor = (type: NotificationType): string => {
  switch (type) {
    case 'capital_call':
      return 'text-blue-600 bg-blue-100';
    case 'distribution':
      return 'text-green-600 bg-green-100';
    case 'document':
      return 'text-indigo-600 bg-indigo-100';
    case 'report':
      return 'text-purple-600 bg-purple-100';
    case 'fund_update':
      return 'text-orange-600 bg-orange-100';
    default:
      return 'text-gray-600 bg-gray-100';
  }
};

const getPriorityBadge = (priority: NotificationPriority) => {
  switch (priority) {
    case 'urgent':
      return (
        <Badge variant="destructive" className="text-xs">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Urgent
        </Badge>
      );
    case 'high':
      return (
        <Badge variant="default" className="bg-orange-500 text-xs">
          High
        </Badge>
      );
    default:
      return null;
  }
};

// ============================================================================
// COMPONENT
// ============================================================================

export function NotificationsWidget() {
  const { data: notificationsData, isLoading: notificationsLoading } = useLPNotifications({
    limit: 5,
  });
  const { data: unreadData, isLoading: unreadLoading } = useLPUnreadCount();
  const markAsRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const [, navigate] = useLocation();

  const isLoading = notificationsLoading || unreadLoading;
  const unreadCount = unreadData?.unreadCount ?? 0;

  const handleNotificationClick = (notification: LPNotification) => {
    // Mark as read if not already
    if (!notification.isRead) {
      markAsRead.mutate({ notificationId: notification.id });
    }

    // Navigate to action URL if available
    if (notification.actionUrl) {
      navigate(notification.actionUrl);
    }
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate();
  };

  if (isLoading) {
    return (
      <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md">
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white rounded-xl border border-[#E0D8D1] shadow-md">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 font-inter text-[#292929]">
            <Bell className="h-5 w-5 text-amber-600" />
            Notifications
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-1">
                {unreadCount > 99 ? '99+' : unreadCount}
              </Badge>
            )}
          </CardTitle>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={handleMarkAllRead}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="h-4 w-4 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
        <CardDescription className="font-poppins text-[#292929]/70">
          {unreadCount > 0
            ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}`
            : "You're all caught up"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {notificationsData?.notifications && notificationsData.notifications.length > 0 ? (
          <div className="space-y-3">
            {notificationsData.notifications.map((notification) => (
              <div
                key={notification.id}
                className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                  notification.isRead
                    ? 'bg-gray-50 hover:bg-gray-100'
                    : 'bg-blue-50 hover:bg-blue-100 border-l-4 border-blue-500'
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${getNotificationIconColor(notification.type)}`}
                >
                  {getNotificationIcon(notification.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`font-medium text-sm ${notification.isRead ? 'text-[#292929]/70' : 'text-[#292929]'}`}
                    >
                      {notification.title}
                    </span>
                    {getPriorityBadge(notification.priority)}
                  </div>
                  <p
                    className={`text-xs mt-1 line-clamp-2 ${notification.isRead ? 'text-[#292929]/50' : 'text-[#292929]/70'}`}
                  >
                    {notification.message}
                  </p>
                  <span className="text-xs text-[#292929]/40 mt-1 block">
                    {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-[#292929]/60 font-poppins">
            <Bell className="h-10 w-10 mx-auto mb-2 text-[#292929]/30" />
            <p>No notifications</p>
          </div>
        )}

        {/* View All Button */}
        <Button
          variant="ghost"
          className="w-full mt-4 font-poppins"
          onClick={() => navigate('/lp/notifications')}
        >
          View All Notifications
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
}

export default NotificationsWidget;
