/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  BarChart3, 
  LineChart, 
  PieChart, 
  TrendingUp,
  Plus,
  X
} from 'lucide-react';

interface MetricField {
  id: string;
  name: string;
  label: string;
  type: 'currency' | 'percentage' | 'number' | 'date' | 'text';
  category: 'financial' | 'operational' | 'growth' | 'dimension';
}

interface ChartArea {
  id: string;
  label: string;
  accepts: string[];
  field?: MetricField;
}

const AVAILABLE_FIELDS: MetricField[] = [
  // Financial Metrics
  { id: 'revenue', name: 'revenue', label: 'Revenue', type: 'currency', category: 'financial' },
  { id: 'grossMargin', name: 'grossMargin', label: 'Gross Margin', type: 'percentage', category: 'financial' },
  { id: 'burnRate', name: 'burnRate', label: 'Monthly Burn Rate', type: 'currency', category: 'financial' },
  { id: 'cashInBank', name: 'cashInBank', label: 'Cash in Bank', type: 'currency', category: 'financial' },
  { id: 'totalInvested', name: 'totalInvested', label: 'Total Invested', type: 'currency', category: 'financial' },
  { id: 'currentValuation', name: 'currentValuation', label: 'Current Valuation', type: 'currency', category: 'financial' },
  
  // Growth Metrics
  { id: 'arrGrowth', name: 'arrGrowth', label: 'ARR Growth Rate', type: 'percentage', category: 'growth' },
  { id: 'mrr', name: 'mrr', label: 'Monthly Recurring Revenue', type: 'currency', category: 'growth' },
  { id: 'customerGrowth', name: 'customerGrowth', label: 'Customer Growth', type: 'percentage', category: 'growth' },
  { id: 'revenueGrowth', name: 'revenueGrowth', label: 'Revenue Growth', type: 'percentage', category: 'growth' },
  
  // Operational Metrics
  { id: 'employees', name: 'employees', label: 'Employee Count', type: 'number', category: 'operational' },
  { id: 'burnMultiple', name: 'burnMultiple', label: 'Burn Multiple', type: 'number', category: 'operational' },
  { id: 'runway', name: 'runway', label: 'Cash Runway (Months)', type: 'number', category: 'operational' },
  
  // Dimensions
  { id: 'companyName', name: 'name', label: 'Company Name', type: 'text', category: 'dimension' },
  { id: 'sector', name: 'sector', label: 'Sector', type: 'text', category: 'dimension' },
  { id: 'stage', name: 'stage', label: 'Stage', type: 'text', category: 'dimension' },
  { id: 'quarter', name: 'quarter', label: 'Time Quarter', type: 'date', category: 'dimension' },
  { id: 'year', name: 'year', label: 'Year', type: 'date', category: 'dimension' },
];

const CHART_TYPES = [
  { id: 'bar', name: 'Bar Chart', icon: BarChart3, color: 'bg-blue-100 border-blue-300' },
  { id: 'line', name: 'Line Chart', icon: LineChart, color: 'bg-green-100 border-green-300' },
  { id: 'pie', name: 'Pie Chart', icon: PieChart, color: 'bg-purple-100 border-purple-300' },
  { id: 'area', name: 'Area Chart', icon: TrendingUp, color: 'bg-orange-100 border-orange-300' },
];

interface DragDropChartBuilderProps {
  onChartChange: (config: any) => void;
}

