/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import InvestableCapitalSummary from "@/components/forecasting/investable-capital-summary";
import ProjectedPerformance from "@/components/forecasting/projected-performance";
import PortfolioInsights from "@/components/forecasting/portfolio-insights";
import AllocationModeling from "@/components/forecasting/allocation-modeling";
import PortfolioFlowChart from "@/components/forecasting/portfolio-flow-chart";
import { 
  TrendingUp, 
  BarChart3, 
  PieChart, 
  Target,
  Calendar,
  DollarSign
} from "lucide-react";

export default function ForecastingPage() {
  const { data: funds } = useQuery({
    queryKey: ["/api/funds"],
  });

  // Use first fund or default data
  const fund = (Array.isArray(funds) ? funds[0]! : null) || {
    id: "1",
    name: "Press On Ventures Fund I",
    size: 55000000,
    investableCapital: 50000000
  };

  // Enhanced Deal-Level + Fund-Level Forecasting with Current Forecast Logic
  const generateDealLevelForecasts = () => {
    const portfolioCompanies = [
      {
        company: "TechCorp",
        currentRound: "Series A",
        historicalRounds: ["Seed ($1.5M)", "Series A ($3M)"],
        projectedRounds: [
          { round: "Series B", graduationRate: 0.7, checkSize: 1050000, ownership: "4.2%→3.8%" },
          { round: "Series C", graduationRate: 0.65, checkSize: 2500000, ownership: "3.8%→3.5%" }
        ],
        riskWeightedScenarios: {
          downside: { probability: 0.25, exitMOIC: 1.5, proceeds: 4200000 },
          base: { probability: 0.50, exitMOIC: 3.0, proceeds: 15600000 },
          upside: { probability: 0.25, exitMOIC: 8.0, proceeds: 45200000 }
        },
        expectedProceeds: 18200000, // Probability-weighted
        expectedMOIC: 2.3,
        reserveEfficiency: 3.5
      },
      {
        company: "FinanceAI",
        currentRound: "Seed",
        historicalRounds: ["Seed ($2M)"],
        projectedRounds: [
          { round: "Series A", graduationRate: 0.5, checkSize: 800000, ownership: "3.1%→2.8%" },
          { round: "Series B", graduationRate: 0.6, checkSize: 1800000, ownership: "2.8%→2.5%" }
        ],
        riskWeightedScenarios: {
          downside: { probability: 0.30, exitMOIC: 1.2, proceeds: 2800000 },
          base: { probability: 0.50, exitMOIC: 4.0, proceeds: 12800000 },
          upside: { probability: 0.20, exitMOIC: 10.0, proceeds: 32000000 }
        },
        expectedProceeds: 14400000,
        expectedMOIC: 4.5,
        reserveEfficiency: 4.2
      }
    ];

    // Fund-Level Aggregation from Deal-Level Forecasts
    const totalExpectedProceeds = portfolioCompanies.reduce((sum: any, co: any) => sum + co.expectedProceeds, 0);
    const totalInvested = portfolioCompanies.reduce((sum: any, _co: any) => sum + 4500000, 0); // Sample invested amounts
    const fundLevelMOIC = totalExpectedProceeds / totalInvested;
    
    return {
      portfolioCompanies,
      fundLevel: {
        totalExpectedProceeds,
        totalInvested,
        fundLevelMOIC,
        averageReserveEfficiency: portfolioCompanies.reduce((sum: any, co: any) => sum + co.reserveEfficiency, 0) / portfolioCompanies.length
      },
      investmentCycle: 36, // months
      monthlyInvestmentRate: 1.2, // deals per month
      totalDeals: 45 // total portfolio companies
    };
  };

  const forecastingData = generateDealLevelForecasts();

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Fund Forecasting</h1>
          <p className="text-muted-foreground">
            Portfolio construction modeling based on Tactyc methodology
          </p>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2">
          {fund.name}
        </Badge>
      </div>

      {/* Fund Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fund Size</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(fund.size / 1000000).toFixed(0)}M</div>
            <p className="text-xs text-muted-foreground">
              Total committed capital
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Investable Capital</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(fund.investableCapital / 1000000).toFixed(0)}M</div>
            <p className="text-xs text-muted-foreground">
              Net of fees and expenses
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Investment Cycle</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{forecastingData.investmentCycle} months</div>
            <p className="text-xs text-muted-foreground">
              Portfolio construction period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{forecastingData.monthlyInvestmentRate}</div>
            <p className="text-xs text-muted-foreground">
              Deals per month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Forecasting Interface */}
      <Tabs defaultValue="capital" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="capital" className="flex items-center space-x-2">
            <DollarSign className="h-4 w-4" />
            <span>Capital Summary</span>
          </TabsTrigger>
          <TabsTrigger value="performance" className="flex items-center space-x-2">
            <TrendingUp className="h-4 w-4" />
            <span>Performance</span>
          </TabsTrigger>
          <TabsTrigger value="insights" className="flex items-center space-x-2">
            <PieChart className="h-4 w-4" />
            <span>Portfolio Insights</span>
          </TabsTrigger>
          <TabsTrigger value="flow-model" className="flex items-center space-x-2">
            <BarChart3 className="h-4 w-4" />
            <span>Flow Model</span>
          </TabsTrigger>
          <TabsTrigger value="allocation-model" className="flex items-center space-x-2">
            <Target className="h-4 w-4" />
            <span>Allocation</span>
          </TabsTrigger>
        </TabsList>

        {/* Capital Summary Tab */}
        <TabsContent value="capital">
          <InvestableCapitalSummary />
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance">
          <ProjectedPerformance />
        </TabsContent>

        {/* Portfolio Insights Tab */}
        <TabsContent value="insights">
          <PortfolioInsights />
        </TabsContent>

        {/* Portfolio Flow Tab */}
        <TabsContent value="flow-model">
          <PortfolioFlowChart 
            fundData={{
              id: fund.id,
              name: fund.name,
              totalDeals: forecastingData.totalDeals,
              monthlyInvestmentRate: forecastingData.monthlyInvestmentRate
            }}
          />
        </TabsContent>

        {/* Allocation Model Tab */}
        <TabsContent value="allocation-model">
          <AllocationModeling 
            fundData={{
              id: fund.id,
              name: fund.name,
              size: fund.size,
              investableCapital: fund.investableCapital
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
