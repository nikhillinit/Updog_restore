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
import { DollarSign, TrendingUp, Target } from "lucide-react";

interface InvestableCapitalData {
  category: string;
  committed: number;
  investable: number;
  deployedPlanned: number;
  remaining: number;
  actual: number;
  projected: number;
  fundValue: number;
}

export default function InvestableCapitalSummary() {
  // Data based on your Tactyc screenshot
  const capitalData: InvestableCapitalData = {
    category: "Fund Capital",
    committed: 150000000,
    investable: 140200000,
    deployedPlanned: 52144483,
    remaining: 88055517,
    actual: 24000000,
    projected: 95000000,
    fundValue: 97716532
  };

  const allocationData = [
    {
      round: "Initial Investments",
      deployed: 40000000,
      planned: 60000000,
      total: 100000000,
      color: "#3b82f6"
    },
    {
      round: "Follow-On Investments", 
      deployed: 12000000,
      planned: 45000000,
      total: 57000000,
      color: "#10b981"
    },
    {
      round: "Remaining",
      deployed: 0,
      planned: 0,
      total: 33000000,
      color: "#6b7280"
    }
  ];

  const deploymentStatus = [
    {
      category: "Deployed",
      amount: capitalData.actual,
      percentage: (capitalData.actual / capitalData.investable) * 100
    },
    {
      category: "Planned",
      amount: capitalData.remaining - capitalData.actual,
      percentage: ((capitalData.remaining - capitalData.actual) / capitalData.investable) * 100
    },
    {
      category: "Remaining",
      amount: capitalData.investable - capitalData.remaining,
      percentage: ((capitalData.investable - capitalData.remaining) / capitalData.investable) * 100
    }
  ];

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toLocaleString()}`;
  };

  return (
    <div className="space-y-6">
      {/* Header Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <DollarSign className="h-5 w-5" />
            <span>Investable Capital Summary</span>
          </CardTitle>
          <CardDescription>
            Summary of investable capital, net of fees and expenses. Breakdown of investable capital by strategy and rounds.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Committed</div>
              <div className="text-2xl font-bold">{formatCurrency(capitalData.committed)}</div>
            </div>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Investable</div>
              <div className="text-2xl font-bold">{formatCurrency(capitalData.investable)}</div>
            </div>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Deployed + Planned</div>
              <div className="text-2xl font-bold">{formatCurrency(capitalData.deployedPlanned)}</div>
            </div>
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Remaining</div>
              <div className="text-2xl font-bold">{formatCurrency(capitalData.remaining)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Investable Capital Allocation */}
        <Card>
          <CardHeader>
            <CardTitle>Investable Capital Allocation</CardTitle>
            <CardDescription>By Entry Round</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={allocationData} layout="horizontal">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(value) => `$${(value / 1000000).toFixed(0)}M`} />
                  <YAxis dataKey="round" type="category" width={100} />
                  <Tooltip formatter={(value: number) => [formatCurrency(value), '']} />
                  <Bar dataKey="total" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Capital Deployment Status */}
        <Card>
          <CardHeader>
            <CardTitle>Capital Deployment Status</CardTitle>
            <CardDescription>Current vs Future Deployment</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {deploymentStatus.map((item, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{item.category}</span>
                    <span className="text-sm">{formatCurrency(item.amount)}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${
                        index === 0 ? 'bg-blue-600' : 
                        index === 1 ? 'bg-green-600' : 'bg-gray-400'
                      }`}
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {item.percentage.toFixed(1)}% of investable capital
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Fund Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Fund Performance</CardTitle>
            <CardDescription>Current Fund Value</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-3xl font-bold">{formatCurrency(capitalData.fundValue)}</div>
                <div className="text-sm text-muted-foreground">Current Fund Value</div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-lg font-bold">1.04x</div>
                  <div className="text-xs text-muted-foreground">Est. Actual TVPI</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-lg font-bold">3.55x</div>
                  <div className="text-xs text-muted-foreground">Projected TVPI</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Gross MOIC</span>
                  <span className="font-medium">2.84x</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>IRR</span>
                  <span className="font-medium">24.5%</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>DPI</span>
                  <span className="font-medium">0.15x</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
