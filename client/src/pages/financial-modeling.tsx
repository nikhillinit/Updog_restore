 
 
 
 
 
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// Chart libraries removed for bundle optimization
const ChartPlaceholder = ({ title, height = "h-80" }: { title: string; height?: string }) => (
  <div className={`${height} bg-gray-50 rounded-lg flex flex-col items-center justify-center`}>
    <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-4">
      <Calculator className="h-8 w-8 text-gray-400" />
    </div>
    <p className="text-gray-500 font-medium">{title}</p>
    <p className="text-gray-400 text-sm mt-1">Chart placeholder - data available via API</p>
  </div>
);
import { useState } from "react";
import { Calculator, TrendingUp, DollarSign, Target } from "lucide-react";
import DualForecastDashboard from '@/components/dashboard/dual-forecast-dashboard';
import { ErrorBoundary } from '@/components/ui/error-boundary';

const projectionData = [
  { year: '2024', investment: 25, exits: 0, nav: 125, irr: 15.2 },
  { year: '2025', investment: 35, exits: 5, nav: 180, irr: 22.8 },
  { year: '2026', investment: 20, exits: 15, nav: 220, irr: 28.5 },
  { year: '2027', investment: 15, exits: 35, nav: 280, irr: 35.2 },
  { year: '2028', investment: 5, exits: 45, nav: 320, irr: 38.7 },
];

const cohortData = [
  { cohort: '2020', invested: 45, currentValue: 125, projectedValue: 180, irr: 42.1 },
  { cohort: '2021', invested: 38, currentValue: 89, projectedValue: 145, irr: 35.8 },
  { cohort: '2022', invested: 32, currentValue: 55, projectedValue: 98, irr: 28.4 },
  { cohort: '2023', invested: 28, currentValue: 35, projectedValue: 78, irr: 22.9 },
];

const scenarioData = {
  conservative: { totalReturns: 2.8, irr: 22.5, dpi: 1.8 },
  base: { totalReturns: 3.5, irr: 28.4, dpi: 2.2 },
  optimistic: { totalReturns: 4.8, irr: 35.7, dpi: 2.9 },
};

export default function FinancialModeling() {
  const [selectedScenario, setSelectedScenario] = useState('base');
  const [selectedCohort, setSelectedCohort] = useState('all');

  return (
    <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Financial Modeling & Forecasting</h1>
        <p className="text-muted-foreground mt-2">
          Advanced scenario planning with live fund performance data
        </p>
      </div>

      <Tabs defaultValue="forecast" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="forecast">Live Forecasting</TabsTrigger>
          <TabsTrigger value="modeling">Scenario Modeling</TabsTrigger>
        </TabsList>
        
        <TabsContent value="forecast">
          <ErrorBoundary>
            <DualForecastDashboard />
          </ErrorBoundary>
        </TabsContent>
        
        <TabsContent value="modeling">
      {/* Key Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Projected IRR</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">28.4%</p>
                <p className="text-green-600 text-sm mt-1">Above target</p>
              </div>
              <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Total Multiple</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">3.5x</p>
                <p className="text-green-600 text-sm mt-1">Base case</p>
              </div>
              <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                <Calculator className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">DPI Target</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">2.2x</p>
                <p className="text-blue-600 text-sm mt-1">Expected</p>
              </div>
              <div className="w-12 h-12 bg-cyan-50 rounded-lg flex items-center justify-center">
                <Target className="h-6 w-6 text-cyan-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Reserve Ratio</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">35%</p>
                <p className="text-orange-600 text-sm mt-1">Follow-on ready</p>
              </div>
              <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fund Projection Model */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-gray-800">
              Fund Projection Model
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartPlaceholder title="Fund Projection Model Area Chart" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold text-gray-800">
                Cohort Analysis
              </CardTitle>
              <Select value={selectedCohort} onValueChange={setSelectedCohort}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cohorts</SelectItem>
                  <SelectItem value="2020">2020</SelectItem>
                  <SelectItem value="2021">2021</SelectItem>
                  <SelectItem value="2022">2022</SelectItem>
                  <SelectItem value="2023">2023</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <ChartPlaceholder title="Cohort Analysis Bar Chart" />
          </CardContent>
        </Card>
      </div>

      {/* Scenario Analysis */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold text-gray-800">
              Scenario Analysis
            </CardTitle>
            <Select value={selectedScenario} onValueChange={setSelectedScenario}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="conservative">Conservative</SelectItem>
                <SelectItem value="base">Base Case</SelectItem>
                <SelectItem value="optimistic">Optimistic</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Object.entries(scenarioData).map(([scenario, metrics]) => (
              <div 
                key={scenario}
                className={`p-6 rounded-lg border-2 transition-colors ${
                  selectedScenario === scenario 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                <h4 className="font-semibold text-gray-800 capitalize mb-4">{scenario}</h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Returns:</span>
                    <span className="font-medium">{metrics.totalReturns}x</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Net IRR:</span>
                    <span className="font-medium">{metrics.irr}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">DPI:</span>
                    <span className="font-medium">{metrics.dpi}x</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Reserve Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-800">
            Reserve Analysis & Follow-on Strategy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="font-medium text-gray-800">Reserve Allocation</h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-gray-700">Follow-on Reserve:</span>
                  <span className="font-semibold">$35M (35%)</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-gray-700">Deployed Reserves:</span>
                  <span className="font-semibold">$12M (34%)</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                  <span className="text-gray-700">Available Reserves:</span>
                  <span className="font-semibold text-green-600">$23M (66%)</span>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <h4 className="font-medium text-gray-800">Follow-on Strategy</h4>
              <div className="space-y-3 text-sm">
                <p className="text-gray-600">
                  • Target 2-3x follow-on investments in top quartile performers
                </p>
                <p className="text-gray-600">
                  • Reserve 35% of fund size for follow-on rounds
                </p>
                <p className="text-gray-600">
                  • Maintain pro-rata rights in Series B+ rounds
                </p>
                <p className="text-gray-600">
                  • Deploy reserves over 3-4 year period post initial investment
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </main>
  );
}

