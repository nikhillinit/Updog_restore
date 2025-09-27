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
import { Tooltip } from 'recharts/es6/component/Tooltip';
import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  Download,
  Info,
  Calculator
} from "lucide-react";

interface IRRData {
  category: string;
  constructionForecast: number;
  currentForecast: number;
  realized: number;
}

interface IRRSummaryProps {
  className?: string;
}

export default function IRRSummary({ className }: IRRSummaryProps) {
  // IRR performance data based on the provided image
  const irrData: IRRData[] = [
    {
      category: "Gross IRR",
      constructionForecast: 20.27, // Light blue bar
      currentForecast: 55.15, // Dark blue bar  
      realized: 21.33 // Orange bar
    },
    {
      category: "Net LP IRR", 
      constructionForecast: 15.02, // Light blue bar
      currentForecast: 48.61, // Dark blue bar
      realized: 10.98 // Orange bar
    }
  ];

  // Calculate IRR from realized cash flows only
  const calculateRealizedIRR = (_realizedCashFlows: number[], _investmentDates: Date[], _realizationDates: Date[]): number => {
    // Simplified IRR calculation for realized-only cash flows
    // In practice, this would use a more sophisticated IRR algorithm (Newton-Raphson method)
    
    // Sample realized cash flow analysis
    const totalInvested = 25000000; // $25M invested
    const totalRealized = 28500000; // $28.5M realized
    const avgHoldingPeriod = 3.2; // 3.2 years average
    
    // Simple IRR approximation: (Ending Value / Beginning Value)^(1/years) - 1
    const simpleIRR = Math.pow(totalRealized / totalInvested, 1 / avgHoldingPeriod) - 1;
    
    return simpleIRR * 100; // Convert to percentage
  };

  // Sample realized cash flows for calculation demonstration
  const realizedFlows = [
    { company: "TechCorp", invested: 2000000, realized: 8500000, holdingPeriod: 4.2, irr: 42.1 },
    { company: "FinTech Solutions", invested: 1500000, realized: 2800000, holdingPeriod: 2.8, irr: 23.4 },
    { company: "HealthTech Inc", invested: 3000000, realized: 3600000, holdingPeriod: 3.1, irr: 6.1 },
    { company: "AI Startup", invested: 2500000, realized: 4200000, holdingPeriod: 2.5, irr: 22.7 },
    { company: "Enterprise SaaS", invested: 1800000, realized: 2100000, holdingPeriod: 4.0, irr: 3.9 }
  ];

  const totalRealizedInvested = realizedFlows.reduce((sum: any, flow: any) => sum + flow.invested, 0);
  const totalRealizedValue = realizedFlows.reduce((sum: any, flow: any) => sum + flow.realized, 0);
  const weightedAvgIRR = realizedFlows.reduce((sum: any, flow: any) => sum + (flow.irr * flow.invested), 0) / totalRealizedInvested;

  const formatPercentage = (value: number) => `${value.toFixed(2)}%`;
  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toLocaleString()}`;
  };

  const getBarColor = (dataKey: string) => {
    switch (dataKey) {
      case 'constructionForecast': return '#38bdf8'; // Light blue
      case 'currentForecast': return '#1e293b'; // Dark blue/slate
      case 'realized': return '#fb923c'; // Orange
      default: return '#6b7280';
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }}>
              {entry.dataKey === 'constructionForecast' ? 'Construction Forecast' :
               entry.dataKey === 'currentForecast' ? 'Current Forecast' : 'Realized'}: {formatPercentage(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const maxValue = Math.max(
    ...irrData.flatMap(d => [d.constructionForecast, d.currentForecast, d.realized])
  );

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center space-x-2">
                <TrendingUp className="h-5 w-5 text-blue-600" />
                <span>IRR Summary</span>
              </CardTitle>
              <CardDescription>
                Internal Rate of Return analysis comparing forecasted vs realized performance
              </CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button variant="ghost" size="sm">
                <Info className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* IRR Chart */}
      <Card>
        <CardHeader>
          <CardTitle>IRR Performance Comparison</CardTitle>
          <CardDescription>
            Construction forecast vs current forecast vs realized IRR from actual exits
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={irrData}
                margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                barCategoryGap="30%"
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="category" 
                  tick={{ fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  domain={[0, Math.ceil(maxValue * 1.1)]}
                  tick={{ fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value: any) => `${value}%`}
                />
                <Tooltip content={<CustomTooltip />} />
                
                <Bar dataKey="constructionForecast" fill={getBarColor('constructionForecast')} radius={[2, 2, 0, 0]} />
                <Bar dataKey="currentForecast" fill={getBarColor('currentForecast')} radius={[2, 2, 0, 0]} />
                <Bar dataKey="realized" fill={getBarColor('realized')} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center space-x-8 mt-6">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: getBarColor('constructionForecast') }}></div>
              <span className="text-sm">Construction Forecast</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: getBarColor('currentForecast') }}></div>
              <span className="text-sm">Current Forecast</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: getBarColor('realized') }}></div>
              <span className="text-sm">Realized</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Realized IRR Analysis */}
      <Card className="border-orange-200 bg-orange-50">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-orange-900">
            <Calculator className="h-5 w-5" />
            <span>Realized IRR Analysis</span>
          </CardTitle>
          <CardDescription className="text-orange-700">
            IRR calculated from actual realized cash flows only
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-900">{formatPercentage(weightedAvgIRR)}</div>
              <div className="text-sm text-orange-700">Weighted Avg Realized IRR</div>
              <div className="text-xs text-orange-600">Based on actual exits</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-900">{formatCurrency(totalRealizedValue)}</div>
              <div className="text-sm text-orange-700">Total Realized Value</div>
              <div className="text-xs text-orange-600">From {realizedFlows.length} exits</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-900">{((totalRealizedValue / totalRealizedInvested) - 1).toFixed(1)}%</div>
              <div className="text-sm text-orange-700">Realized Return Multiple</div>
              <div className="text-xs text-orange-600">{(totalRealizedValue / totalRealizedInvested).toFixed(2)}x MOIC</div>
            </div>
          </div>

          {/* Realized Exits Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-orange-200">
                  <th className="text-left p-3 font-medium text-orange-900">Company</th>
                  <th className="text-right p-3 font-medium text-orange-900">Invested</th>
                  <th className="text-right p-3 font-medium text-orange-900">Realized</th>
                  <th className="text-right p-3 font-medium text-orange-900">Holding Period</th>
                  <th className="text-right p-3 font-medium text-orange-900">Realized IRR</th>
                </tr>
              </thead>
              <tbody>
                {realizedFlows.map((flow: any, index: any) => (
                  <tr key={index} className="border-b border-orange-100 hover:bg-orange-100">
                    <td className="p-3 font-medium">{flow.company}</td>
                    <td className="p-3 text-right">{formatCurrency(flow.invested)}</td>
                    <td className="p-3 text-right font-medium">{formatCurrency(flow.realized)}</td>
                    <td className="p-3 text-right">{flow.holdingPeriod.toFixed(1)} years</td>
                    <td className="p-3 text-right">
                      <Badge variant={flow.irr > 25 ? 'default' : flow.irr > 15 ? 'secondary' : 'outline'}>
                        {formatPercentage(flow.irr)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
              
              {/* Totals Row */}
              <tfoot>
                <tr className="border-t-2 border-orange-300 bg-orange-100 font-medium">
                  <td className="p-3 font-bold text-orange-900">Total</td>
                  <td className="p-3 text-right font-bold text-orange-900">{formatCurrency(totalRealizedInvested)}</td>
                  <td className="p-3 text-right font-bold text-orange-900">{formatCurrency(totalRealizedValue)}</td>
                  <td className="p-3 text-right font-bold text-orange-900">
                    {(realizedFlows.reduce((sum: any, flow: any) => sum + flow.holdingPeriod, 0) / realizedFlows.length).toFixed(1)} avg
                  </td>
                  <td className="p-3 text-right">
                    <Badge variant="default" className="font-bold">
                      {formatPercentage(weightedAvgIRR)}
                    </Badge>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* IRR Methodology */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <div className="flex items-start space-x-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-900 mb-2">Realized IRR Methodology</h4>
              <p className="text-sm text-blue-800 mb-3">
                <strong>Realized IRR</strong> calculates the internal rate of return using only actual cash flows from completed exits, 
                providing a conservative measure of fund performance based on liquidity events rather than paper valuations.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700">
                <div>
                  <strong>Includes:</strong>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>IPO proceeds</li>
                    <li>M&A exit values</li>
                    <li>Secondary sales</li>
                    <li>Dividend distributions</li>
                  </ul>
                </div>
                <div>
                  <strong>Excludes:</strong>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Unrealized valuations</li>
                    <li>Mark-to-market gains</li>
                    <li>Projected exit values</li>
                    <li>Paper returns</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
