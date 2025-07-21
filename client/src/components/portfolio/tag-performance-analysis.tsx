import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Tag, TrendingUp, DollarSign, Target, BarChart3 } from 'lucide-react';

interface TagPerformance {
  tag: string;
  count: number;
  totalInvested: number;
  currentValue: number;
  moic: number;
  irr: number;
  averageInvestment: number;
  topPerformer: string;
  performance: 'excellent' | 'good' | 'average' | 'poor';
}

// Mock data based on the Tactyc image showing tag performance
const MOCK_TAG_PERFORMANCE: TagPerformance[] = [
  {
    tag: 'Asia',
    count: 3,
    totalInvested: 2608042,
    currentValue: 4100000,
    moic: 1.57,
    irr: 18.5,
    averageInvestment: 869347,
    topPerformer: 'AsiaFlow Systems',
    performance: 'good'
  },
  {
    tag: 'General',
    count: 5,
    totalInvested: 2500000,
    currentValue: 3750000,
    moic: 1.50,
    irr: 15.2,
    averageInvestment: 500000,
    topPerformer: 'GenTech Solutions',
    performance: 'good'
  },
  {
    tag: 'Female Founder',
    count: 4,
    totalInvested: 2428571,
    currentValue: 3400000,
    moic: 1.40,
    irr: 22.3,
    averageInvestment: 607143,
    topPerformer: 'FoundHer Inc',
    performance: 'excellent'
  },
  {
    tag: 'Social',
    count: 2,
    totalInvested: 2378437,
    currentValue: 2850000,
    moic: 1.20,
    irr: 8.9,
    averageInvestment: 1189219,
    topPerformer: 'SocialGood Co',
    performance: 'average'
  },
  {
    tag: 'Minority Founder',
    count: 3,
    totalInvested: 2068499,
    currentValue: 2750000,
    moic: 1.33,
    irr: 19.7,
    averageInvestment: 689500,
    topPerformer: 'DiverseTech',
    performance: 'good'
  },
  {
    tag: 'Governance',
    count: 2,
    totalInvested: 1988051,
    currentValue: 2200000,
    moic: 1.11,
    irr: 5.2,
    averageInvestment: 994026,
    topPerformer: 'GovTech Pro',
    performance: 'poor'
  },
  {
    tag: 'Environmental',
    count: 2,
    totalInvested: 1850000,
    currentValue: 2650000,
    moic: 1.43,
    irr: 16.8,
    averageInvestment: 925000,
    topPerformer: 'EcoInnovate',
    performance: 'good'
  },
  {
    tag: 'AI/ML',
    count: 6,
    totalInvested: 3200000,
    currentValue: 5800000,
    moic: 1.81,
    irr: 28.4,
    averageInvestment: 533333,
    topPerformer: 'AI Dynamics',
    performance: 'excellent'
  }
];

interface TagPerformanceAnalysisProps {
  className?: string;
}

export default function TagPerformanceAnalysis({ className = '' }: TagPerformanceAnalysisProps) {
  const [selectedMetric, setSelectedMetric] = useState<'invested' | 'moic' | 'irr' | 'count'>('invested');
  const [chartType, setChartType] = useState<'bar' | 'pie'>('bar');

  const getPerformanceColor = (performance: string) => {
    switch (performance) {
      case 'excellent': return 'bg-green-100 text-green-800 border-green-200';
      case 'good': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'average': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'poor': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
    return `$${value.toLocaleString()}`;
  };

  const getChartData = () => {
    return MOCK_TAG_PERFORMANCE.map(tag => ({
      name: tag.tag,
      value: selectedMetric === 'invested' ? tag.totalInvested :
             selectedMetric === 'moic' ? tag.moic :
             selectedMetric === 'irr' ? tag.irr :
             tag.count,
      display: selectedMetric === 'invested' ? formatCurrency(tag.totalInvested) :
               selectedMetric === 'moic' ? `${tag.moic.toFixed(2)}x` :
               selectedMetric === 'irr' ? `${tag.irr.toFixed(1)}%` :
               tag.count.toString()
    }));
  };

  const getMetricLabel = () => {
    switch (selectedMetric) {
      case 'invested': return 'Invested to Date';
      case 'moic': return 'MOIC';
      case 'irr': return 'IRR (%)';
      case 'count': return 'Number of Companies';
      default: return 'Invested to Date';
    }
  };

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'];

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Tag className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold">Tag Performance Analysis</h3>
        </div>
        <div className="flex items-center space-x-2">
          <Select value={selectedMetric} onValueChange={(value: any) => setSelectedMetric(value)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="invested">Invested Amount</SelectItem>
              <SelectItem value="moic">MOIC</SelectItem>
              <SelectItem value="irr">IRR</SelectItem>
              <SelectItem value="count">Company Count</SelectItem>
            </SelectContent>
          </Select>
          <Select value={chartType} onValueChange={(value: any) => setChartType(value)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bar">Bar Chart</SelectItem>
              <SelectItem value="pie">Pie Chart</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{getMetricLabel()}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'bar' ? (
                <BarChart data={getChartData()} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="name" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    fontSize={12}
                  />
                  <YAxis fontSize={12} />
                  <Tooltip 
                    formatter={(value, name) => [getChartData().find(d => d.value === value)?.display || value, getMetricLabel()]}
                  />
                  <Bar dataKey="value" fill="#3b82f6" />
                </BarChart>
              ) : (
                <PieChart>
                  <Pie
                    data={getChartData()}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, display }) => `${name}: ${display}`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {getChartData().map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [getChartData().find(d => d.value === value)?.display || value, getMetricLabel()]} />
                </PieChart>
              )}
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tag Performance Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {MOCK_TAG_PERFORMANCE.map((tag) => (
              <div key={tag.tag} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                <div className="flex items-center space-x-4">
                  <Badge variant="outline" className="font-medium">
                    {tag.tag}
                  </Badge>
                  <Badge className={getPerformanceColor(tag.performance)}>
                    {tag.performance}
                  </Badge>
                  <div className="text-sm text-gray-600">
                    {tag.count} companies
                  </div>
                </div>
                
                <div className="flex items-center space-x-6 text-sm">
                  <div className="text-center">
                    <div className="font-medium">{formatCurrency(tag.totalInvested)}</div>
                    <div className="text-gray-500">Invested</div>
                  </div>
                  <div className="text-center">
                    <div className="font-medium">{tag.moic.toFixed(2)}x</div>
                    <div className="text-gray-500">MOIC</div>
                  </div>
                  <div className="text-center">
                    <div className="font-medium">{tag.irr.toFixed(1)}%</div>
                    <div className="text-gray-500">IRR</div>
                  </div>
                  <div className="text-center">
                    <div className="font-medium">{formatCurrency(tag.averageInvestment)}</div>
                    <div className="text-gray-500">Avg Investment</div>
                  </div>
                  <div className="text-center">
                    <div className="font-medium text-blue-600">{tag.topPerformer}</div>
                    <div className="text-gray-500">Top Performer</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Key Insights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <div>
                <div className="font-medium">Best Performing Tag</div>
                <div className="text-sm text-gray-600">AI/ML (1.81x MOIC)</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <DollarSign className="h-5 w-5 text-blue-600" />
              <div>
                <div className="font-medium">Highest Investment</div>
                <div className="text-sm text-gray-600">AI/ML ($3.2M)</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Target className="h-5 w-5 text-purple-600" />
              <div>
                <div className="font-medium">Most Diversified</div>
                <div className="text-sm text-gray-600">AI/ML (6 companies)</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}