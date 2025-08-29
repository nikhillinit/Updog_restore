/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { BarChart } from 'recharts/es6/chart/BarChart';
import { Bar } from 'recharts/es6/cartesian/Bar';
import { LineChart } from 'recharts/es6/chart/LineChart';
import { Line } from 'recharts/es6/cartesian/Line';
import { XAxis } from 'recharts/es6/cartesian/XAxis';
import { YAxis } from 'recharts/es6/cartesian/YAxis';
import { CartesianGrid } from 'recharts/es6/cartesian/CartesianGrid';
import { Tooltip } from 'recharts/es6/component/Tooltip';
import { ResponsiveContainer } from 'recharts/es6/component/ResponsiveContainer';
import { PieChart } from 'recharts/es6/chart/PieChart';
import { Pie } from 'recharts/es6/polar/Pie';
import { Cell } from 'recharts/es6/component/Cell';
import { Area } from 'recharts/es6/cartesian/Area';
import { AreaChart } from 'recharts/es6/chart/AreaChart';
import { useState, useEffect } from 'react';
import { useFundContext } from '@/contexts/FundContext';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Search,
  Filter,
  Download,
  Save,
  Plus,
  BarChart3,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  TrendingUp,
  Calendar,
  Building2,
  DollarSign,
  FileText,
  Settings,
  Share,
  Eye,
  Trash2,
} from 'lucide-react';

interface PortfolioCompany {
  id: number;
  name: string;
  sector: string;
  stage: string;
  totalInvested: number;
  currentValuation: number;
  lastRoundDate: string;
  revenue: number;
  grossMargin: number;
  burnRate: number;
  cashInBank: number;
  employees: number;
  arrGrowth: number;
  mrr: number;
}

interface AnalyticsView {
  id: string;
  name: string;
  description: string;
  chartType: 'bar' | 'line' | 'pie' | 'area';
  xAxis: string;
  yAxis: string;
  groupBy?: string;
  filters: Record<string, any>;
  notes: string;
  createdAt: string;
  lastModified: string;
}

interface ChartConfig {
  type: 'bar' | 'line' | 'pie' | 'area';
  title: string;
  xAxis: string;
  yAxis: string;
  groupBy?: string;
  filters: Record<string, any>;
}

const CHART_TYPES = [
  { value: 'bar', label: 'Bar Chart', icon: BarChart3 },
  { value: 'line', label: 'Line Chart', icon: LineChartIcon },
  { value: 'pie', label: 'Pie Chart', icon: PieChartIcon },
  { value: 'area', label: 'Area Chart', icon: TrendingUp },
];

const METRICS = [
  { value: 'revenue', label: 'Revenue', type: 'currency' },
  { value: 'grossMargin', label: 'Gross Margin', type: 'percentage' },
  { value: 'burnRate', label: 'Burn Rate', type: 'currency' },
  { value: 'cashInBank', label: 'Cash in Bank', type: 'currency' },
  { value: 'currentValuation', label: 'Current Valuation', type: 'currency' },
  { value: 'totalInvested', label: 'Total Invested', type: 'currency' },
  { value: 'employees', label: 'Employee Count', type: 'number' },
  { value: 'arrGrowth', label: 'ARR Growth', type: 'percentage' },
  { value: 'mrr', label: 'Monthly Recurring Revenue', type: 'currency' },
];

const DIMENSIONS = [
  { value: 'name', label: 'Company Name' },
  { value: 'sector', label: 'Sector' },
  { value: 'stage', label: 'Stage' },
  { value: 'quarter', label: 'Time Quarter' },
  { value: 'year', label: 'Year' },
];

