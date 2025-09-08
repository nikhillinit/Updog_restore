/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { LineChart } from 'recharts/es6/chart/LineChart';
import { Line } from 'recharts/es6/cartesian/Line';
import { XAxis } from 'recharts/es6/cartesian/XAxis';
import { YAxis } from 'recharts/es6/cartesian/YAxis';
import { CartesianGrid } from 'recharts/es6/cartesian/CartesianGrid';
import { Tooltip } from 'recharts/es6/component/Tooltip';
import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer';
import { BarChart } from 'recharts/es6/chart/BarChart';
import { Bar } from 'recharts/es6/cartesian/Bar';
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowUp, 
  ArrowDown,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Target,
  BarChart3,
  Activity
} from "lucide-react";

export function ConstructionActualComparison() {
  // Sample data matching your Tactyc screenshots
  const comparisonData = {
    initialChecks: [
      { 
        entryRound: "Seed", 
        constructionAverage: 1250000, 
        actualAverage: 1110660, 
        difference: -139340, 
        differencePercent: -11.15 
      },
      { 
        entryRound: "Series A", 
        constructionAverage: 2200000, 
        actualAverage: 1824540, 
        difference: -375460, 
        differencePercent: -17.07 
      },
      { 
        entryRound: "Pre-Seed", 
        constructionAverage: 500000, 
        actualAverage: 1500000, 
        difference: 1000000, 
        differencePercent: 200.00 
      }
    ],
    followOnReserves: [
      { 
        entryRound: "Seed", 
        constructionAverage: 2100000, 
        actualAverage: 1850000, 
        difference: -250000, 
        differencePercent: -11.90 
      },
      { 
        entryRound: "Series A", 
        constructionAverage: 3200000, 
        actualAverage: 2750000, 
        difference: -450000, 
        differencePercent: -14.06 
      },
      { 
        entryRound: "Pre-Seed", 
        constructionAverage: 800000, 
        actualAverage: 1200000, 
        difference: 400000, 
        differencePercent: 50.00 
      }
    ],
    roundSizes: [
      { 
        entryRound: "Seed", 
        constructionAverage: 8500000, 
        actualAverage: 9200000, 
        difference: 700000, 
        differencePercent: 8.24 
      },
      { 
        entryRound: "Series A", 
        constructionAverage: 15000000, 
        actualAverage: 14200000, 
        difference: -800000, 
        differencePercent: -5.33 
      },
      { 
        entryRound: "Pre-Seed", 
        constructionAverage: 3000000, 
        actualAverage: 4500000, 
        difference: 1500000, 
        differencePercent: 50.00 
      }
    ],
    preMoneyValuations: [
      { 
        entryRound: "Seed", 
        constructionAverage: 13500000, 
        actualAverage: 16456322, 
        difference: 2956322, 
        differencePercent: 21.90 
      },
      { 
        entryRound: "Series A", 
        constructionAverage: 39600000, 
        actualAverage: 37389960, 
        difference: -2210040, 
        differencePercent: -5.58 
      },
      { 
        entryRound: "Pre-Seed", 
        constructionAverage: 7000000, 
        actualAverage: 15000000, 
        difference: 8000000, 
        differencePercent: 114.29 
      }
    ],
    postMoneyValuations: [
      { 
        entryRound: "Seed", 
        constructionAverage: 22000000, 
        actualAverage: 25656322, 
        difference: 3656322, 
        differencePercent: 16.62 
      },
      { 
        entryRound: "Series A", 
        constructionAverage: 54600000, 
        actualAverage: 51589960, 
        difference: -3010040, 
        differencePercent: -5.51 
      },
      { 
        entryRound: "Pre-Seed", 
        constructionAverage: 10000000, 
        actualAverage: 19500000, 
        difference: 9500000, 
        differencePercent: 95.00 
      }
    ]
  };

  // Investment pacing over time data
  const pacingData = [
    { period: "2021", construction: 86, actual: 21, currentForecast: 79 },
    { period: "2022", construction: 86, actual: 35, currentForecast: 79 },
    { period: "2023", construction: 86, actual: 21, currentForecast: 79 },
    { period: "Total", construction: 86, actual: 21, currentForecast: 79 }
  ];

  // Entry round breakdown
  const entryRoundData = [
    { round: "Pre-Seed", construction: 32, actual: 2, projected: 24, remaining: 22 },
    { round: "Seed", construction: 30, actual: 14, projected: 34, remaining: 20 },
    { round: "Series A", construction: 24, actual: 5, projected: 21, remaining: 16 }
  ];

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toLocaleString()}`;
  };

  const formatPercent = (value: number) => {
    if (value > 0) return `+${value.toFixed(2)}%`;
    return `${value.toFixed(2)}%`;
  };

  const getDifferenceIcon = (value: number) => {
    return value > 0 ? <ArrowUp className="h-3 w-3 text-green-600" /> : <ArrowDown className="h-3 w-3 text-red-600" />;
  };

  const getDifferenceColor = (value: number) => {
    return value > 0 ? "text-green-600" : "text-red-600";
  };

  const ComparisonTable = ({ data, title, description }: { data: any[], title: string, description: string }) => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3 font-medium">Entry Round</th>
                <th className="text-center p-3 font-medium">Construction Average</th>
                <th className="text-center p-3 font-medium">Actual Average</th>
                <th className="text-center p-3 font-medium">Difference</th>
                <th className="text-center p-3 font-medium">Difference (%)</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item, index) => (
                <tr key={index} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium">{item.entryRound}</td>
                  <td className="text-center p-3">{formatCurrency(item.constructionAverage)}</td>
                  <td className="text-center p-3">{formatCurrency(item.actualAverage)}</td>
                  <td className="text-center p-3">
                    <div className="flex items-center justify-center space-x-1">
                      {getDifferenceIcon(item.difference)}
                      <span className={getDifferenceColor(item.difference)}>
                        {formatCurrency(Math.abs(item.difference))}
                      </span>
                    </div>
                  </td>
                  <td className="text-center p-3">
                    <div className="flex items-center justify-center space-x-1">
                      {getDifferenceIcon(item.differencePercent)}
                      <span className={getDifferenceColor(item.differencePercent)}>
                        ({formatPercent(item.differencePercent)})
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Deal Pacing Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5" />
            <span>Number of Initial Investments, by Entry Round</span>
          </CardTitle>
          <CardDescription>Construction vs Actual vs Projected investment pacing</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-600">86</div>
              <div className="text-sm text-muted-foreground">Construction</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">21</div>
              <div className="text-sm text-muted-foreground">Actual</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">79</div>
              <div className="text-sm text-muted-foreground">Projected</div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium">Entry Round</th>
                  <th className="text-center p-3 font-medium">Construction</th>
                  <th className="text-center p-3 font-medium">Actual</th>
                  <th className="text-center p-3 font-medium">Current Forecast</th>
                  <th className="text-center p-3 font-medium">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {entryRoundData.map((item, index) => (
                  <tr key={index} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{item.round}</td>
                    <td className="text-center p-3">{item.construction}</td>
                    <td className="text-center p-3">{item.actual}</td>
                    <td className="text-center p-3">{item.projected}</td>
                    <td className="text-center p-3">
                      <div className="flex items-center justify-center">
                        <ArrowUp className="h-3 w-3 text-blue-600 mr-1" />
                        <span className="text-blue-600 font-medium">{item.remaining}</span>
                      </div>
                    </td>
                  </tr>
                ))}
                <tr className="border-b font-bold bg-gray-50">
                  <td className="p-3">Total</td>
                  <td className="text-center p-3">86</td>
                  <td className="text-center p-3">21</td>
                  <td className="text-center p-3">79</td>
                  <td className="text-center p-3">58</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Comparison Analysis */}
      <Tabs defaultValue="initial-checks" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="initial-checks">Initial Checks</TabsTrigger>
          <TabsTrigger value="follow-on-reserves">Follow-On Reserves</TabsTrigger>
          <TabsTrigger value="round-sizes">Round Sizes</TabsTrigger>
          <TabsTrigger value="pre-money">Pre-Money Valuations</TabsTrigger>
          <TabsTrigger value="post-money">Post-Money Valuations</TabsTrigger>
        </TabsList>

        <TabsContent value="initial-checks">
          <ComparisonTable 
            data={comparisonData.initialChecks}
            title="Construction vs. Actual Comparison, By Entry Stage"
            description="Average initial check size per deal in actual investments compared between construction plan and actual investments."
          />
        </TabsContent>

        <TabsContent value="follow-on-reserves">
          <ComparisonTable 
            data={comparisonData.followOnReserves}
            title="Follow-On Reserves Comparison"
            description="Average follow-on reserve allocation per deal comparing construction plan with actual reserve deployment."
          />
        </TabsContent>

        <TabsContent value="round-sizes">
          <ComparisonTable 
            data={comparisonData.roundSizes}
            title="Round Sizes Comparison"
            description="Average total round size for deals comparing construction assumptions with actual market conditions."
          />
        </TabsContent>

        <TabsContent value="pre-money">
          <ComparisonTable 
            data={comparisonData.preMoneyValuations}
            title="Pre-Money Valuations Comparison"
            description="Average pre-money valuation per deal of actual investments compared between construction plan and actual investments."
          />
        </TabsContent>

        <TabsContent value="post-money">
          <ComparisonTable 
            data={comparisonData.postMoneyValuations}
            title="Post-Money Valuations Comparison"
            description="Average post-money valuation per deal comparing construction assumptions with actual investment terms."
          />
        </TabsContent>
      </Tabs>

      {/* Key Insights */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-blue-900">
            <Activity className="h-5 w-5" />
            <span>Course Correction Insights</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium text-blue-900 mb-2">Market Conditions</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Pre-Seed valuations 114% higher than construction</li>
                <li>• Series A check sizes 17% below target</li>
                <li>• Overall deployment pacing 25% of target</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-blue-900 mb-2">Recommended Actions</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Increase check sizes for Series A deals</li>
                <li>• Accelerate deal sourcing and execution</li>
                <li>• Adjust valuation expectations for current market</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
