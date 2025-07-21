import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUp, FileCheck, TrendingUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Activity {
  id: number;
  type: string;
  title: string;
  description: string | null;
  amount: string | null;
  activityDate: string;
}

interface RecentActivityProps {
  activities?: Activity[];
}

export default function RecentActivity({ activities = [] }: RecentActivityProps) {
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'investment': return ArrowUp;
      case 'milestone': return FileCheck;
      case 'update': return TrendingUp;
      default: return ArrowUp;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'investment': return 'bg-blue-500';
      case 'milestone': return 'bg-cyan-500';
      case 'update': return 'bg-green-500';
      default: return 'bg-blue-500';
    }
  };

  const formatAmount = (amount: string | null, type: string) => {
    if (!amount) return null;
    const value = parseFloat(amount) / 1000000;
    if (type === 'investment') {
      return `+$${value.toFixed(1)}M`;
    }
    return `$${value.toFixed(1)}M`;
  };

  if (activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-800">
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <p>No recent activities to display</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-gray-800">
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map((activity) => {
            const Icon = getActivityIcon(activity.type);
            const iconColorClass = getActivityColor(activity.type);
            const formattedAmount = formatAmount(activity.amount, activity.type);
            
            return (
              <div key={activity.id} className="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg">
                <div className={`w-10 h-10 ${iconColorClass} rounded-full flex items-center justify-center flex-shrink-0`}>
                  <Icon className="text-white h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800">{activity.title}</p>
                  {activity.description && (
                    <p className="text-sm text-gray-600 mt-1">{activity.description}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-2">
                    {formatDistanceToNow(new Date(activity.activityDate), { addSuffix: true })}
                  </p>
                </div>
                {formattedAmount && (
                  <span className="text-sm font-medium text-green-600 flex-shrink-0">
                    {formattedAmount}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