const SAMPLE_COMPANIES: PortfolioCompany[] = [
  {
    id: 1,
    name: 'TechFlow',
    sector: 'SaaS',
    stage: 'Series A',
    totalInvested: 5000000,
    currentValuation: 25000000,
    lastRoundDate: '2024-01-15',
    revenue: 8500000,
    grossMargin: 0.78,
    burnRate: 450000,
    cashInBank: 12000000,
    employees: 65,
    arrGrowth: 0.32,
    mrr: 708333,
  },
  {
    id: 2,
    name: 'DataVision',
    sector: 'AI/ML',
    stage: 'Seed',
    totalInvested: 2000000,
    currentValuation: 12000000,
    lastRoundDate: '2023-11-20',
    revenue: 3200000,
    grossMargin: 0.65,
    burnRate: 280000,
    cashInBank: 6500000,
    employees: 28,
    arrGrowth: 0.45,
    mrr: 266667,
  },
  {
    id: 3,
    name: 'FinanceHub',
    sector: 'FinTech',
    stage: 'Series B',
    totalInvested: 12000000,
    currentValuation: 65000000,
    lastRoundDate: '2024-03-10',
    revenue: 18500000,
    grossMargin: 0.72,
    burnRate: 850000,
    cashInBank: 28000000,
    employees: 145,
    arrGrowth: 0.28,
    mrr: 1541667,
  },
  {
    id: 4,
    name: 'HealthTech Pro',
    sector: 'Healthcare',
    stage: 'Series A',
    totalInvested: 7500000,
    currentValuation: 35000000,
    lastRoundDate: '2023-09-05',
    revenue: 12000000,
    grossMargin: 0.68,
    burnRate: 650000,
    cashInBank: 18500000,
    employees: 92,
    arrGrowth: 0.38,
    mrr: 1000000,
  },
  {
    id: 5,
    name: 'EduPlatform',
    sector: 'EdTech',
    stage: 'Seed',
    totalInvested: 1500000,
    currentValuation: 8000000,
    lastRoundDate: '2024-02-28',
    revenue: 1800000,
    grossMargin: 0.82,
    burnRate: 185000,
    cashInBank: 3200000,
    employees: 18,
    arrGrowth: 0.55,
    mrr: 150000,
  },
];

