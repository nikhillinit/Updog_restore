import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart3, LineChart, PieChart, TrendingUp, Plus, X } from 'lucide-react';

interface MetricField {
  id: string;
  name: string;
  label: string;
  type: 'currency' | 'percentage' | 'number' | 'date' | 'text';
  category: 'financial' | 'operational' | 'growth' | 'dimension';
}

type MetricCategory = MetricField['category'];
type MetricType = MetricField['type'];

interface ChartArea {
  id: string;
  label: string;
  accepts: MetricCategory[];
  field?: MetricField;
}

type ChartTypeId = 'bar' | 'line' | 'pie' | 'area';

interface ChartConfig {
  type: ChartTypeId;
  xAxis: string;
  yAxis: string;
  groupBy: string;
  title: string;
}

interface ChartTypeOption {
  id: ChartTypeId;
  name: string;
  icon: typeof BarChart3;
  color: string;
}

const AVAILABLE_FIELDS: MetricField[] = [
  // Financial Metrics
  { id: 'revenue', name: 'revenue', label: 'Revenue', type: 'currency', category: 'financial' },
  {
    id: 'grossMargin',
    name: 'grossMargin',
    label: 'Gross Margin',
    type: 'percentage',
    category: 'financial',
  },
  {
    id: 'burnRate',
    name: 'burnRate',
    label: 'Monthly Burn Rate',
    type: 'currency',
    category: 'financial',
  },
  {
    id: 'cashInBank',
    name: 'cashInBank',
    label: 'Cash in Bank',
    type: 'currency',
    category: 'financial',
  },
  {
    id: 'totalInvested',
    name: 'totalInvested',
    label: 'Total Invested',
    type: 'currency',
    category: 'financial',
  },
  {
    id: 'currentValuation',
    name: 'currentValuation',
    label: 'Current Valuation',
    type: 'currency',
    category: 'financial',
  },

  // Growth Metrics
  {
    id: 'arrGrowth',
    name: 'arrGrowth',
    label: 'ARR Growth Rate',
    type: 'percentage',
    category: 'growth',
  },
  {
    id: 'mrr',
    name: 'mrr',
    label: 'Monthly Recurring Revenue',
    type: 'currency',
    category: 'growth',
  },
  {
    id: 'customerGrowth',
    name: 'customerGrowth',
    label: 'Customer Growth',
    type: 'percentage',
    category: 'growth',
  },
  {
    id: 'revenueGrowth',
    name: 'revenueGrowth',
    label: 'Revenue Growth',
    type: 'percentage',
    category: 'growth',
  },

  // Operational Metrics
  {
    id: 'employees',
    name: 'employees',
    label: 'Employee Count',
    type: 'number',
    category: 'operational',
  },
  {
    id: 'burnMultiple',
    name: 'burnMultiple',
    label: 'Burn Multiple',
    type: 'number',
    category: 'operational',
  },
  {
    id: 'runway',
    name: 'runway',
    label: 'Cash Runway (Months)',
    type: 'number',
    category: 'operational',
  },

  // Dimensions
  { id: 'companyName', name: 'name', label: 'Company Name', type: 'text', category: 'dimension' },
  { id: 'sector', name: 'sector', label: 'Sector', type: 'text', category: 'dimension' },
  { id: 'stage', name: 'stage', label: 'Stage', type: 'text', category: 'dimension' },
  { id: 'quarter', name: 'quarter', label: 'Time Quarter', type: 'date', category: 'dimension' },
  { id: 'year', name: 'year', label: 'Year', type: 'date', category: 'dimension' },
];

const CHART_TYPES: ChartTypeOption[] = [
  {
    id: 'bar',
    name: 'Bar Chart',
    icon: BarChart3,
    color: 'bg-presson-info/10 border-presson-info/30',
  },
  { id: 'line', name: 'Line Chart', icon: LineChart, color: 'bg-success/10 border-success/30' },
  {
    id: 'pie',
    name: 'Pie Chart',
    icon: PieChart,
    color: 'bg-presson-info/10 border-presson-info/30',
  },
  {
    id: 'area',
    name: 'Area Chart',
    icon: TrendingUp,
    color: 'bg-presson-warning/10 border-presson-warning/30',
  },
];

const CATEGORIES: MetricCategory[] = ['financial', 'growth', 'operational', 'dimension'];

interface DragDropChartBuilderProps {
  onChartChange: (config: ChartConfig) => void;
}

