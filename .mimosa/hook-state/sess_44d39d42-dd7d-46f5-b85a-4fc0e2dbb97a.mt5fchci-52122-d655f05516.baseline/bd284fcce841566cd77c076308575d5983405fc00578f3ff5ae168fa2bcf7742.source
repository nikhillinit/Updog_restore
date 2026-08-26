import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import {
  BarChart3,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  AreaChart,
  Workflow,
  TreePine,
  Grid,
  Share2,
} from 'lucide-react';
import type { IconComponent } from '@/types/icons';

interface ChartType {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: IconComponent;
  color: string;
}

const chartTypes: ChartType[] = [
  {
    id: 'line',
    name: 'Line Chart',
    description: 'Time series data',
    category: 'basic',
    icon: LineChartIcon,
    color: 'text-pov-charcoal',
  },
  {
    id: 'bar',
    name: 'Bar Chart',
    description: 'Categorical comparison',
    category: 'basic',
    icon: BarChart3,
    color: 'text-pov-charcoal',
  },
  {
    id: 'pie',
    name: 'Pie Chart',
    description: 'Proportional data',
    category: 'basic',
    icon: PieChartIcon,
    color: 'text-pov-charcoal',
  },
  {
    id: 'area',
    name: 'Area Chart',
    description: 'Volume over time',
    category: 'basic',
    icon: AreaChart,
    color: 'text-pov-charcoal',
  },
  {
    id: 'sankey',
    name: 'Sankey',
    description: 'Flow visualization',
    category: 'flow',
    icon: Workflow,
    color: 'text-pov-charcoal',
  },
  {
    id: 'treemap',
    name: 'Treemap',
    description: 'Hierarchical data',
    category: 'hierarchical',
    icon: TreePine,
    color: 'text-pov-charcoal',
  },
  {
    id: 'heatmap',
    name: 'Heatmap',
    description: 'Pattern analysis',
    category: 'statistical',
    icon: Grid,
    color: 'text-pov-charcoal',
  },
  {
    id: 'network',
    name: 'Network',
    description: 'Relationship mapping',
    category: 'advanced',
    icon: Share2,
    color: 'text-pov-charcoal',
  },
];

const categories = [
  { id: 'basic', label: 'Basic Charts' },
  { id: 'statistical', label: 'Statistical' },
  { id: 'hierarchical', label: 'Hierarchical' },
  { id: 'flow', label: 'Flow Charts' },
  { id: 'advanced', label: 'Advanced' },
];

export default function ChartGallery() {
  const [selectedCategory, setSelectedCategory] = useState('basic');

  const filteredCharts = chartTypes.filter(
    (chart) => selectedCategory === 'basic' || chart.category === selectedCategory
  );

  return (
    <Card className="mb-8">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-pov-charcoal">
            AntV Chart Capabilities
          </CardTitle>
          <p className="text-sm text-charcoal-600">25+ Chart Types Available</p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mb-6">
          {categories.map((category) => (
            <Button
              key={category.id}
              variant={selectedCategory === category.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(category.id)}
              className={
                selectedCategory === category.id
                  ? 'bg-pov-charcoal text-pov-white border-beige-200'
                  : ''
              }
            >
              {category.label}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredCharts.map((chart) => {
            const Icon = chart.icon;
            return (
              <div
                key={chart.id}
                className="bg-pov-gray/50 rounded-lg p-4 text-center hover:bg-pov-gray transition-colors cursor-pointer"
              >
                <div className="h-24 flex items-center justify-center mb-3">
                  <Icon className={`h-8 w-8 ${chart.color}`} />
                </div>
                <p className="font-medium text-pov-charcoal text-sm">{chart.name}</p>
                <p className="text-xs text-charcoal-600 mt-1">{chart.description}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
