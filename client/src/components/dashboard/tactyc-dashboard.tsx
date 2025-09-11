/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { BarChart } from 'recharts/es6/chart/BarChart';
import { Bar } from 'recharts/es6/cartesian/Bar';
import { XAxis } from 'recharts/es6/cartesian/XAxis';
import { YAxis } from 'recharts/es6/cartesian/YAxis';
import { CartesianGrid } from 'recharts/es6/cartesian/CartesianGrid';
import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer';
import { Line } from 'recharts/es6/cartesian/Line';
import { AreaChart } from 'recharts/es6/chart/AreaChart';
import { Area } from 'recharts/es6/cartesian/Area';
import { ComposedChart } from 'recharts/es6/chart/ComposedChart';
import { useState } from "react";
import { useFundContext } from "@/contexts/FundContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { TrendingUp, Building2, Target } from "lucide-react";
import PortfolioConcentration from "./portfolio-concentration";

export default function TactycDashboard() {
  const { currentFund, isLoading } = useFundContext();
  const [viewType, setViewType] = useState("construction"); // construction | current
  const [activeTab, setActiveTab] = useState("fund");

  if (isLoading || !currentFund) {
    return (
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <div className="animate-pulse space-y-8">
          <div className="h-20 bg-gray-200 rounded-xl"></div>
          <div className="h-96 bg-gray-200 rounded-xl"></div>
        </div>
      </div>
    );
  }

  // Fund metrics calculation
  const committedCapital = currentFund.size || 200000000;
  const investableCapital = committedCapital * 1.026; // 205,311,250
  const managementFees = committedCapital * 0.15;
  const fundExpenses = committedCapital * 0.0171;
  const exitProceedsRecycled = 40000000;
  const reserveRatio = 42.5;
  const projectedInvestments = 90;
  const projectedFundValue = investableCapital * 5.41;
  const grossMultiple = 5.41;
  const tvpi = 4.48;

  const initialCapital = investableCapital * 0.575;
  const followOnCapital = investableCapital * 0.425;

  // Sample data for charts
  const investableCapitalData = [
    { name: "Pre-Seed", initial: 41062250, followOn: 20531125 },
    { name: "Seed", initial: 61593375, followOn: 30796688 },
    { name: "Series A", initial: 82124500, followOn: 41062250 },
    { name: "Warrants", initial: 0, followOn: 0 },
  ];

  const pacingData = [
    { period: "Jan 22", cumulative: 15, inPeriod: 3 },
    { period: "Apr 22", cumulative: 25, inPeriod: 5 },
    { period: "Jul 22", cumulative: 35, inPeriod: 4 },
    { period: "Oct 22", cumulative: 45, inPeriod: 6 },
    { period: "Jan 23", cumulative: 55, inPeriod: 4 },
    { period: "Apr 23", cumulative: 65, inPeriod: 5 },
    { period: "Jul 23", cumulative: 75, inPeriod: 3 },
    { period: "Oct 23", cumulative: 85, inPeriod: 4 },
    { period: "Jan 24", cumulative: 90, inPeriod: 2 },
  ];

  const capitalCallsData = [
    { period: "Jan 22", amount: 25000000, cumulative: 25000000 },
    { period: "Apr 22", amount: 20000000, cumulative: 45000000 },
    { period: "Jul 22", amount: 30000000, cumulative: 75000000 },
    { period: "Oct 22", amount: 25000000, cumulative: 100000000 },
    { period: "Jan 23", amount: 30000000, cumulative: 130000000 },
    { period: "Apr 23", amount: 25000000, cumulative: 155000000 },
    { period: "Jul 23", amount: 20000000, cumulative: 175000000 },
    { period: "Oct 23", amount: 15000000, cumulative: 190000000 },
    { period: "Jan 24", amount: 10000000, cumulative: 200000000 },
  ];

  const InvestableCapitalSummary = () => (
    <div className="space-y-8">
      {/* Header Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-white border-0 shadow-card">
          <CardContent className="p-6">
            <div className="text-center">
              <div className="text-3xl font-inter font-bold text-charcoal">
                ${(investableCapital / 1000000).toFixed(1)}M
              </div>
              <div className="text-beige/80 font-medium mt-1">
                {((investableCapital / committedCapital) * 100).toFixed(2)}%
              </div>
              <div className="text-sm text-charcoal/70 mt-2">Investable Capital</div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-card">
          <CardContent className="p-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-2xl font-inter font-bold text-charcoal">
                  ${(initialCapital / 1000000).toFixed(1)}M
                </div>
                <div className="text-beige/80 font-medium">
                  {((initialCapital / investableCapital) * 100).toFixed(2)}%
                </div>
                <div className="text-sm text-charcoal/70 mt-1">Projected Initial</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-inter font-bold text-charcoal">
                  ${(followOnCapital / 1000000).toFixed(1)}M
                </div>
                <div className="text-beige/80 font-medium">
                  {((followOnCapital / investableCapital) * 100).toFixed(2)}%
                </div>
                <div className="text-sm text-charcoal/70 mt-1">Projected Follow-On</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-card">
          <CardContent className="p-6">
            <div className="text-center">
              <div className="text-3xl font-inter font-bold text-charcoal">{projectedInvestments}</div>
              <div className="text-charcoal/70 font-medium mt-1">Projected</div>
              <div className="text-sm text-charcoal/70 mt-2">Number of Initial Investments</div>
              <div className="flex justify-center space-x-4 mt-4">
                <div className="text-center">
                  <div className="text-lg font-bold text-charcoal">27</div>
                  <div className="text-xs text-charcoal/50">By Entry Round</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-charcoal">26</div>
                  <div className="text-xs text-charcoal/50">By Allocations</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Capital Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="bg-white border-0 shadow-card">
          <CardHeader>
            <CardTitle className="text-lg font-inter text-charcoal">Investable Capital Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-charcoal/70">Committed Capital</span>
                <span className="font-mono text-charcoal">${(committedCapital / 1000000).toFixed(0)}M</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-charcoal/70">Cashless Commit</span>
                <span className="font-mono text-red-600">($0.8M)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-charcoal/70">Management Fees</span>
                <span className="font-mono text-red-600">($30.5M)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-charcoal/70">Fund Expenses</span>
                <span className="font-mono text-red-600">($3.4M)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-charcoal/70">Exit Proceeds Recycled</span>
                <span className="font-mono text-green-600">$40.0M</span>
              </div>
              <div className="border-t border-charcoal/20 pt-4">
                <div className="flex justify-between items-center font-bold">
                  <span className="text-charcoal">Total Investable</span>
                  <span className="font-mono text-charcoal">${(investableCapital / 1000000).toFixed(1)}M</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-0 shadow-card">
          <CardHeader>
            <CardTitle className="text-lg font-inter text-charcoal">Capital Allocation by Entry Round</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={investableCapitalData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f2f2f2" />
                <XAxis dataKey="name" tick={{ fill: '#292929' }} />
                <YAxis tick={{ fill: '#292929' }} tickFormatter={(value) => `$${(value / 1000000).toFixed(0)}M`} />
                <Bar dataKey="initial" fill="#292929" name="Initial Investments" />
                <Bar dataKey="followOn" fill="#E0D8D1" name="Follow-On Investments" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const PacingAnalysis = () => (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Initial Investment Pacing</CardTitle>
            <CardDescription>Number of deals by time period</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={pacingData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis />
                <Bar dataKey="inPeriod" fill="#3b82f6" name="In-Period" />
                <Line type="monotone" dataKey="cumulative" stroke="#1d4ed8" strokeWidth={2} name="Cumulative" />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Follow-On Investment Pacing</CardTitle>
            <CardDescription>Monthly deal flow analysis</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={pacingData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis />
                <Area type="monotone" dataKey="cumulative" stackId="1" stroke="#1d4ed8" fill="#3b82f6" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const CapitalCalls = () => (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Capital Call Schedule</CardTitle>
          <CardDescription>Deployment projections over fund lifetime</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="text-2xl font-bold text-blue-600">$199,200,000</div>
            <div className="text-gray-600">Total Projected</div>
          </div>
          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart data={capitalCallsData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis tickFormatter={(value) => `$${(value / 1000000).toFixed(0)}M`} />
              <Bar dataKey="amount" fill="#3b82f6" name="In Period" />
              <Line type="monotone" dataKey="cumulative" stroke="#1d4ed8" strokeWidth={3} name="Cumulative" />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-white font-poppins">
      {/* Fund Header */}
      <div className="bg-lightGray rounded-lg shadow-card border-0 p-6 mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <div>
            <h1 className="text-2xl font-inter font-bold text-charcoal">{currentFund.name}</h1>
            <div className="flex items-center space-x-8 mt-4">
              <div>
                <div className="text-sm text-charcoal/70">Capital</div>
                <div className="grid grid-cols-3 gap-6 mt-2">
                  <div>
                    <div className="text-sm font-medium text-charcoal/70">Committed</div>
                    <div className="text-lg font-bold text-charcoal">${(committedCapital / 1000000).toFixed(0)}M</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-charcoal/70">Investable</div>
                    <div className="text-lg font-bold text-charcoal">${(investableCapital / 1000000).toFixed(1)}M</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-charcoal/70">Reserve Ratio</div>
                    <div className="text-lg font-bold text-charcoal">{reserveRatio}%</div>
                  </div>
                </div>
              </div>
              <div>
                <div className="text-sm text-charcoal/70">Investments</div>
                <div className="text-lg font-bold mt-2 text-charcoal">{projectedInvestments}</div>
              </div>
              <div>
                <div className="text-sm text-charcoal/70">Fund Returns</div>
                <div className="grid grid-cols-3 gap-4 mt-2">
                  <div>
                    <div className="text-sm font-medium text-charcoal/70">Projected Fund Value</div>
                    <div className="text-lg font-bold text-charcoal">${(projectedFundValue / 1000000).toFixed(0)}M</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-charcoal/70">Gross Multiple</div>
                    <div className="text-lg font-bold text-charcoal">{grossMultiple}x</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-charcoal/70">TVPI</div>
                    <div className="text-lg font-bold text-charcoal">{tvpi}x</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Label htmlFor="view-toggle" className="text-sm font-medium text-charcoal">View Actual</Label>
              <Switch 
                id="view-toggle"
                checked={viewType === "current"} 
                onCheckedChange={(checked) => setViewType(checked ? "current" : "construction")}
              />
            </div>
            <div className="flex space-x-2">
              <Badge 
                variant={viewType === "construction" ? "default" : "secondary"}
                className={viewType === "construction" ? "bg-charcoal text-white" : "bg-white text-charcoal border-charcoal/20"}
              >
                Construction Forecast
              </Badge>
              <Badge 
                variant={viewType === "current" ? "default" : "secondary"}
                className={viewType === "current" ? "bg-charcoal text-white" : "bg-white text-charcoal border-charcoal/20"}
              >
                Current Forecast
              </Badge>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              className="border-charcoal/20 text-charcoal hover:bg-charcoal hover:text-white transition-colors"
            >
              Construction Parameters
            </Button>
          </div>
        </div>
      </div>

      {/* Main Dashboard Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="fund">Fund</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="exits">Exits</TabsTrigger>
          <TabsTrigger value="rounds">Rounds</TabsTrigger>
          <TabsTrigger value="lp">LP</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="visualizer">Visualizer</TabsTrigger>
        </TabsList>

        <TabsContent value="fund" className="space-y-6">
          <Tabs defaultValue="investable-capital" className="space-y-4">
            <TabsList>
              <TabsTrigger value="investable-capital">Investable Capital</TabsTrigger>
              <TabsTrigger value="pacing-analysis">Pacing Analysis</TabsTrigger>
              <TabsTrigger value="capital-calls">Capital Calls</TabsTrigger>
              <TabsTrigger value="commitments">Commitments</TabsTrigger>
              <TabsTrigger value="recycling">Recycling</TabsTrigger>
              <TabsTrigger value="expenses">Expenses</TabsTrigger>
              <TabsTrigger value="line-of-credit">Line of Credit</TabsTrigger>
            </TabsList>
            
            <TabsContent value="investable-capital">
              <InvestableCapitalSummary />
            </TabsContent>
            
            <TabsContent value="pacing-analysis">
              <PacingAnalysis />
            </TabsContent>
            
            <TabsContent value="capital-calls">
              <CapitalCalls />
            </TabsContent>
            
            <TabsContent value="commitments">
              <Card>
                <CardHeader>
                  <CardTitle>Commitment Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-500">LP commitment details and analysis coming soon...</p>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="recycling">
              <Card>
                <CardHeader>
                  <CardTitle>Exit Proceeds Recycling</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-500">Recycling analysis and management tools...</p>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="expenses">
              <Card>
                <CardHeader>
                  <CardTitle>Fund Expenses</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-500">Expense tracking and budget management...</p>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="line-of-credit">
              <Card>
                <CardHeader>
                  <CardTitle>Line of Credit</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-500">Credit facility management and utilization...</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="performance">
          <Card>
            <CardHeader>
              <CardTitle>Fund Performance Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-500">Performance metrics and analysis coming soon...</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exits">
          <Card>
            <CardHeader>
              <CardTitle>Exit Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-500">Exit performance and distribution analysis...</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rounds">
          <Card>
            <CardHeader>
              <CardTitle>Round Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-500">Investment round tracking and analysis...</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lp">
          <Card>
            <CardHeader>
              <CardTitle>Limited Partner Dashboard</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-500">LP reporting and relationship management...</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Portfolio Concentration */}
            <PortfolioConcentration />
            
            {/* Additional Insights Components */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-medium">Performance Insights</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                    <div>
                      <p className="font-medium text-blue-900">Top Performing Sector</p>
                      <p className="text-sm text-blue-700">SaaS companies showing 3.2x average MOIC</p>
                    </div>
                    <TrendingUp className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <div>
                      <p className="font-medium text-green-900">Geographic Performance</p>
                      <p className="text-sm text-green-700">SF Bay Area leading with 28% portfolio value</p>
                    </div>
                    <Building2 className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                    <div>
                      <p className="font-medium text-amber-900">Stage Distribution</p>
                      <p className="text-sm text-amber-700">42% concentrated in Seed stage investments</p>
                    </div>
                    <Target className="h-5 w-5 text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="visualizer">
          <Card>
            <CardHeader>
              <CardTitle>Data Visualizer</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-500">Interactive data visualization tools...</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