export default function DragDropChartBuilder({
  onChartChange,
}: DragDropChartBuilderProps): JSX.Element {
  const [selectedChartType, setSelectedChartType] = useState<ChartTypeId>('bar');
  const [chartAreas, setChartAreas] = useState<ChartArea[]>([
    { id: 'x-axis', label: 'X-Axis', accepts: ['dimension'] },
    { id: 'y-axis', label: 'Y-Axis', accepts: ['financial', 'growth', 'operational'] },
    { id: 'group-by', label: 'Group By (Optional)', accepts: ['dimension'] },
    { id: 'filter', label: 'Filter By (Optional)', accepts: ['dimension'] },
  ]);

  const buildConfig = (areas: ChartArea[], chartType: ChartTypeId): ChartConfig => ({
    type: chartType,
    xAxis: areas.find((a) => a.id === 'x-axis')?.field?.name ?? '',
    yAxis: areas.find((a) => a.id === 'y-axis')?.field?.name ?? '',
    groupBy: areas.find((a) => a.id === 'group-by')?.field?.name ?? '',
    title: generateChartTitle(areas),
  });

  const addFieldToArea = (field: MetricField, areaId: string) => {
    const area = chartAreas.find((a) => a.id === areaId);
    if (area && area.accepts.includes(field.category)) {
      const newAreas = chartAreas.map((a) => (a.id === areaId ? { ...a, field } : a));
      setChartAreas(newAreas);
      onChartChange(buildConfig(newAreas, selectedChartType));
    }
  };

  const generateChartTitle = (areas: ChartArea[]) => {
    const yAxis = areas.find((a) => a.id === 'y-axis')?.field?.label;
    const xAxis = areas.find((a) => a.id === 'x-axis')?.field?.label;

    if (yAxis && xAxis) {
      return `${yAxis} by ${xAxis}`;
    }
    return 'Custom Chart';
  };

  const removeFieldFromArea = (areaId: string) => {
    const newAreas = chartAreas.map((a) => {
      if (a.id === areaId) {
        const { field: _removed, ...rest } = a;
        return rest as ChartArea;
      }
      return a;
    });
    setChartAreas(newAreas);
    onChartChange(buildConfig(newAreas, selectedChartType));
  };

  const getCategoryColor = (category: MetricCategory) => {
    switch (category) {
      case 'financial':
        return 'bg-pov-gray border-pov-charcoal text-presson-info';
      case 'growth':
        return 'bg-success/10 border-success/30 text-success-dark';
      case 'operational':
        return 'bg-presson-info/10 border-presson-info/20 text-presson-info';
      case 'dimension':
        return 'bg-pov-gray border-beige-200 text-pov-charcoal';
    }
  };

  const getCategoryIcon = (type: MetricType) => {
    switch (type) {
      case 'currency':
        return '$';
      case 'percentage':
        return '%';
      case 'number':
        return '#';
      case 'date':
        return 'D';
      case 'text':
        return 'T';
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
              {CATEGORIES.map((category) => (
                <div key={category}>
                  <h4 className="text-xs font-semibold text-charcoal-600 uppercase tracking-wide mb-2">
                    {category.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())}
                  </h4>
                  <div className="space-y-2">
                    {AVAILABLE_FIELDS.filter((field) => field.category === category).map(
                      (field) => (
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
                                .filter((area) => area.accepts.includes(field.category))
                                .map((area) => (
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
                      )
                    )}
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
              {CHART_TYPES.map((chartType) => {
                const Icon = chartType.icon;
                return (
                  <div
                    key={chartType.id}
                    className={`
                      p-3 rounded-lg border-2 cursor-pointer transition-all
                      ${
                        selectedChartType === chartType.id
                          ? `${chartType.color} border-current shadow-md`
                          : 'border-beige-200 hover:border-charcoal-300'
                      }
                    `}
                    onClick={() => {
                      setSelectedChartType(chartType.id);
                      onChartChange(buildConfig(chartAreas, chartType.id));
                    }}
                  >
                    <div className="flex flex-col items-center space-y-2">
                      <Icon className="h-6 w-6" />
                      <span className="text-xs font-medium text-center">{chartType.name}</span>
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
            <p className="text-xs text-charcoal-600">
              Drag fields from the left panel into the areas below to build your chart
            </p>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 gap-4">
              {chartAreas.map((area) => (
                <div key={area.id} className="space-y-2">
                  <label className="text-sm font-medium text-charcoal-700">{area.label}</label>
                  <div
                    className={`
                      min-h-[80px] p-4 rounded-lg border-2 border-dashed transition-colors
                      ${area.field ? 'border-success/30 bg-success/10' : 'border-charcoal-300 bg-pov-gray'}
                    `}
                  >
                    {area.field ? (
                      <div
                        className={`p-2 rounded border ${getCategoryColor(area.field.category)}`}
                      >
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
                      <div className="flex items-center justify-center h-full text-charcoal-500">
                        <div className="text-center">
                          <div className="text-sm">Click + on field to add here</div>
                          <div className="text-xs mt-1">Accepts: {area.accepts.join(', ')}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Configuration Summary */}
            <div className="mt-6 p-4 bg-pov-gray rounded-lg">
              <h4 className="text-sm font-medium mb-2">Current Configuration</h4>
              <div className="space-y-1 text-xs">
                <div>
                  Chart Type: <Badge variant="outline">{selectedChartType}</Badge>
                </div>
                <div>
                  X-Axis:{' '}
                  <Badge variant="outline">
                    {chartAreas.find((a) => a.id === 'x-axis')?.field?.label ?? 'None'}
                  </Badge>
                </div>
                <div>
                  Y-Axis:{' '}
                  <Badge variant="outline">
                    {chartAreas.find((a) => a.id === 'y-axis')?.field?.label ?? 'None'}
                  </Badge>
                </div>
                {chartAreas.find((a) => a.id === 'group-by')?.field && (
                  <div>
                    Group By:{' '}
                    <Badge variant="outline">
                      {chartAreas.find((a) => a.id === 'group-by')?.field?.label}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