export default function DragDropChartBuilder({ onChartChange }: DragDropChartBuilderProps): JSX.Element {
  const [selectedChartType, setSelectedChartType] = useState('bar');
  const [chartAreas, setChartAreas] = useState<ChartArea[]>([
    { id: 'x-axis', label: 'X-Axis', accepts: ['dimension'] },
    { id: 'y-axis', label: 'Y-Axis', accepts: ['financial', 'growth', 'operational'] },
    { id: 'group-by', label: 'Group By (Optional)', accepts: ['dimension'] },
    { id: 'filter', label: 'Filter By (Optional)', accepts: ['dimension'] },
  ]);

  const addFieldToArea = (field: MetricField, areaId: string) => {
    const area = chartAreas.find(a => a.id === areaId);
    if (area && area.accepts.includes(field.category)) {
      const newAreas = chartAreas.map(a => 
        a.id === areaId ? { ...a, field } : a
      );
      setChartAreas(newAreas);
      
      const config = {
        type: selectedChartType,
        xAxis: newAreas.find(a => a.id === 'x-axis')?.field?.name || '',
        yAxis: newAreas.find(a => a.id === 'y-axis')?.field?.name || '',
        groupBy: newAreas.find(a => a.id === 'group-by')?.field?.name || '',
        title: generateChartTitle(newAreas),
      };
      onChartChange(config);
    }
  };

  const handleDragEnd = (field: MetricField, areaId: string) => {
    addFieldToArea(field, areaId);
  };

  const generateChartTitle = (areas: ChartArea[]) => {
    const yAxis = areas.find(a => a.id === 'y-axis')?.field?.label;
    const xAxis = areas.find(a => a.id === 'x-axis')?.field?.label;
    
    if (yAxis && xAxis) {
      return `${yAxis} by ${xAxis}`;
    }
    return 'Custom Chart';
  };

  const removeFieldFromArea = (areaId: string) => {
    const newAreas = chartAreas.map(a => 
      a.id === areaId ? { ...a, field: undefined } : a
    );
    setChartAreas(newAreas);
    
    const config = {
      type: selectedChartType,
      xAxis: newAreas.find(a => a.id === 'x-axis')?.field?.name || '',
      yAxis: newAreas.find(a => a.id === 'y-axis')?.field?.name || '',
      groupBy: newAreas.find(a => a.id === 'group-by')?.field?.name || '',
      title: generateChartTitle(newAreas),
    };
    onChartChange(config);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'financial': return 'bg-blue-50 border-blue-200 text-blue-800';
      case 'growth': return 'bg-green-50 border-green-200 text-green-800';
      case 'operational': return 'bg-purple-50 border-purple-200 text-purple-800';
      case 'dimension': return 'bg-gray-50 border-gray-200 text-gray-800';
      default: return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  const getCategoryIcon = (type: string) => {
    switch (type) {
      case 'currency': return '$';
      case 'percentage': return '%';
      case 'number': return '#';
      case 'date': return '📅';
      default: return 'T';
    }
  };

  return (
    <div className="grid grid-cols-12 gap-6 h-full">
      {/* Left Sidebar - Available Fields */}
      <div className="col-span-3">
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="text-sm">Available Fields</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-4">
              {['financial', 'growth', 'operational', 'dimension'].map(category => (
                <div key={category}>
                  <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                    {category.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                  </h4>
                  <div className="space-y-2">
                    {AVAILABLE_FIELDS
                      .filter(field => field.category === category)
                      .map((field: any) => (
                        <div
                          key={field.id}
                          className={`p-2 rounded border-2 text-xs cursor-pointer transition-all ${getCategoryColor(field.category)} hover:shadow-md`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span className="font-mono text-xs bg-white px-1 rounded">
                                {getCategoryIcon(field.type)}
                              </span>
                              <span className="font-medium">{field.label}</span>
                            </div>
                            <div className="flex space-x-1">
                              {chartAreas
                                .filter(area => area.accepts.includes(field.category))
                                .map(area => (
                                  <Button
                                    key={area.id}
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 w-5 p-0"
                                    onClick={() => addFieldToArea(field, area.id)}
                                    title={`Add to ${area.label}`}
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                ))}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Middle - Chart Type Selection */}
      <div className="col-span-2">
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="text-sm">Chart Type</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-3">
              {CHART_TYPES.map(chartType => {
                const Icon = chartType.icon;
                return (
                  <div
                    key={chartType.id}
                    className={`
                      p-3 rounded-lg border-2 cursor-pointer transition-all
                      ${selectedChartType === chartType.id 
                        ? `${chartType.color} border-current shadow-md` 
                        : 'border-gray-200 hover:border-gray-300'
                      }
                    `}
                    onClick={() => {
                      setSelectedChartType(chartType.id);
                      const config = {
                        type: chartType.id,
                        xAxis: chartAreas.find(a => a.id === 'x-axis')?.field?.name || '',
                        yAxis: chartAreas.find(a => a.id === 'y-axis')?.field?.name || '',
                        groupBy: chartAreas.find(a => a.id === 'group-by')?.field?.name || '',
                        title: generateChartTitle(chartAreas),
                      };
                      onChartChange(config);
                    }}
                  >
                    <div className="flex flex-col items-center space-y-2">
                      <Icon className="h-6 w-6" />
                      <span className="text-xs font-medium text-center">
                        {chartType.name}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right - Chart Configuration Areas */}
      <div className="col-span-7">
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="text-sm">Chart Configuration</CardTitle>
            <p className="text-xs text-gray-600">
              Drag fields from the left panel into the areas below to build your chart
            </p>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 gap-4">
              {chartAreas.map(area => (
                <div key={area.id} className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    {area.label}
                  </label>
                  <div
                    className={`
                      min-h-[80px] p-4 rounded-lg border-2 border-dashed transition-colors
                      ${area.field 
                        ? 'border-green-300 bg-green-50'
                        : 'border-gray-300 bg-gray-50'
                      }
                    `}
                  >
                    {area.field ? (
                      <div className={`p-2 rounded border ${getCategoryColor(area.field.category)}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-xs bg-white px-1 rounded">
                              {getCategoryIcon(area.field.type)}
                            </span>
                            <span className="text-sm font-medium">{area.field.label}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0"
                            onClick={() => removeFieldFromArea(area.id)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-500">
                        <div className="text-center">
                          <div className="text-sm">Click + on field to add here</div>
                          <div className="text-xs mt-1">
                            Accepts: {area.accepts.join(', ')}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Configuration Summary */}
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h4 className="text-sm font-medium mb-2">Current Configuration</h4>
              <div className="space-y-1 text-xs">
                <div>Chart Type: <Badge variant="outline">{selectedChartType}</Badge></div>
                <div>X-Axis: <Badge variant="outline">{chartAreas.find(a => a.id === 'x-axis')?.field?.label || 'None'}</Badge></div>
                <div>Y-Axis: <Badge variant="outline">{chartAreas.find(a => a.id === 'y-axis')?.field?.label || 'None'}</Badge></div>
                {chartAreas.find(a => a.id === 'group-by')?.field && (
                  <div>Group By: <Badge variant="outline">{chartAreas.find(a => a.id === 'group-by')?.field?.label}</Badge></div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
