/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect } from 'react';
import { useFundContext } from '@/contexts/FundContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  BarChart3, 
  Settings, 
  Eye, 
  Download,
  Share,
  ArrowLeft,
  TrendingUp 
} from 'lucide-react';
import PortfolioAnalyticsDashboard from './portfolio-analytics-dashboard';
import SimpleChartBuilder from './simple-chart-builder';
import SavedViewsManager from './saved-views-manager';
import BenchmarkingDashboard from './benchmarking-dashboard';
import TagPerformanceAnalysis from './tag-performance-analysis';

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
  createdBy: string;
  isShared: boolean;
  tags: string[];
}

export default function EnhancedPortfolioAnalytics() {
  const { currentFund } = useFundContext();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [savedViews, setSavedViews] = useState<AnalyticsView[]>([]);
  const [currentChartConfig, setCurrentChartConfig] = useState({
    type: 'bar' as 'bar' | 'line' | 'pie' | 'area',
    title: 'Revenue by Company',
    xAxis: 'name',
    yAxis: 'revenue',
    filters: {},
  });

  // Sample saved views for demonstration
  useEffect(() => {
    const sampleViews: AnalyticsView[] = [
      {
        id: '1',
        name: 'Revenue Growth Analysis',
        description: 'Track revenue trends across all portfolio companies',
        chartType: 'line',
        xAxis: 'quarter',
        yAxis: 'revenue',
        filters: {},
        notes: 'Shows strong growth in Q3/Q4 across SaaS companies. Notable acceleration in TechFlow and FinanceHub.',
        createdAt: '2024-12-15T10:00:00Z',
        lastModified: '2024-12-20T15:30:00Z',
        createdBy: 'John Smith',
        isShared: true,
        tags: ['revenue', 'growth', 'quarterly'],
      },
      {
        id: '2',
        name: 'Burn Rate by Sector',
        description: 'Compare monthly burn rates across different sectors',
        chartType: 'bar',
        xAxis: 'sector',
        yAxis: 'burnRate',
        filters: {},
        notes: 'AI/ML companies showing higher burn rates due to compute costs. EdTech maintaining efficient operations.',
        createdAt: '2024-12-18T14:20:00Z',
        lastModified: '2024-12-18T14:20:00Z',
        createdBy: 'Sarah Johnson',
        isShared: false,
        tags: ['burn-rate', 'sector-analysis', 'operational'],
      },
      {
        id: '3',
        name: 'Valuation Distribution',
        description: 'Current portfolio valuation breakdown by company',
        chartType: 'pie',
        xAxis: 'name',
        yAxis: 'currentValuation',
        filters: {},
        notes: 'FinanceHub represents 35% of total portfolio value. Good diversification across remaining companies.',
        createdAt: '2024-12-19T09:15:00Z',
        lastModified: '2024-12-19T09:15:00Z',
        createdBy: 'Michael Chen',
        isShared: true,
        tags: ['valuation', 'portfolio-distribution', 'risk'],
      },
    ];
    setSavedViews(sampleViews);
  }, []);

  const handleChartConfigChange = (config: any) => {
    setCurrentChartConfig(config);
  };

  const handleViewLoad = (view: AnalyticsView) => {
    setCurrentChartConfig({
      type: view.chartType,
      title: view.name,
      xAxis: view.xAxis,
      yAxis: view.yAxis,
      filters: view.filters,
    });
    setActiveTab('dashboard');
  };

  const handleViewSave = (view: Omit<AnalyticsView, 'id' | 'createdAt' | 'lastModified'>) => {
    const newView: AnalyticsView = {
      ...view,
      id: `view-${Date.now()}`,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
    };
    setSavedViews(prev => [...prev, newView]);
  };

  const handleViewUpdate = (id: string, updates: Partial<AnalyticsView>) => {
    setSavedViews(prev => 
      prev.map(view => 
        view.id === id ? { ...view, ...updates } : view
      )
    );
  };

  const handleViewDelete = (id: string) => {
    setSavedViews(prev => prev.filter(view => view.id !== id));
  };

  if (!currentFund) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-96">
          <CardContent className="text-center py-12">
            <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Fund Selected</h3>
            <p className="text-gray-600">
              Please select or create a fund to access portfolio analytics.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Portfolio Analytics</h1>
                <p className="text-sm text-gray-600">
                  {currentFund.name} • Advanced data exploration and visualization
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button variant="outline" size="sm">
                <Share className="h-4 w-4 mr-2" />
                Share
              </Button>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="px-6">
          <TabsList className="grid w-full grid-cols-5 bg-transparent border-t border-gray-200 rounded-none">
            <TabsTrigger 
              value="dashboard" 
              className="data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-blue-500 rounded-none"
            >
              <Eye className="h-4 w-4 mr-2" />
              Analytics Dashboard
            </TabsTrigger>
            <TabsTrigger 
              value="builder"
              className="data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-blue-500 rounded-none"
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              Chart Builder
            </TabsTrigger>
            <TabsTrigger 
              value="tag-performance"
              className="data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-blue-500 rounded-none"
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              By Tags
            </TabsTrigger>
            <TabsTrigger 
              value="benchmarks"
              className="data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-blue-500 rounded-none"
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Benchmarks
            </TabsTrigger>
            <TabsTrigger 
              value="saved-views"
              className="data-[state=active]:bg-white data-[state=active]:border-b-2 data-[state=active]:border-blue-500 rounded-none"
            >
              <Eye className="h-4 w-4 mr-2" />
              Saved Views ({savedViews.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        <Tabs value={activeTab} className="space-y-6">
          <TabsContent value="dashboard" className="m-0">
            <PortfolioAnalyticsDashboard />
          </TabsContent>

          <TabsContent value="builder" className="m-0">
            <Card>
              <CardHeader>
                <CardTitle>Drag & Drop Chart Builder</CardTitle>
                <p className="text-sm text-gray-600">
                  Build custom visualizations by selecting chart types and dragging fields into configuration areas
                </p>
              </CardHeader>
              <CardContent>
                <SimpleChartBuilder onChartChange={handleChartConfigChange} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tag-performance" className="m-0">
            <TagPerformanceAnalysis />
          </TabsContent>

          <TabsContent value="benchmarks" className="m-0">
            <BenchmarkingDashboard />
          </TabsContent>

          <TabsContent value="saved-views" className="m-0">
            <SavedViewsManager
              views={savedViews}
              onViewLoad={handleViewLoad}
              onViewSave={handleViewSave}
              onViewUpdate={handleViewUpdate}
              onViewDelete={handleViewDelete}
              currentView={currentChartConfig}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
