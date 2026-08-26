import { useAIUsage } from '@/hooks/useAI';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AlertCircle } from 'lucide-react';

export function AIUsageWidget() {
  const { data: usage, isLoading } = useAIUsage();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  if (!usage) return null;

  const percentUsed = (usage.calls_today / usage.limit) * 100;
  const isNearLimit = percentUsed >= 80;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>AI Usage Today</span>
          {isNearLimit && (
            <AlertCircle className="h-5 w-5 text-amber-500" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline justify-between">
          <span className="text-3xl font-bold">{usage.calls_today}</span>
          <span className="text-sm text-muted-foreground">/ {usage.limit} calls</span>
        </div>

        <Progress value={percentUsed} className="h-2" />

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Remaining</p>
            <p className="font-medium">{usage.remaining} calls</p>
          </div>
          <div>
            <p className="text-muted-foreground">Cost</p>
            <p className="font-medium">${usage.total_cost_usd.toFixed(4)}</p>
          </div>
        </div>

        {isNearLimit && (
          <p className="text-sm text-amber-600">
            Approaching daily limit. Consider increasing AI_DAILY_CALL_LIMIT.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
