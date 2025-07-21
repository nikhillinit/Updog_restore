import { Card, CardContent } from "@/components/ui/card";
import { DollarSign, TrendingUp, Building, Percent } from "lucide-react";
import type { FundMetrics } from "@/types/fund";

interface MetricCardsProps {
  fundData?: {
    fund: {
      size: string;
      deployedCapital: string;
    };
    summary: {
      totalCompanies: number;
      deploymentRate: number;
      currentIRR: number;
    };
  };
}

export default function MetricCards({ fundData }: MetricCardsProps) {
  if (!fundData) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="animate-pulse">
            <CardContent className="pt-6">
              <div className="h-20 bg-gray-200 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const metrics: FundMetrics[] = [
    {
      label: "Total Fund Size",
      value: `$${(parseFloat(fundData.fund.size) / 1000000).toFixed(0)}M`,
      change: "+12.5%",
      changeType: "positive",
      icon: "dollar",
      color: "blue"
    },
    {
      label: "Deployed Capital", 
      value: `$${(parseFloat(fundData.fund.deployedCapital) / 1000000).toFixed(1)}M`,
      change: `${fundData.summary.deploymentRate.toFixed(1)}%`,
      changeType: "positive",
      icon: "trending",
      color: "cyan"
    },
    {
      label: "Portfolio Companies",
      value: fundData.summary.totalCompanies.toString(),
      change: "+3",
      changeType: "positive", 
      icon: "building",
      color: "green"
    },
    {
      label: "Current IRR",
      value: `${fundData.summary.currentIRR.toFixed(1)}%`,
      change: "+2.1%",
      changeType: "positive",
      icon: "percent",
      color: "orange"
    }
  ];

  const getIcon = (iconType: string) => {
    switch (iconType) {
      case 'dollar': return DollarSign;
      case 'trending': return TrendingUp;
      case 'building': return Building;
      case 'percent': return Percent;
      default: return DollarSign;
    }
  };

  const getIconColor = (color: string) => {
    switch (color) {
      case 'blue': return 'text-blue-500 bg-blue-50';
      case 'cyan': return 'text-cyan-500 bg-cyan-50';
      case 'green': return 'text-green-500 bg-green-50';
      case 'orange': return 'text-orange-500 bg-orange-50';
      default: return 'text-blue-500 bg-blue-50';
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {metrics.map((metric, index) => {
        const Icon = getIcon(metric.icon);
        const iconColorClass = getIconColor(metric.color);
        
        return (
          <Card key={index} className="border border-gray-200">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 text-sm font-medium">
                    {metric.label}
                  </p>
                  <p className="text-2xl font-bold text-gray-800 mt-1">
                    {metric.value}
                  </p>
                  <div className="flex items-center mt-2">
                    <span className="text-green-600 text-sm font-medium">
                      {metric.change}
                    </span>
                    <span className="text-gray-500 text-xs ml-1">
                      vs last quarter
                    </span>
                  </div>
                </div>
                <div className={`w-12 h-12 ${iconColorClass} rounded-lg flex items-center justify-center`}>
                  <Icon className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
