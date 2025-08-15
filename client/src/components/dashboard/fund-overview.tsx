import React from 'react';
import { DashboardCard } from './DashboardCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFundContext } from '@/contexts/FundContext';
import { DollarSign, BarChart3, Users, TrendingUp } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from 'recharts';

// Sample data matching target UI
const areaChartData = [
  { name: 'Jan', value: 5 },
  { name: 'Feb', value: 8 },
  { name: 'Mar', value: 7 },
  { name: 'Apr', value: 12 },
  { name: 'May', value: 18 },
  { name: 'Jun', value: 24 },
  { name: 'Jul', value: 30 },
  { name: 'Aug', value: 26 },
  { name: 'Sep', value: 32 },
  { name: 'Oct', value: 38 },
  { name: 'Nov', value: 42 },
  { name: 'Dec', value: 45 }
];

const pieChartData = [
  { name: 'SaaS', value: 35 },
  { name: 'Fintech', value: 25 },
  { name: 'Healthcare', value: 20 },
  { name: 'Consumer', value: 15 },
  { name: 'Enterprise', value: 5 }
];

const COLORS = ['#292929', '#555555', '#777777', '#999999', '#E0D8D1'];

export default function FundOverview() {
  const { currentFund } = useFundContext();

  if (!currentFund) return null;

  const fundSize = currentFund.size || 50000000;
  const committedCapital = fundSize * 0.65; // 32.5M
  const activeLPs = 28;
  const irr = 18.5;

  return (
    <div className="space-y-6 p-6 bg-white font-poppins">
      {/* Title Section */}
      <div>
        <h1 className="text-2xl font-inter font-bold text-charcoal">
          Fund Dashboard
        </h1>
        <p className="text-charcoal/70 mt-1">
          Overview of your fund's performance and metrics
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <DashboardCard
          title="Fund Size"
          value={`$${(fundSize / 1000000).toFixed(0)}M`}
          change={8.2}
          changeLabel="vs last quarter"
          icon={<DollarSign size={20} className="text-charcoal" />}
        />
        <DashboardCard
          title="Committed Capital"
          value={`$${(committedCapital / 1000000).toFixed(1)}M`}
          metric="(65%)"
          change={12.4}
          changeLabel="vs last quarter"
          icon={<BarChart3 size={20} className="text-charcoal" />}
        />
        <DashboardCard
          title="Active LPs"
          value={activeLPs.toString()}
          change={2}
          changeLabel="new this month"
          icon={<Users size={20} className="text-charcoal" />}
        />
        <DashboardCard
          title="IRR"
          value={`${irr}%`}
          change={-2.3}
          changeLabel="vs target"
          icon={<TrendingUp size={20} className="text-charcoal" />}
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Fund Performance Chart */}
        <Card className="lg:col-span-2 bg-white border-0 shadow-card">
          <CardHeader>
            <CardTitle className="font-inter text-charcoal">Fund Performance</CardTitle>
            <p className="text-sm text-charcoal/70">Capital deployment over time</p>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={areaChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#E0D8D1" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#E0D8D1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#292929' }} 
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#292929' }} 
                    tickFormatter={value => `$${value}M`} 
                  />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f2f2f2" />
                  <Tooltip 
                    formatter={value => [`$${value}M`, 'Capital Deployed']} 
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #f2f2f2',
                      borderRadius: '4px',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)'
                    }} 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#292929" 
                    fillOpacity={1} 
                    fill="url(#colorValue)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Sector Allocation */}
        <Card className="bg-white border-0 shadow-card">
          <CardHeader>
            <CardTitle className="font-inter text-charcoal">Sector Allocation</CardTitle>
            <p className="text-sm text-charcoal/70">Current portfolio distribution</p>
          </CardHeader>
          <CardContent>
            <div className="h-80 flex flex-col justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={pieChartData} 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={60} 
                    outerRadius={90} 
                    paddingAngle={2} 
                    dataKey="value"
                    label={(props) => {
                      // Handle the case where props.percent might be undefined
                      const percent = props.percent ?? 0;
                      const name = props.name ?? '';
                      return `${name} ${(percent * 100).toFixed(0)}%`;
                    }}
                    labelLine={false}
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={value => [`${value}%`, 'Allocation']} 
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #f2f2f2',
                      borderRadius: '4px',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)'
                    }} 
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}