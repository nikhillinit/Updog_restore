import React from 'react';
import { Card } from '../components/ui/Card';
import { DashboardCard } from '../components/dashboard/DashboardCard';
import { BarChart3Icon, DollarSignIcon, UsersIcon, TrendingUpIcon, PieChartIcon } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from 'recharts';
const areaChartData = [{
  name: 'Jan',
  value: 5
}, {
  name: 'Feb',
  value: 8
}, {
  name: 'Mar',
  value: 7
}, {
  name: 'Apr',
  value: 12
}, {
  name: 'May',
  value: 18
}, {
  name: 'Jun',
  value: 24
}, {
  name: 'Jul',
  value: 30
}, {
  name: 'Aug',
  value: 26
}, {
  name: 'Sep',
  value: 32
}, {
  name: 'Oct',
  value: 38
}, {
  name: 'Nov',
  value: 42
}, {
  name: 'Dec',
  value: 45
}];
const pieChartData = [{
  name: 'SaaS',
  value: 35
}, {
  name: 'Fintech',
  value: 25
}, {
  name: 'Healthcare',
  value: 20
}, {
  name: 'Consumer',
  value: 15
}, {
  name: 'Enterprise',
  value: 5
}];
const COLORS = ['#292929', '#555555', '#777777', '#999999', '#BBBBBB'];
export const Dashboard = () => {
  return <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-inter font-bold text-charcoal">
          Fund Dashboard
        </h1>
        <p className="text-charcoal/70 mt-1">
          Overview of your fund's performance and metrics
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <DashboardCard title="Fund Size" value="$50M" change={8.2} changeLabel="vs last quarter" icon={<DollarSignIcon size={20} className="text-charcoal" />} />
        <DashboardCard title="Committed Capital" value="$32.5M" metric="(65%)" change={12.4} changeLabel="vs last quarter" icon={<BarChart3Icon size={20} className="text-charcoal" />} />
        <DashboardCard title="Active LPs" value="28" change={2} changeLabel="new this month" icon={<UsersIcon size={20} className="text-charcoal" />} />
        <DashboardCard title="IRR" value="18.5%" change={-2.3} changeLabel="vs target" icon={<TrendingUpIcon size={20} className="text-charcoal" />} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Fund Performance" subtitle="Capital deployment over time" className="lg:col-span-2">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={areaChartData} margin={{
              top: 10,
              right: 30,
              left: 0,
              bottom: 0
            }}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#E0D8D1" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#E0D8D1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{
                fill: '#292929'
              }} />
                <YAxis axisLine={false} tickLine={false} tick={{
                fill: '#292929'
              }} tickFormatter={value => `$${value}M`} />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f2f2f2" />
                <Tooltip formatter={value => [`$${value}M`, 'Capital Deployed']} contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #f2f2f2',
                borderRadius: '4px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)'
              }} />
                <Area type="monotone" dataKey="value" stroke="#292929" fillOpacity={1} fill="url(#colorValue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Sector Allocation" subtitle="Current portfolio distribution">
          <div className="h-80 flex flex-col justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieChartData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value" label={({
                name,
                percent
              }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {pieChartData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={value => [`${value}%`, 'Allocation']} contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #f2f2f2',
                borderRadius: '4px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)'
              }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>;
};