export default function PortfolioAnalyticsDashboard() {
  const { currentFund } = useFundContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [_selectedView, _setSelectedView] = useState<string>('all-views');
  const [savedViews, setSavedViews] = useState<AnalyticsView[]>([]);
  const [currentChart, setCurrentChart] = useState<ChartConfig>({
    type: 'bar',
    title: 'Revenue by Company',
    xAxis: 'name',
    yAxis: 'revenue',
    filters: {},
  });
  const [showCreateView, setShowCreateView] = useState(false);
  const [viewNotes, setViewNotes] = useState('');
  const [displayMode, setDisplayMode] = useState<'results' | 'chart' | 'both'>('both');

  // Mock data for portfolio companies - replace with actual API call
  const portfolioData = SAMPLE_COMPANIES;

  const formatCurrency = (value: number) => {
    if (value >= 1000000000) return `$${(value / 1000000000).toFixed(1)}B`;
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toLocaleString()}`;
  };

  const formatPercentage = (value: number) => `${(value * 100).toFixed(1)}%`;

  const formatValue = (value: number, type: string) => {
    switch (type) {
      case 'currency': return formatCurrency(value);
      case 'percentage': return formatPercentage(value);
      default: return value.toLocaleString();
    }
  };

  const getChartData = () => {
    return portfolioData.map(company => ({
      ...company,
      [currentChart.xAxis]: company[currentChart.xAxis as keyof PortfolioCompany],
      [currentChart.yAxis]: company[currentChart.yAxis as keyof PortfolioCompany],
    }));
  };

  const renderChart = () => {
    const data = getChartData();
    const yMetric = METRICS.find(m => m.value === currentChart.yAxis);
    
    switch (currentChart.type) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={currentChart.xAxis} />
              <YAxis tickFormatter={(value) => formatValue(value, yMetric?.type || 'number')} />
              <Tooltip 
                formatter={(value: number) => [formatValue(value, yMetric?.type || 'number'), yMetric?.label]}
              />
              <Bar dataKey={currentChart.yAxis} fill="#3B82F6" />
            </BarChart>
          </ResponsiveContainer>
        );
      
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={currentChart.xAxis} />
              <YAxis tickFormatter={(value) => formatValue(value, yMetric?.type || 'number')} />
              <Tooltip 
                formatter={(value: number) => [formatValue(value, yMetric?.type || 'number'), yMetric?.label]}
              />
              <Line type="monotone" dataKey={currentChart.yAxis} stroke="#3B82F6" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        );
      
      case 'area':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={currentChart.xAxis} />
              <YAxis tickFormatter={(value) => formatValue(value, yMetric?.type || 'number')} />
              <Tooltip 
                formatter={(value: number) => [formatValue(value, yMetric?.type || 'number'), yMetric?.label]}
              />
              <Area type="monotone" dataKey={currentChart.yAxis} stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.3} />
            </AreaChart>
          </ResponsiveContainer>
        );
      
      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <PieChart>
              <Pie
                data={data}
                dataKey={currentChart.yAxis}
                nameKey={currentChart.xAxis}
                cx="50%"
                cy="50%"
                outerRadius={120}
                fill="#3B82F6"
                label={(props) => {
                  // Handle the case where props might have undefined properties
                  const name = props.name ?? '';
                  const value = props.value ?? 0;
                  return `${name}: ${formatValue(value, yMetric?.type ? yMetric.type : 'number')}`;
                }}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={`hsl(${210 + index * 30}, 70%, 50%)`} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => formatValue(value, yMetric?.type || 'number')} />
            </PieChart>
          </ResponsiveContainer>
        );
      
      default:
        return null;
    }
  };

  const saveCurrentView = () => {
    const newView: AnalyticsView = {
      id: `view-${Date.now()}`,
      name: currentChart.title,
      description: `${currentChart.type} chart showing ${currentChart.yAxis} by ${currentChart.xAxis}`,
      chartType: currentChart.type,
      xAxis: currentChart.xAxis,
      yAxis: currentChart.yAxis,
      groupBy: currentChart.groupBy,
      filters: currentChart.filters,
      notes: viewNotes,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
    };
    
    setSavedViews(prev => [...prev, newView]);
    setShowCreateView(false);
    setViewNotes('');
  };

  const loadSavedView = (view: AnalyticsView) => {
    setCurrentChart({
      type: view.chartType,
      title: view.name,
      xAxis: view.xAxis,
      yAxis: view.yAxis,
      groupBy: view.groupBy,
      filters: view.filters,
    });
    setViewNotes(view.notes);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Portfolio Analytics</h1>
            <p className="text-gray-600 mt-1">Explore, visualize, and analyze your portfolio company data</p>
          </div>
          <div className="flex items-center space-x-3">
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button variant="outline" size="sm">
              <Share className="h-4 w-4 mr-2" />
              Share
            </Button>
            <Dialog open={showCreateView} onOpenChange={setShowCreateView}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Save className="h-4 w-4 mr-2" />
                  Save View
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Save Analytics View</DialogTitle>
                  <DialogDescription>
                    Save this configuration to quickly access it later
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <Input
                    placeholder="View name"
                    value={currentChart.title}
                    onChange={(e) => setCurrentChart(prev => ({ ...prev, title: e.target.value }))}
                  />
                  <Textarea
                    placeholder="Add notes about this analysis (optional)"
                    value={viewNotes}
                    onChange={(e) => setViewNotes(e.target.value)}
                    rows={3}
                  />
                  <div className="flex justify-end space-x-2">
                    <Button variant="outline" onClick={() => setShowCreateView(false)}>
                      Cancel
                    </Button>
                    <Button onClick={saveCurrentView}>
                      Save View
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-120px)]">
        {/* Left Sidebar - Data Sources & Saved Views */}
        <div className="w-80 bg-white border-r border-gray-200 p-4 overflow-y-auto">
          <div className="space-y-6">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search data sources..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Topics/Data Sources */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">TOPICS</h3>
              <div className="space-y-2">
                <div className="p-2 rounded bg-blue-50 border border-blue-200">
                  <div className="font-medium text-blue-900">Portfolio Overview</div>
                  <div className="text-xs text-blue-600">Latest company metrics</div>
                </div>
                <div className="p-2 rounded hover:bg-gray-50 border">
                  <div className="font-medium">Financial Performance</div>
                  <div className="text-xs text-gray-600">Revenue, margins, burn rates</div>
                </div>
                <div className="p-2 rounded hover:bg-gray-50 border">
                  <div className="font-medium">Growth Metrics</div>
                  <div className="text-xs text-gray-600">ARR, MRR, user growth</div>
                </div>
                <div className="p-2 rounded hover:bg-gray-50 border">
                  <div className="font-medium">Operational Data</div>
                  <div className="text-xs text-gray-600">Team size, cash runway</div>
                </div>
              </div>
            </div>

            {/* Saved Views */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">SAVED VIEWS</h3>
              <div className="space-y-2">
                {savedViews.map((view) => (
                  <div
                    key={view.id}
                    className="p-2 rounded border hover:bg-gray-50 cursor-pointer"
                    onClick={() => loadSavedView(view)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm">{view.name}</div>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="text-xs text-gray-600">{view.description}</div>
                    {view.notes && (
                      <div className="text-xs text-gray-500 mt-1 italic">"{view.notes}"</div>
                    )}
                  </div>
                ))}
                
                {savedViews.length === 0 && (
                  <div className="text-center py-4 text-gray-500">
                    <Eye className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    <div className="text-sm">No saved views yet</div>
                    <div className="text-xs">Create custom analyses to save them here</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 p-6 overflow-y-auto">
          {/* Chart Builder Controls */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Chart Builder</span>
                <div className="flex items-center space-x-2">
                  <Tabs value={displayMode} onValueChange={(value: any) => setDisplayMode(value)}>
                    <TabsList>
                      <TabsTrigger value="results">Results</TabsTrigger>
                      <TabsTrigger value="chart">Chart</TabsTrigger>
                      <TabsTrigger value="both">Both</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4 mr-2" />
                    Options
                  </Button>
                  <Button variant="outline" size="sm">
                    <Filter className="h-4 w-4 mr-2" />
                    Filters
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Chart Type</label>
                  <Select value={currentChart.type} onValueChange={(value: any) => 
                    setCurrentChart(prev => ({ ...prev, type: value }))
                  }>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHART_TYPES.map((type) => {
                        const Icon = type.icon;
                        return (
                          <SelectItem key={type.value} value={type.value}>
                            <div className="flex items-center">
                              <Icon className="h-4 w-4 mr-2" />
                              {type.label}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">X-Axis</label>
                  <Select value={currentChart.xAxis} onValueChange={(value) => 
                    setCurrentChart(prev => ({ ...prev, xAxis: value }))
                  }>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DIMENSIONS.map((dim) => (
                        <SelectItem key={dim.value} value={dim.value}>
                          {dim.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Y-Axis</label>
                  <Select value={currentChart.yAxis} onValueChange={(value) => 
                    setCurrentChart(prev => ({ ...prev, yAxis: value }))
                  }>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {METRICS.map((metric) => (
                        <SelectItem key={metric.value} value={metric.value}>
                          {metric.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Title</label>
                  <Input
                    value={currentChart.title}
                    onChange={(e) => setCurrentChart(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Chart title"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Results and Chart */}
          <div className="grid gap-6" style={{ 
            gridTemplateColumns: displayMode === 'both' ? '1fr 1fr' : '1fr' 
          }}>
            {/* Data Table */}
            {(displayMode === 'results' || displayMode === 'both') && (
              <Card>
                <CardHeader>
                  <CardTitle>Portfolio Company Data</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2 font-medium">Company</th>
                          <th className="text-left p-2 font-medium">Sector</th>
                          <th className="text-left p-2 font-medium">Stage</th>
                          <th className="text-left p-2 font-medium">Revenue</th>
                          <th className="text-left p-2 font-medium">Valuation</th>
                          <th className="text-left p-2 font-medium">Margin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {portfolioData.map((company) => (
                          <tr key={company.id} className="border-b hover:bg-gray-50">
                            <td className="p-2 font-medium">{company.name}</td>
                            <td className="p-2">
                              <Badge variant="outline">{company.sector}</Badge>
                            </td>
                            <td className="p-2">
                              <Badge variant="secondary">{company.stage}</Badge>
                            </td>
                            <td className="p-2">{formatCurrency(company.revenue)}</td>
                            <td className="p-2">{formatCurrency(company.currentValuation)}</td>
                            <td className="p-2">{formatPercentage(company.grossMargin)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Chart Display */}
            {(displayMode === 'chart' || displayMode === 'both') && (
              <Card>
                <CardHeader>
                  <CardTitle>{currentChart.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  {renderChart()}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Notes Section */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="h-5 w-5 mr-2" />
                Analysis Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Add qualitative insights, context, or explanations for this analysis..."
                value={viewNotes}
                onChange={(e) => setViewNotes(e.target.value)}
                rows={4}
                className="w-full"
              />
              <div className="mt-2 text-sm text-gray-500">
                Notes will be saved with your analysis views and included in exports.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
