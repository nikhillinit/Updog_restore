/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, 
  Target, 
  Calculator, 
  BarChart3, 
  AlertTriangle,
  CheckCircle,
  Activity,
  Clock,
  DollarSign,
  Users,
  ArrowUp,
  ArrowDown
} from "lucide-react";
import { useFundContext } from "@/contexts/FundContext";

interface DataDrivenInsightsProps {
  className?: string;
}

export function DataDrivenInsights({ className }: DataDrivenInsightsProps) {
  const { currentFund } = useFundContext();

  // Sample data for the six workflows
  const workflowInsights = {
    currentForecast: {
      status: "active",
      lastUpdated: "2 days ago",
      tvpiProjected: 3.40,
      tvpiActual: 1.73,
      variance: "+98%"
    },
    pacing: {
      dealsPaced: 21,
      dealsProjected: 79,
      capitalDeployed: 0.42, // 42%
      onTrack: true
    },
    scenarios: {
      portfolioCompanies: 15,
      scenariosBuilt: 12,
      averageCases: 4.2,
      lastReview: "1 week ago"
    },
    reserves: {
      totalReserves: 4902365,
      topOpportunity: "Metaflux",
      topMOIC: 3.53,
      rankingComplete: true
    },
    partialSales: {
      opportunities: 9,
      attractiveDeals: 4,
      avgPremium: -8.2,
      dpiPotential: 850000
    },
    kpis: {
      companiesTracked: 15,
      metricsCollected: 47,
      revMultiple: 12.4,
      lastSync: "Today"
    }
  };

  const workflows = [
    {
      id: 1,
      title: "Current Fund Forecast",
      description: "Live forward-looking view combining actual investments and construction projections",
      status: workflowInsights.currentForecast.status,
      metrics: [
        { label: "Projected TVPI", value: `${workflowInsights.currentForecast.tvpiProjected}x`, trend: "up" },
        { label: "Actual TVPI", value: `${workflowInsights.currentForecast.tvpiActual}x`, trend: "up" },
        { label: "Variance", value: workflowInsights.currentForecast.variance, trend: "up" }
      ],
      lastUpdated: workflowInsights.currentForecast.lastUpdated,
      icon: TrendingUp,
      color: "blue",
      route: "/forecasting"
    },
    {
      id: 2,
      title: "Pacing & Course Corrections",
      description: "Track deployment pacing, market conditions, and investment terms vs projections",
      status: workflowInsights.pacing.onTrack ? "on-track" : "needs-attention",
      metrics: [
        { label: "Deals Made", value: workflowInsights.pacing.dealsPaced.toString(), trend: "neutral" },
        { label: "Projected Total", value: workflowInsights.pacing.dealsProjected.toString(), trend: "neutral" },
        { label: "Capital Deployed", value: `${(workflowInsights.pacing.capitalDeployed * 100).toFixed(0)}%`, trend: "up" }
      ],
      lastUpdated: "Real-time",
      icon: Target,
      color: "green",
      route: "/forecasting"
    },
    {
      id: 3,
      title: "Scenario Analysis",
      description: "Risk-weighted scenarios for each deal with Base/Upside/Downside cases",
      status: "active",
      metrics: [
        { label: "Companies", value: workflowInsights.scenarios.portfolioCompanies.toString(), trend: "neutral" },
        { label: "Scenarios Built", value: workflowInsights.scenarios.scenariosBuilt.toString(), trend: "up" },
        { label: "Avg Cases/Deal", value: workflowInsights.scenarios.averageCases.toFixed(1), trend: "neutral" }
      ],
      lastUpdated: workflowInsights.scenarios.lastReview,
      icon: BarChart3,
      color: "purple",
      route: "/scenario-builder"
    },
    {
      id: 4,
      title: "Optimal Reserves",
      description: "Follow-on MOIC analysis ranking portfolio companies by expected return on next $1",
      status: "optimized",
      metrics: [
        { label: "Total Reserves", value: `$${(workflowInsights.reserves.totalReserves / 1000000).toFixed(1)}M`, trend: "neutral" },
        { label: "Top Opportunity", value: workflowInsights.reserves.topOpportunity, trend: "up" },
        { label: "Follow-on MOIC", value: `${workflowInsights.reserves.topMOIC}x`, trend: "up" }
      ],
      lastUpdated: "Daily refresh",
      icon: Calculator,
      color: "orange",
      route: "/planning"
    },
    {
      id: 5,
      title: "Partial Sales (DPI)",
      description: "Convert RVPI to DPI opportunistically with minimum IRR-accretive valuations",
      status: "opportunities",
      metrics: [
        { label: "Opportunities", value: workflowInsights.partialSales.opportunities.toString(), trend: "neutral" },
        { label: "Attractive Sales", value: workflowInsights.partialSales.attractiveDeals.toString(), trend: "up" },
        { label: "Avg Premium", value: `${workflowInsights.partialSales.avgPremium}%`, trend: "down" }
      ],
      lastUpdated: "Weekly analysis",
      icon: DollarSign,
      color: "emerald",
      route: "/partial-sales"
    },
    {
      id: 6,
      title: "KPI Tracking",
      description: "Portfolio company performance metrics for actionable insights and benchmarking",
      status: "current",
      metrics: [
        { label: "Companies", value: workflowInsights.kpis.companiesTracked.toString(), trend: "neutral" },
        { label: "Metrics", value: workflowInsights.kpis.metricsCollected.toString(), trend: "up" },
        { label: "Rev Multiple", value: `${workflowInsights.kpis.revMultiple}x`, trend: "up" }
      ],
      lastUpdated: workflowInsights.kpis.lastSync,
      icon: Activity,
      color: "indigo",
      route: "/analytics"
    }
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
      case "optimized":
      case "current":
        return <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>;
      case "on-track":
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200">On Track</Badge>;
      case "opportunities":
        return <Badge className="bg-orange-100 text-orange-800 border-orange-200">Opportunities</Badge>;
      case "needs-attention":
        return <Badge className="bg-red-100 text-red-800 border-red-200">Needs Attention</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "up":
        return <ArrowUp className="h-3 w-3 text-green-600" />;
      case "down":
        return <ArrowDown className="h-3 w-3 text-red-600" />;
      default:
        return null;
    }
  };

  return (
    <div className={className}>
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Data-Driven Fund Management</h2>
        <p className="text-muted-foreground">
          Six core workflows that successful data-driven venture managers follow consistently
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {workflows.map((workflow) => {
          const IconComponent = workflow.icon;
          return (
            <Card key={workflow.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className={`p-2 rounded-lg bg-${workflow.color}-100`}>
                      <IconComponent className={`h-4 w-4 text-${workflow.color}-600`} />
                    </div>
                    <span className="font-semibold text-sm">{workflow.id}</span>
                  </div>
                  {getStatusBadge(workflow.status)}
                </div>
                <CardTitle className="text-lg">{workflow.title}</CardTitle>
                <CardDescription className="text-sm">
                  {workflow.description}
                </CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* Metrics */}
                <div className="grid grid-cols-1 gap-2">
                  {workflow.metrics.map((metric, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{metric.label}</span>
                      <div className="flex items-center space-x-1">
                        <span className="font-medium text-sm">{metric.value}</span>
                        {getTrendIcon(metric.trend)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Last Updated */}
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                  <div className="flex items-center space-x-1">
                    <Clock className="h-3 w-3" />
                    <span>Updated {workflow.lastUpdated}</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 text-xs px-2"
                    onClick={() => window.location.href = workflow.route}
                  >
                    View →
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Summary Insights */}
      <Card className="mt-6 border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-blue-900">
            <CheckCircle className="h-5 w-5" />
            <span>Data-Driven Maturity Score</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-700">5/6</div>
              <div className="text-sm text-blue-600">Workflows Active</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-700">88%</div>
              <div className="text-sm text-blue-600">Data Coverage</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-700">A-</div>
              <div className="text-sm text-blue-600">Maturity Grade</div>
            </div>
          </div>
          <p className="text-sm text-blue-800 mt-4">
            Your fund demonstrates strong data-driven practices. Consider enhancing KPI automation 
            and increasing scenario review frequency to achieve full optimization.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
