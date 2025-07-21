import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { 
  BarChart3, 
  LineChart as LineChartIcon, 
  PieChart as PieChartIcon, 
  AreaChart,
  Workflow,
  TreePine,
  Grid,
  Share2 
} from "lucide-react";

interface ChartType {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: any;
  color: string;
}

const chartTypes: ChartType[] = [
  { id: 'line', name: 'Line Chart', description: 'Time series data', category: 'basic', icon: LineChartIcon, color: 'text-blue-500' },
  { id: 'bar', name: 'Bar Chart', description: 'Categorical comparison', category: 'basic', icon: BarChart3, color: 'text-cyan-500' },
  { id: 'pie', name: 'Pie Chart', description: 'Proportional data', category: 'basic', icon: PieChartIcon, color: 'text-green-500' },
  { id: 'area', name: 'Area Chart', description: 'Volume over time', category: 'basic', icon: AreaChart, color: 'text-orange-500' },
  { id: 'sankey', name: 'Sankey', description: 'Flow visualization', category: 'flow', icon: Workflow, color: 'text-purple-500' },
  { id: 'treemap', name: 'Treemap', description: 'Hierarchical data', category: 'hierarchical', icon: TreePine, color: 'text-blue-500' },
  { id: 'heatmap', name: 'Heatmap', description: 'Pattern analysis', category: 'statistical', icon: Grid, color: 'text-red-500' },
  { id: 'network', name: 'Network', description: 'Relationship mapping', category: 'advanced', icon: Share2, color: 'text-teal-500' },
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

  const filteredCharts = chartTypes.filter(chart => 
    selectedCategory === 'basic' || chart.category === selectedCategory
  );

  return (
    <Card className="mb-8">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-800">
            AntV Chart Capabilities
          </CardTitle>
          <p className="text-sm text-gray-600">25+ Chart Types Available</p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mb-6">
          {categories.map((category) => (
            <Button
              key={category.id}
              variant={selectedCategory === category.id ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(category.id)}
              className={selectedCategory === category.id ? 'povc-bg-primary-light text-blue-700 border-blue-200' : ''}
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
                className="bg-gray-50 rounded-lg p-4 text-center hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <div className="h-24 flex items-center justify-center mb-3">
                  <Icon className={`h-8 w-8 ${chart.color}`} />
                </div>
                <p className="font-medium text-gray-800 text-sm">{chart.name}</p>
                <p className="text-xs text-gray-600 mt-1">{chart.description}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
