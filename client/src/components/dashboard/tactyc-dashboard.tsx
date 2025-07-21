import { useState } from "react";
import { useFundContext } from "@/contexts/FundContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, ComposedChart } from "recharts";
import { TrendingUp, Building2, DollarSign, Target, Calendar, Users, ArrowUpRight, ArrowDownRight, Info } from "lucide-react";
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
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-700">
                ${(investableCapital / 1000000).toFixed(1)}M
              </div>
              <div className="text-blue-600 font-medium mt-1">
                {((investableCapital / committedCapital) * 100).toFixed(2)}%
              </div>
              <div className="text-sm text-blue-600 mt-2">Investable Capital</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-800">
                  ${(initialCapital / 1000000).toFixed(1)}M
                </div>
                <div className="text-blue-600 font-medium">
                  {((initialCapital / investableCapital) * 100).toFixed(2)}%
                </div>
                <div className="text-sm text-gray-600 mt-1">Projected Initial</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-800">
                  ${(followOnCapital / 1000000).toFixed(1)}M
                </div>
                <div className="text-blue-600 font-medium">
                  {((followOnCapital / investableCapital) * 100).toFixed(2)}%
                </div>
                <div className="text-sm text-gray-600 mt-1">Projected Follow-On</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-800">{projectedInvestments}</div>
              <div className="text-gray-600 font-medium mt-1">Projected</div>
              <div className="text-sm text-gray-600 mt-2">Number of Initial Investments</div>
              <div className="flex justify-center space-x-4 mt-4">
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-700">27</div>
                  <div className="text-xs text-gray-500">By Entry Round</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-gray-700">26</div>
                  <div className="text-xs text-gray-500">By Allocations</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Capital Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Investable Capital Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Committed Capital</span>
                <span className="font-mono">${(committedCapital / 1000000).toFixed(0)}M</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Cashless Commit</span>
                <span className="font-mono text-red-600">($0.8M)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Management Fees</span>
                <span className="font-mono text-red-600">($30.5M)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Fund Expenses</span>
                <span className="font-mono text-red-600">($3.4M)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Exit Proceeds Recycled</span>
                <span className="font-mono text-green-600">$40.0M</span>
              </div>
              <div className="border-t pt-4">
                <div className="flex justify-between items-center font-bold">
                  <span>Total Investable</span>
                  <span className="font-mono">${(investableCapital / 1000000).toFixed(1)}M</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Capital Allocation by Entry Round</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={investableCapitalData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(value) => `$${(value / 1000000).toFixed(0)}M`} />
                <Bar dataKey="initial" fill="#3b82f6" name="Initial Investments" />
                <Bar dataKey="followOn" fill="#1d4ed8" name="Follow-On Investments" />
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
    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
      {/* Fund Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{currentFund.name}</h1>
            <div className="flex items-center space-x-8 mt-4">
              <div>
                <div className="text-sm text-gray-500">Capital</div>
                <div className="grid grid-cols-3 gap-6 mt-2">
                  <div>
                    <div className="text-sm font-medium text-gray-600">Committed</div>
                    <div className="text-lg font-bold">${(committedCapital / 1000000).toFixed(0)}M</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-600">Investable</div>
                    <div className="text-lg font-bold">${(investableCapital / 1000000).toFixed(1)}M</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-600">Reserve Ratio</div>
                    <div className="text-lg font-bold">{reserveRatio}%</div>
                  </div>
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Investments</div>
                <div className="text-lg font-bold mt-2">{projectedInvestments}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Fund Returns</div>
                <div className="grid grid-cols-3 gap-4 mt-2">
                  <div>
                    <div className="text-sm font-medium text-gray-600">Projected Fund Value</div>
                    <div className="text-lg font-bold">${(projectedFundValue / 1000000).toFixed(0)}M</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-600">Gross Multiple</div>
                    <div className="text-lg font-bold">{grossMultiple}x</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-600">TVPI</div>
                    <div className="text-lg font-bold">{tvpi}x</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Label htmlFor="view-toggle" className="text-sm font-medium">View Actual</Label>
              <Switch 
                id="view-toggle"
                checked={viewType === "current"} 
                onCheckedChange={(checked) => setViewType(checked ? "current" : "construction")}
              />
            </div>
            <div className="flex space-x-2">
              <Badge variant={viewType === "construction" ? "default" : "secondary"}>
                Construction Forecast
              </Badge>
              <Badge variant={viewType === "current" ? "default" : "secondary"}>
                Current Forecast
              </Badge>
            </div>
            <Button variant="outline" size="sm">
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