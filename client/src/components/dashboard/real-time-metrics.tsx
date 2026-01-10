import { useEffect, useState } from 'react';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, DollarSign, Target, PieChart, Activity } from 'lucide-react';
import type { IconComponent } from '@/types/icons';

interface MetricItem {
  label: string;
  value: string;
  change: string;
  trend: 'up' | 'down' | 'stable';
  icon: IconComponent;
}

export default function RealTimeMetrics() {
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [isLive, _setIsLive] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdate(new Date());
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const metrics: MetricItem[] = [
    {
      label: 'Total AUM',
      value: '$100.0M',
      change: '+2.4%',
      trend: 'up',
      icon: DollarSign,
    },
    {
      label: 'Deployed Capital',
      value: '$67.5M',
      change: '+5.2%',
      trend: 'up',
      icon: Target,
    },
    {
      label: 'Portfolio Companies',
      value: '15',
      change: '+2',
      trend: 'up',
      icon: PieChart,
    },
    {
      label: 'Current IRR',
      value: '28.4%',
      change: '+1.2%',
      trend: 'up',
      icon: TrendingUp,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Real-Time Metrics</h3>
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500' : 'bg-gray-400'}`} />
          <span className="text-sm text-muted-foreground">
            Last updated: {lastUpdate.toLocaleTimeString()}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric, index) => (
          <Card key={index} className="hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {metric.label}
                </CardTitle>
                <metric.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold">{metric.value}</div>
                <div className="flex items-center space-x-2">
                  <Badge
                    variant={
                      metric.trend === 'up'
                        ? 'default'
                        : metric.trend === 'down'
                          ? 'destructive'
                          : 'secondary'
                    }
                    className="text-xs"
                  >
                    {metric.trend === 'up' ? (
                      <TrendingUp className="h-3 w-3 mr-1" />
                    ) : metric.trend === 'down' ? (
                      <TrendingDown className="h-3 w-3 mr-1" />
                    ) : (
                      <Activity className="h-3 w-3 mr-1" />
                    )}
                    {metric.change}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
