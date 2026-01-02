/* eslint-disable @typescript-eslint/no-explicit-any */
 
 
 
 
import { BarChart } from 'recharts/es6/chart/BarChart';
import { Bar } from 'recharts/es6/cartesian/Bar';
import { XAxis } from 'recharts/es6/cartesian/XAxis';
import { YAxis } from 'recharts/es6/cartesian/YAxis';
import { CartesianGrid } from 'recharts/es6/cartesian/CartesianGrid';
import { Tooltip } from 'recharts/es6/component/Tooltip';
import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer';
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Target,
  Info,
  BarChart3,
  Building2
} from "lucide-react";

interface ReturnTheFundData {
  round: string;
  roundPercent: number;
  investmentAmount: number;
  resultingOwnership: number;
  returnTheFund: number;
  exitOwnership: number;
  exitFMV: number;
  exitMOIC: number;
}

interface OwnershipData {
  round: string;
  ownership: number;
  returnTheFund: number;
}

export default function ReturnTheFundPage() {
  const [selectedInvestment, setSelectedInvestment] = useState<string>("series-a");
  const [selectedRound, _setSelectedRound] = useState<string>("series-b");
  const [reserveAmount, setReserveAmount] = useState<number[]>([375000]);
  const [activeTab, setActiveTab] = useState<'construction' | 'portfolio' | 'reserves'>('construction');

  // Sample Return the Fund data for Series B optimization
  const returnTheFundData: ReturnTheFundData[] = [
    {
      round: "0.00%",
      roundPercent: 0.0,
      investmentAmount: 0,
      resultingOwnership: 4.71,
      returnTheFund: 3183,
      exitOwnership: 3.31,
      exitFMV: 7.6,
      exitMOIC: 3.34
    },
    {
      round: "2.50%",
      roundPercent: 2.5,
      investmentAmount: 75000,
      resultingOwnership: 4.80,
      returnTheFund: 3127,
      exitOwnership: 3.36,
      exitFMV: 7.8,
      exitMOIC: 3.29
    },
    {
      round: "5.00%",
      roundPercent: 5.0,
      investmentAmount: 150000,
      resultingOwnership: 4.88,
      returnTheFund: 3072,
      exitOwnership: 3.42,
      exitFMV: 7.9,
      exitMOIC: 3.24
    },
    {
      round: "7.50%",
      roundPercent: 7.5,
      investmentAmount: 225000,
      resultingOwnership: 4.97,
      returnTheFund: 3020,
      exitOwnership: 3.47,
      exitFMV: 8.0,
      exitMOIC: 3.19
    },
    {
      round: "10.00%",
      roundPercent: 10.0,
      investmentAmount: 300000,
      resultingOwnership: 5.05,
      returnTheFund: 2969,
      exitOwnership: 3.53,
      exitFMV: 8.1,
      exitMOIC: 3.15
    },
    {
      round: "12.50%",
      roundPercent: 12.5,
      investmentAmount: 375000,
      resultingOwnership: 5.14,
      returnTheFund: 2920,
      exitOwnership: 3.58,
      exitFMV: 8.3,
      exitMOIC: 3.11
    },
    {
      round: "15.00%",
      roundPercent: 15.0,
      investmentAmount: 450000,
      resultingOwnership: 5.22,
      returnTheFund: 2873,
      exitOwnership: 3.63,
      exitFMV: 8.4,
      exitMOIC: 3.07
    },
    {
      round: "17.50%",
      roundPercent: 17.5,
      investmentAmount: 525000,
      resultingOwnership: 5.31,
      returnTheFund: 2827,
      exitOwnership: 3.69,
      exitFMV: 8.5,
      exitMOIC: 3.03
    },
    {
      round: "20.00%",
      roundPercent: 20.0,
      investmentAmount: 600000,
      resultingOwnership: 5.39,
      returnTheFund: 2782,
      exitOwnership: 3.74,
      exitFMV: 8.6,
      exitMOIC: 2.99
    },
    {
      round: "22.50%",
      roundPercent: 22.5,
      investmentAmount: 675000,
      resultingOwnership: 5.48,
      returnTheFund: 2739,
      exitOwnership: 3.80,
      exitFMV: 8.8,
      exitMOIC: 2.96
    },
    {
      round: "25.00%",
      roundPercent: 25.0,
      investmentAmount: 750000,
      resultingOwnership: 5.56,
      returnTheFund: 2697,
      exitOwnership: 3.85,
      exitFMV: 8.9,
      exitMOIC: 2.93
    }
  ];

  // Sample ownership dilution data
  const seriesAOwnership: OwnershipData[] = [
    { round: "Series A", ownership: 10.0, returnTheFund: 1500 },
    { round: "Series B", ownership: 10.0, returnTheFund: 1500 },
    { round: "Series C", ownership: 9.02, returnTheFund: 1663 },
    { round: "Series D", ownership: 7.60, returnTheFund: 1974 },
    { round: "Series E+", ownership: 7.11, returnTheFund: 2109 }
  ];

  const seedOwnership: OwnershipData[] = [
    { round: "Seed", ownership: 7.14, returnTheFund: 2101 },
    { round: "Series A", ownership: 7.58, returnTheFund: 1978 },
    { round: "Series B", ownership: 7.07, returnTheFund: 2122 },
    { round: "Series C", ownership: 5.69, returnTheFund: 2634 },
    { round: "Series D", ownership: 4.79, returnTheFund: 3132 },
    { round: "Series E+", ownership: 4.48, returnTheFund: 3348 }
  ];

  const investments = [
    { id: "series-a", name: "Series A Investments", data: seriesAOwnership },
    { id: "seed", name: "Seed Investments", data: seedOwnership }
  ];

  const selectedInvestmentData = investments.find(inv => inv.id === selectedInvestment)?.data || seriesAOwnership;

  const currentReserve = reserveAmount[0] ?? 0;
  const selectedData = returnTheFundData.find(item => item.investmentAmount === currentReserve) ?? returnTheFundData[5] ?? {
    investmentAmount: 0,
    resultingOwnership: 0,
    returnTheFund: 0,
    exitFMV: 0,
    exitMOIC: 0,
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toLocaleString()}`;
  };

  const formatReturnTheFund = (value: number) => {
    return `$${value.toFixed(0)}mm`;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Return the Fund Analysis</h1>
          <p className="text-muted-foreground">
            Calculate the aggregate valuation companies need to achieve to pay back the entire fund
          </p>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2">
          Fund Size: $150M
        </Badge>
      </div>

      {/* What is Return the Fund */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-blue-900">
            <Info className="h-5 w-5" />
            <span>What is Return the Fund?</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-blue-800">
            <strong>Return the Fund</strong> is a common analysis managers undertake when evaluating venture deals. 
            This involves calculating a Return the Fund metric - the aggregate valuation a company needs to achieve 
            in order to pay back the entire fund. A "Fund Returner" is a single deal that achieves this threshold.
          </p>
        </CardContent>
      </Card>

      {/* Analysis Tabs */}
      <Tabs value={activeTab} onValueChange={(value: any) => setActiveTab(value as any)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="construction" className="flex items-center space-x-2">
            <Building2 className="h-4 w-4" />
            <span>Portfolio Construction</span>
          </TabsTrigger>
          <TabsTrigger value="portfolio" className="flex items-center space-x-2">
            <BarChart3 className="h-4 w-4" />
            <span>Active Portfolio</span>
          </TabsTrigger>
          <TabsTrigger value="reserves" className="flex items-center space-x-2">
            <Target className="h-4 w-4" />
            <span>Reserve Optimization</span>
          </TabsTrigger>
        </TabsList>

        {/* Portfolio Construction Tab */}
        <TabsContent value="construction" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Ownerships and Return the Fund</CardTitle>
              <CardDescription>
                Select an investment type to view how ownership dilutes and Return the Fund changes over subsequent rounds
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center space-x-4">
                  <Label htmlFor="investment-select">Select an investment for the charts below:</Label>
                  <Select value={selectedInvestment} onValueChange={setSelectedInvestment}>
                    <SelectTrigger className="w-[300px]">
                      <SelectValue placeholder="Select investment type" />
                    </SelectTrigger>
                    <SelectContent>
                      {investments.map(investment => (
                        <SelectItem key={investment.id} value={investment.id}>
                          {investment.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Ownership Chart */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Ownerships</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={selectedInvestmentData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="round" />
                            <YAxis 
                              domain={[0, 0.125]}
                              tickFormatter={(value: any) => `${(value * 100).toFixed(1)}%`}
                            />
                            <Tooltip 
                              formatter={(value: number) => [`${value.toFixed(2)}%`, 'Ownership']}
                            />
                            <Bar 
                              dataKey="ownership" 
                              fill="#3b82f6"
                              name="Ownership %"
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Return the Fund Chart */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Return the Fund</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={selectedInvestmentData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="round" />
                            <YAxis 
                              tickFormatter={(value: any) => `$${value}mm`}
                            />
                            <Tooltip 
                              formatter={(value: number) => [`$${value}mm`, 'Return the Fund']}
                            />
                            <Bar 
                              dataKey="returnTheFund" 
                              fill="#10b981"
                              name="Return the Fund"
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    <strong>Key Insight:</strong> As the fund's ownership dilutes over subsequent rounds, 
                    Return the Fund increases. This can be helpful in setting future reserves to keep this metric in check.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Active Portfolio Tab */}
        <TabsContent value="portfolio" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Active Portfolio Analysis</CardTitle>
              <CardDescription>
                For active portfolio companies, view Return the Fund at each forecasted round
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a specific investment's performance case to view the Return the Fund profile</p>
                <p className="text-sm">This would show forecasted rounds and dilution scenarios</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reserve Optimization Tab */}
        <TabsContent value="reserves" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Optimal Follow-on Investment Analysis</CardTitle>
              <CardDescription>
                What is the optimal follow-on investment in the {selectedRound.replace('-', ' ')} round?
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Reserve Slider */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Reserve Amount</Label>
                    <div className="text-lg font-bold">{formatCurrency(currentReserve)}</div>
                  </div>
                  <Slider
                    value={reserveAmount}
                    onValueChange={setReserveAmount}
                    max={750000}
                    min={0}
                    step={75000}
                    className="w-full"
                  />
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>$0</span>
                    <span>$750K</span>
                  </div>
                </div>

                {/* Key Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card className="p-4">
                    <div className="text-sm text-muted-foreground">Resulting Ownership</div>
                    <div className="text-xl font-bold">{selectedData.resultingOwnership.toFixed(2)}%</div>
                  </Card>
                  <Card className="p-4 bg-green-50 border-green-200">
                    <div className="text-sm text-muted-foreground">Return the Fund</div>
                    <div className="text-xl font-bold text-green-700">
                      {formatReturnTheFund(selectedData.returnTheFund)}
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-sm text-muted-foreground">Exit FMV</div>
                    <div className="text-xl font-bold">${selectedData.exitFMV.toFixed(1)}mm</div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-sm text-muted-foreground">Exit MOIC</div>
                    <div className="text-xl font-bold">{selectedData.exitMOIC.toFixed(2)}x</div>
                  </Card>
                </div>

                {/* Reserve Optimization Table */}
                <Card>
                  <CardHeader>
                    <CardTitle>Reserve Impact Analysis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-3 font-medium">Round %</th>
                            <th className="text-left p-3 font-medium">Investment Amount</th>
                            <th className="text-left p-3 font-medium">Resulting Ownership</th>
                            <th className="text-left p-3 font-medium bg-green-50">Return the Fund</th>
                            <th className="text-left p-3 font-medium">Exit Ownership</th>
                            <th className="text-left p-3 font-medium">Exit FMV</th>
                            <th className="text-left p-3 font-medium">Exit MOIC</th>
                          </tr>
                        </thead>
                        <tbody>
                          {returnTheFundData.slice(0, 8).map((row: any, index: any) => (
                            <tr 
                              key={index} 
                              className={`border-b hover:bg-gray-50 ${
                                row.investmentAmount === currentReserve ? 'bg-blue-50 border-blue-200' : ''
                              }`}
                            >
                              <td className="p-3">{row.round}</td>
                              <td className="p-3">
                                {row.investmentAmount === 0 ? '-' : formatCurrency(row.investmentAmount)}
                              </td>
                              <td className="p-3">{row.resultingOwnership.toFixed(2)}%</td>
                              <td className="p-3 bg-green-50">
                                <span className="font-bold text-green-700">
                                  {formatReturnTheFund(row.returnTheFund)}
                                </span>
                              </td>
                              <td className="p-3">{row.exitOwnership.toFixed(2)}%</td>
                              <td className="p-3">${row.exitFMV.toFixed(1)}mm</td>
                              <td className="p-3">{row.exitMOIC.toFixed(2)}x</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Optimization Insight:</strong> As reserves increase, Return the Fund decreases. 
                    Managers can use this as a guide to optimize their reserve for a particular deal while 
                    maintaining target fund return thresholds.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
