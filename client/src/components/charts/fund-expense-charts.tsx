import { AreaChart } from 'recharts/es6/chart/AreaChart';
import { Area } from 'recharts/es6/cartesian/Area';
import { XAxis } from 'recharts/es6/cartesian/XAxis';
import { YAxis } from 'recharts/es6/cartesian/YAxis';
import { CartesianGrid } from 'recharts/es6/cartesian/CartesianGrid';
import { Tooltip } from 'recharts/es6/component/Tooltip';
import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer';
import { BarChart } from 'recharts/es6/chart/BarChart';
import { Bar } from 'recharts/es6/cartesian/Bar';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, Info, DollarSign, Percent, TrendingUp } from 'lucide-react';

interface ExpenseData {
  date: string;
  legal: number;
  administration: number;
  tax: number;
  audit: number;
  software: number;
  setup: number;
  other: number;
  total: number;
}

interface ExpenseRatioData {
  date: string;
  legalRatio: number;
  administrationRatio: number;
  taxRatio: number;
  auditRatio: number;
  softwareRatio: number;
  setupRatio: number;
  otherRatio: number;
  totalRatio: number;
}

interface FundExpenseChartsProps {
  className?: string;
}

export default function FundExpenseCharts({ className }: FundExpenseChartsProps) {
  const [activeTab, setActiveTab] = useState('cumulative');
  const [viewType, setViewType] = useState<'expenses' | 'ratios'>('expenses');

  // Generate sample expense data over time (monthly progression)
  const generateExpenseData = (): ExpenseData[] => {
    const data: ExpenseData[] = [];
    const startDate = new Date(2021, 0, 1); // January 2021
    const categories = {
      legal: { monthly: 6667, setup: 0 }, // $400k over 60 months
      administration: { monthly: 12500, setup: 0 }, // $1.5M over 120 months
      tax: { monthly: 1333, setup: 0 }, // $160k over 120 months
      audit: { monthly: 5000, setup: 0 }, // $600k over 120 months
      software: { monthly: 5000, setup: 0 }, // $300k over 60 months
      setup: { monthly: 0, setup: 500000 }, // $500k upfront
      other: { monthly: 10000, setup: 0 }, // $1.2M over 120 months
    };

    const cumulativeTotals = {
      legal: 0,
      administration: 0,
      tax: 0,
      audit: 0,
      software: 0,
      setup: 500000, // Setup paid upfront
      other: 0,
    };

    for (let month = 0; month < 120; month++) {
      const currentDate = new Date(startDate);
      currentDate.setMonth(startDate.getMonth() + month);

      // Add monthly expenses
      if (month < 60) {
        // Legal and Software only for 60 months
        cumulativeTotals.legal += categories.legal.monthly;
        cumulativeTotals.software += categories.software.monthly;
      }

      cumulativeTotals.administration += categories.administration.monthly;
      cumulativeTotals.tax += categories.tax.monthly;
      cumulativeTotals.audit += categories.audit.monthly;
      cumulativeTotals.other += categories.other.monthly;

      const total = Object.values(cumulativeTotals).reduce(
        (sum: number, val: number) => sum + val,
        0
      );

      data.push({
        date: currentDate.toISOString().slice(0, 7), // YYYY-MM format
        legal: cumulativeTotals.legal,
        administration: cumulativeTotals.administration,
        tax: cumulativeTotals.tax,
        audit: cumulativeTotals.audit,
        software: cumulativeTotals.software,
        setup: cumulativeTotals.setup,
        other: cumulativeTotals.other,
        total: total,
      });
    }

    return data;
  };

  const expenseData = generateExpenseData();
  const fundSize = 200000000; // $200M fund

  // Convert to expense ratios
  const expenseRatioData: ExpenseRatioData[] = expenseData.map((item) => ({
    date: item.date,
    legalRatio: (item.legal / fundSize) * 100,
    administrationRatio: (item.administration / fundSize) * 100,
    taxRatio: (item.tax / fundSize) * 100,
    auditRatio: (item.audit / fundSize) * 100,
    softwareRatio: (item.software / fundSize) * 100,
    setupRatio: (item.setup / fundSize) * 100,
    otherRatio: (item.other / fundSize) * 100,
    totalRatio: (item.total / fundSize) * 100,
  }));

  // Color scheme for expense categories
  const expenseColors = {
    legal: '#60a5fa', // Blue
    administration: '#1e293b', // Dark slate
    tax: '#94a3b8', // Light slate
    audit: '#fb923c', // Orange
    software: '#22c55e', // Green
    setup: '#a855f7', // Purple
    other: '#ef4444', // Red
    total: '#fbbf24', // Yellow
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toLocaleString()}`;
  };

  const formatPercent = (value: number) => `${value.toFixed(3)}%`;

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ dataKey: string; value: number; color: string }>;
    label?: string;
  }) => {
    if (active && payload && payload.length) {
      const currentData =
        viewType === 'expenses'
          ? expenseData.find((d) => d.date === label)
          : expenseRatioData.find((d) => d.date === label);

      if (!currentData) return null;

      const formatDate = (dateStr: string) => {
        const date = new Date(`${dateStr}-01`);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      };

      const totalValue =
        viewType === 'expenses'
          ? (currentData as ExpenseData).total
          : (currentData as ExpenseRatioData).totalRatio;

      return (
        <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg max-w-xs">
          <p className="font-medium mb-2">{label ? formatDate(label) : ''}</p>
          <p className="font-bold text-yellow-600 mb-2">
            Total:{' '}
            {viewType === 'expenses' ? formatCurrency(totalValue) : formatPercent(totalValue)}
          </p>
          <div className="space-y-1 text-sm">
            {payload
              .filter(
                (entry: { dataKey: string; value: number; color: string }) =>
                  entry.dataKey !== 'total' && entry.dataKey !== 'totalRatio'
              )
              .sort((a: { value: number }, b: { value: number }) => b.value - a.value)
              .map((entry: { dataKey: string; value: number; color: string }, index: number) => (
                <div key={index} className="flex justify-between items-center">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: entry.color }} />
                    <span className="capitalize">
                      {entry.dataKey
                        .replace('Ratio', '')
                        .replace(/([A-Z])/g, ' $1')
                        .trim()}
                    </span>
                  </div>
                  <span className="font-medium">
                    {viewType === 'expenses'
                      ? formatCurrency(entry.value)
                      : formatPercent(entry.value)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center space-x-2">
            <DollarSign className="h-6 w-6 text-blue-600" />
            <span>Fund Expenses</span>
          </h2>
          <p className="text-muted-foreground">
            Actual and projected fund expenses and expense ratios by line item
          </p>
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

      {/* Toggle between Expenses and Ratios */}
      <div className="flex items-center space-x-4">
        <Button
          variant={viewType === 'expenses' ? 'default' : 'outline'}
          onClick={() => setViewType('expenses')}
          className="flex items-center space-x-2"
        >
          <DollarSign className="h-4 w-4" />
          <span>Fund Expenses</span>
        </Button>
        <Button
          variant={viewType === 'ratios' ? 'default' : 'outline'}
          onClick={() => setViewType('ratios')}
          className="flex items-center space-x-2"
        >
          <Percent className="h-4 w-4" />
          <span>Expense Ratio</span>
        </Button>
      </div>

      {/* Charts */}
      <Card>
        <CardHeader>
          <CardTitle>{viewType === 'expenses' ? 'Fund Expenses' : 'Expense Ratio'}</CardTitle>
          <CardDescription>
            {viewType === 'expenses'
              ? 'Cumulative fund expenses over time by category'
              : 'Expense ratios as percentage of fund size over time'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="cumulative">Cumulative</TabsTrigger>
              <TabsTrigger value="period">Period</TabsTrigger>
            </TabsList>

            <TabsContent value="cumulative" className="space-y-4">
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={viewType === 'expenses' ? expenseData : expenseRatioData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value: string) => {
                        const date = new Date(`${value}-01`);
                        return date.toLocaleDateString('en-US', {
                          month: 'short',
                          year: '2-digit',
                        });
                      }}
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value: number) =>
                        viewType === 'expenses' ? formatCurrency(value) : formatPercent(value)
                      }
                    />
                    <Tooltip content={<CustomTooltip />} />

                    {/* Stacked areas for all categories */}
                    <Area
                      type="monotone"
                      dataKey={viewType === 'expenses' ? 'legal' : 'legalRatio'}
                      stackId="1"
                      stroke={expenseColors.legal}
                      fill={expenseColors.legal}
                    />
                    <Area
                      type="monotone"
                      dataKey={viewType === 'expenses' ? 'administration' : 'administrationRatio'}
                      stackId="1"
                      stroke={expenseColors.administration}
                      fill={expenseColors.administration}
                    />
                    <Area
                      type="monotone"
                      dataKey={viewType === 'expenses' ? 'tax' : 'taxRatio'}
                      stackId="1"
                      stroke={expenseColors.tax}
                      fill={expenseColors.tax}
                    />
                    <Area
                      type="monotone"
                      dataKey={viewType === 'expenses' ? 'audit' : 'auditRatio'}
                      stackId="1"
                      stroke={expenseColors.audit}
                      fill={expenseColors.audit}
                    />
                    <Area
                      type="monotone"
                      dataKey={viewType === 'expenses' ? 'software' : 'softwareRatio'}
                      stackId="1"
                      stroke={expenseColors.software}
                      fill={expenseColors.software}
                    />
                    <Area
                      type="monotone"
                      dataKey={viewType === 'expenses' ? 'setup' : 'setupRatio'}
                      stackId="1"
                      stroke={expenseColors.setup}
                      fill={expenseColors.setup}
                    />
                    <Area
                      type="monotone"
                      dataKey={viewType === 'expenses' ? 'other' : 'otherRatio'}
                      stackId="1"
                      stroke={expenseColors.other}
                      fill={expenseColors.other}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>

            <TabsContent value="period" className="space-y-4">
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={
                      viewType === 'expenses' ? expenseData.slice(-12) : expenseRatioData.slice(-12)
                    }
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value: string) => {
                        const date = new Date(`${value}-01`);
                        return date.toLocaleDateString('en-US', { month: 'short' });
                      }}
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value: number) =>
                        viewType === 'expenses' ? formatCurrency(value) : formatPercent(value)
                      }
                    />
                    <Tooltip content={<CustomTooltip />} />

                    {/* Stacked bars for recent periods */}
                    <Bar
                      dataKey={viewType === 'expenses' ? 'legal' : 'legalRatio'}
                      stackId="a"
                      fill={expenseColors.legal}
                    />
                    <Bar
                      dataKey={viewType === 'expenses' ? 'administration' : 'administrationRatio'}
                      stackId="a"
                      fill={expenseColors.administration}
                    />
                    <Bar
                      dataKey={viewType === 'expenses' ? 'tax' : 'taxRatio'}
                      stackId="a"
                      fill={expenseColors.tax}
                    />
                    <Bar
                      dataKey={viewType === 'expenses' ? 'audit' : 'auditRatio'}
                      stackId="a"
                      fill={expenseColors.audit}
                    />
                    <Bar
                      dataKey={viewType === 'expenses' ? 'software' : 'softwareRatio'}
                      stackId="a"
                      fill={expenseColors.software}
                    />
                    <Bar
                      dataKey={viewType === 'expenses' ? 'setup' : 'setupRatio'}
                      stackId="a"
                      fill={expenseColors.setup}
                    />
                    <Bar
                      dataKey={viewType === 'expenses' ? 'other' : 'otherRatio'}
                      stackId="a"
                      fill={expenseColors.other}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>
          </Tabs>

          {/* Legend */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            {Object.entries(expenseColors).map(([category, color]) => (
              <div key={category} className="flex items-center space-x-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: color }} />
                <span className="text-sm capitalize">
                  {category === 'total' ? 'Total' : category}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Summary Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-3">
              <DollarSign className="h-8 w-8 text-blue-600" />
              <div>
                <div className="text-sm text-blue-800">Total Expenses</div>
                <div className="font-bold text-blue-900">
                  {formatCurrency(expenseData[expenseData.length - 1]?.total || 0)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-3">
              <Percent className="h-8 w-8 text-green-600" />
              <div>
                <div className="text-sm text-green-800">Total Expense Ratio</div>
                <div className="font-bold text-green-900">
                  {formatPercent(expenseRatioData[expenseRatioData.length - 1]?.totalRatio || 0)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-3">
              <TrendingUp className="h-8 w-8 text-orange-600" />
              <div>
                <div className="text-sm text-orange-800">Largest Category</div>
                <div className="font-bold text-orange-900">Administration</div>
                <div className="text-xs text-orange-700">0.75% ratio</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-200 bg-purple-50">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-3">
              <Info className="h-8 w-8 text-purple-600" />
              <div>
                <div className="text-sm text-purple-800">Active Categories</div>
                <div className="font-bold text-purple-900">7</div>
                <div className="text-xs text-purple-700">Expense types</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
