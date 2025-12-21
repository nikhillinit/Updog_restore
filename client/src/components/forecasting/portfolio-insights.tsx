/* eslint-disable @typescript-eslint/no-explicit-any */
 
 
 
 
import { PieChart } from 'recharts/es6/chart/PieChart';
import { Pie } from 'recharts/es6/polar/Pie';
import { Cell } from 'recharts/es6/component/Cell';
import { BarChart } from 'recharts/es6/chart/BarChart';
import { Bar } from 'recharts/es6/cartesian/Bar';
import { XAxis } from 'recharts/es6/cartesian/XAxis';
import { YAxis } from 'recharts/es6/cartesian/YAxis';
import { CartesianGrid } from 'recharts/es6/cartesian/CartesianGrid';
import { Tooltip } from 'recharts/es6/component/Tooltip';
import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, TrendingUp, Users } from "lucide-react";

interface CoInvestorData {
  name: string;
  amount: number;
  deals: number;
  color: string;
  [key: string]: unknown;
}

interface SectorMOIC {
  sector: string;
  moic: number;
  [key: string]: unknown;
}

export default function PortfolioInsights() {
  // Sample data for co-investor analysis
  const coInvestorData: CoInvestorData[] = [
    {
      name: "Andreessen Horowitz",
      amount: 4059371,
      deals: 8,
      color: "#3b82f6"
    },
    {
      name: "Sequoia Capital",
      amount: 10596400,
      deals: 12,
      color: "#10b981"
    },
    {
      name: "General Catalyst",
      amount: 7500000,
      deals: 6,
      color: "#f59e0b"
    },
    {
      name: "Benchmark Capital",
      amount: 4176131,
      deals: 5,
      color: "#ef4444"
    },
    {
      name: "Others",
      amount: 15000000,
      deals: 25,
      color: "#6b7280"
    }
  ];

  const sectorMOICData: SectorMOIC[] = [
    { sector: "Enterprise Software", moic: 2.84 },
    { sector: "Consumer", moic: 2.64 },
    { sector: "Fintech", moic: 1.94 },
    { sector: "Healthcare", moic: 1.84 },
    { sector: "AI/ML", moic: 1.68 },
    { sector: "Developer Tools", moic: 1.48 },
    { sector: "Infrastructure", moic: 1.30 },
    { sector: "Biotech", moic: 1.26 },
    { sector: "Hardware", moic: 1.24 },
    { sector: "Crypto", moic: 1.06 }
  ];

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toLocaleString()}`;
  };

  const totalInvested = coInvestorData.reduce((sum: any, item: any) => sum + item.amount, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Building2 className="h-5 w-5" />
            <span>Portfolio Insights and Performance</span>
          </CardTitle>
          <CardDescription>
            Analysis of co-investments and sector performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Co-investor Analysis */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Example: Which funds have we co-invested with the most?</h3>
              <div className="text-sm text-muted-foreground mb-4">Sum: Invested To Date</div>
              
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={coInvestorData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={120}
                      paddingAngle={2}
                      dataKey="amount"
                    >
                      {coInvestorData.map((entry: any, index: any) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [formatCurrency(value), 'Invested']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2">
                {coInvestorData.map((investor: any, index: any) => (
                  <div key={index} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                    <div className="flex items-center space-x-3">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: investor.color }}
                      />
                      <span className="font-medium">{investor.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{formatCurrency(investor.amount)}</div>
                      <div className="text-xs text-muted-foreground">{investor.deals} deals</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sector MOIC Analysis */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Example: Average MOIC by sector</h3>
              <div className="text-sm text-muted-foreground mb-4">Mean Current MOIC</div>
              
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sectorMOICData} layout="horizontal">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" domain={[0, 3]} />
                    <YAxis 
                      dataKey="sector" 
                      type="category" 
                      width={120}
                      fontSize={12}
                    />
                    <Tooltip 
                      formatter={(value: number) => [`${value.toFixed(2)}x`, 'MOIC']}
                    />
                    <Bar 
                      dataKey="moic" 
                      fill="#3b82f6"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Key Insights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <Card className="p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Users className="h-4 w-4 text-blue-600" />
                <span className="font-medium">Top Co-investor</span>
              </div>
              <div className="text-2xl font-bold">Sequoia Capital</div>
              <div className="text-sm text-muted-foreground">
                {formatCurrency(coInvestorData.find(inv => inv.name === "Sequoia Capital")?.amount || 0)} across 12 deals
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center space-x-2 mb-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <span className="font-medium">Best Sector</span>
              </div>
              <div className="text-2xl font-bold">Enterprise Software</div>
              <div className="text-sm text-muted-foreground">
                {sectorMOICData[0]?.moic?.toFixed(2) ?? '0.00'}x average MOIC
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Building2 className="h-4 w-4 text-purple-600" />
                <span className="font-medium">Portfolio Size</span>
              </div>
              <div className="text-2xl font-bold">45 companies</div>
              <div className="text-sm text-muted-foreground">
                Across 10 sectors
              </div>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
