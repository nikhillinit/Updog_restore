/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { 
  BarChart3, 
  LineChart, 
  PieChart, 
  TrendingUp
} from 'lucide-react';

interface ChartBuilderProps {
  onChartChange: (config: any) => void;
}

const CHART_TYPES = [
  { value: 'bar', label: 'Bar Chart', icon: BarChart3 },
  { value: 'line', label: 'Line Chart', icon: LineChart },
  { value: 'pie', label: 'Pie Chart', icon: PieChart },
  { value: 'area', label: 'Area Chart', icon: TrendingUp },
];

const METRICS = [
  { value: 'revenue', label: 'Revenue' },
  { value: 'grossMargin', label: 'Gross Margin' },
  { value: 'burnRate', label: 'Burn Rate' },
  { value: 'cashInBank', label: 'Cash in Bank' },
  { value: 'currentValuation', label: 'Current Valuation' },
  { value: 'totalInvested', label: 'Total Invested' },
  { value: 'employees', label: 'Employee Count' },
  { value: 'arrGrowth', label: 'ARR Growth' },
  { value: 'mrr', label: 'Monthly Recurring Revenue' },
];

const DIMENSIONS = [
  { value: 'name', label: 'Company Name' },
  { value: 'sector', label: 'Sector' },
  { value: 'stage', label: 'Stage' },
  { value: 'quarter', label: 'Time Quarter' },
];

export default function SimpleChartBuilder({ onChartChange }: ChartBuilderProps) {
  const [chartType, setChartType] = useState('bar');
  const [xAxis, setXAxis] = useState('name');
  const [yAxis, setYAxis] = useState('revenue');
  const [title, setTitle] = useState('Revenue by Company');

  const updateChart = (updates: any) => {
    const config = {
      type: chartType,
      xAxis,
      yAxis,
      title,
      ...updates,
    };
    
    onChartChange(config);
  };

  const handleChartTypeChange = (value: string) => {
    setChartType(value);
    updateChart({ type: value });
  };

  const handleXAxisChange = (value: string) => {
    setXAxis(value);
    updateChart({ xAxis: value });
  };

  const handleYAxisChange = (value: string) => {
    setYAxis(value);
    updateChart({ yAxis: value });
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    updateChart({ title: value });
  };

  return (
    <div className="space-y-6">
      {/* Chart Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Chart Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Chart Type</label>
              <Select value={chartType} onValueChange={handleChartTypeChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHART_TYPES.map((type: any) => {
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
              <Select value={xAxis} onValueChange={handleXAxisChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIMENSIONS.map((dim: any) => (
                    <SelectItem key={dim.value} value={dim.value}>
                      {dim.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Y-Axis</label>
              <Select value={yAxis} onValueChange={handleYAxisChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRICS.map((metric: any) => (
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
                value={title}
                onChange={(e: any) => handleTitleChange(e.target.value)}
                placeholder="Chart title"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Configuration Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Current Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              Chart: {CHART_TYPES.find(t => t.value === chartType)?.label}
            </Badge>
            <Badge variant="outline">
              X-Axis: {DIMENSIONS.find(d => d.value === xAxis)?.label}
            </Badge>
            <Badge variant="outline">
              Y-Axis: {METRICS.find(m => m.value === yAxis)?.label}
            </Badge>
            <Badge variant="outline">
              Title: {title}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
