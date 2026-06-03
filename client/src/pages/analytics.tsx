import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
// Chart libraries removed for bundle optimization
const ChartPlaceholder = ({ title, height = 'h-80' }: { title: string; height?: string }) => (
  <div className={`${height} bg-pov-gray rounded-lg flex flex-col items-center justify-center`}>
    <div className="w-16 h-16 bg-beige-100 rounded-full flex items-center justify-center mb-4">
      <BarChart3 className="h-8 w-8 text-charcoal-400" />
    </div>
    <p className="text-charcoal-500 font-medium">{title}</p>
    <p className="text-charcoal-400 text-sm mt-1">Chart placeholder - data available via API</p>
  </div>
);
import { useState, lazy, Suspense } from 'react';
import { useFundContext } from '@/contexts/FundContext';
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  Activity,
  Target,
  Filter,
  Download,
} from 'lucide-react';

// Lazy load chart components to prevent Recharts from loading in analytics chunk
const ReserveAllocationChart = lazy(() => import('@/components/charts/reserve-allocation-chart'));
const PacingTimelineChart = lazy(() => import('@/components/charts/pacing-timeline-chart'));

// Chart loading skeleton
const ChartSkeleton = () => (
  <div className="animate-pulse">
    <div className="h-80 bg-beige-100 rounded-lg"></div>
  </div>
);

const riskMetrics = [
  { category: 'Market Risk', score: 7.2, benchmark: 6.5 },
  { category: 'Concentration Risk', score: 5.8, benchmark: 7.0 },
  { category: 'Liquidity Risk', score: 4.3, benchmark: 5.5 },
  { category: 'Operational Risk', score: 6.1, benchmark: 6.2 },
  { category: 'Technology Risk', score: 8.1, benchmark: 7.8 },
];

export default function Analytics() {
  const [timeRange, setTimeRange] = useState('12m');
  const [_selectedMetric, _setSelectedMetric] = useState('irr');
  const [activeTab, setActiveTab] = useState('performance');
  const { currentFund, isLoading } = useFundContext();

  if (isLoading) {
    return (
      <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <div className="animate-pulse space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-32 bg-beige-100 rounded-xl"></div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
      {/* Key Performance Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-charcoal-600 text-sm font-medium">Portfolio IRR</p>
                <p className="text-2xl font-bold text-pov-charcoal mt-1">28.4%</p>
                <div className="flex items-center mt-2">
                  <TrendingUp className="h-4 w-4 text-presson-positive mr-1" />
                  <span className="text-presson-positive text-sm font-medium">+3.9%</span>
                </div>
              </div>
              <div className="w-12 h-12 bg-presson-positive/10 rounded-lg flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-presson-positive" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-charcoal-600 text-sm font-medium">Risk-Adj. Return</p>
                <p className="text-2xl font-bold text-pov-charcoal mt-1">2.1</p>
                <div className="flex items-center mt-2">
                  <TrendingUp className="h-4 w-4 text-presson-info mr-1" />
                  <span className="text-presson-info text-sm font-medium">Sharpe Ratio</span>
                </div>
              </div>
              <div className="w-12 h-12 bg-presson-info/10 rounded-lg flex items-center justify-center">
                <BarChart3 className="h-6 w-6 text-presson-info" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-charcoal-600 text-sm font-medium">Portfolio Beta</p>
                <p className="text-2xl font-bold text-pov-charcoal mt-1">0.87</p>
                <div className="flex items-center mt-2">
                  <TrendingDown className="h-4 w-4 text-presson-warning mr-1" />
                  <span className="text-presson-warning text-sm font-medium">Low volatility</span>
                </div>
              </div>
              <div className="w-12 h-12 bg-presson-warning/10 rounded-lg flex items-center justify-center">
                <Activity className="h-6 w-6 text-presson-warning" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-charcoal-600 text-sm font-medium">Alpha Generation</p>
                <p className="text-2xl font-bold text-pov-charcoal mt-1">+4.7%</p>
                <div className="flex items-center mt-2">
                  <Target className="h-4 w-4 text-presson-info mr-1" />
                  <span className="text-presson-info text-sm font-medium">vs benchmark</span>
                </div>
              </div>
              <div className="w-12 h-12 bg-presson-info/10 rounded-lg flex items-center justify-center">
                <Target className="h-6 w-6 text-presson-info" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Analytics Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <TabsList className="grid w-full max-w-md grid-cols-4">
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="risk">Risk</TabsTrigger>
            <TabsTrigger value="benchmarks">Benchmarks</TabsTrigger>
            <TabsTrigger value="attribution">Attribution</TabsTrigger>
          </TabsList>

          <div className="flex items-center space-x-4">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3m">3 Months</SelectItem>
                <SelectItem value="6m">6 Months</SelectItem>
                <SelectItem value="12m">12 Months</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>
            <Button size="sm" className="povc-bg-accent">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        <TabsContent value="performance" className="space-y-6">
          {/* Engine-Powered Reserve Allocations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="lg:col-span-1">
              <Suspense fallback={<ChartSkeleton />}>
                <ReserveAllocationChart fundId={currentFund?.id || 1} />
              </Suspense>
            </div>
            <div className="lg:col-span-1">
              <Suspense fallback={<ChartSkeleton />}>
                <PacingTimelineChart />
              </Suspense>
            </div>
          </div>

          {/* Traditional Performance Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-pov-charcoal">
                  Performance vs Benchmarks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChartPlaceholder title="Performance vs Benchmarks Bar Chart" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-pov-charcoal">
                  Quarterly Trends
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChartPlaceholder title="Quarterly Trends Composed Chart" />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-pov-charcoal">
                Sector Performance Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartPlaceholder title="Sector Performance Scatter Chart" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="risk" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-pov-charcoal">
                  Risk Assessment Radar
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChartPlaceholder title="Risk Assessment Radar Chart" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-pov-charcoal">
                  Risk Metrics Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {riskMetrics.map((metric) => (
                    <div
                      key={metric.category}
                      className="flex items-center justify-between p-3 bg-pov-gray rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-pov-charcoal">{metric.category}</p>
                        <p className="text-sm text-charcoal-600">Score: {metric.score}/10</p>
                      </div>
                      <div
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          metric.score > metric.benchmark
                            ? 'bg-error/10 text-error-dark'
                            : 'bg-success/10 text-success-dark'
                        }`}
                      >
                        {metric.score > metric.benchmark ? 'Above' : 'Below'} Benchmark
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="benchmarks" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-pov-charcoal">
                Vintage Year Cohort Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ChartPlaceholder title="Vintage Year Cohort Line Chart" />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold text-pov-charcoal">
                  Peer Comparison
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-charcoal-600">Top Quartile:</span>
                    <span className="font-medium text-presson-positive">32%+ IRR</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-charcoal-600">Fund Position:</span>
                    <span className="font-medium text-presson-info">28.4% IRR</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-charcoal-600">Median:</span>
                    <span className="font-medium text-charcoal-600">24.5% IRR</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold text-pov-charcoal">
                  Industry Benchmarks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-charcoal-600">VC Average:</span>
                    <span className="font-medium">22.1% IRR</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-charcoal-600">Growth Equity:</span>
                    <span className="font-medium">18.5% IRR</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-charcoal-600">Public Markets:</span>
                    <span className="font-medium">11.2% IRR</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold text-pov-charcoal">
                  Risk Metrics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-charcoal-600">Volatility:</span>
                    <span className="font-medium">15.2%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-charcoal-600">Max Drawdown:</span>
                    <span className="font-medium text-presson-negative">-8.5%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-charcoal-600">VaR (95%):</span>
                    <span className="font-medium">-12.3%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="attribution" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-pov-charcoal">
                Performance Attribution Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h4 className="font-medium text-pov-charcoal mb-4">Top Contributors</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-presson-positive/10 rounded-lg">
                      <div>
                        <p className="font-medium text-pov-charcoal">TechCorp (Fintech)</p>
                        <p className="text-sm text-charcoal-600">Series B → C valuation</p>
                      </div>
                      <span className="font-bold text-presson-positive">+4.2% IRR</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-presson-positive/10 rounded-lg">
                      <div>
                        <p className="font-medium text-pov-charcoal">DataFlow (SaaS)</p>
                        <p className="text-sm text-charcoal-600">Revenue growth acceleration</p>
                      </div>
                      <span className="font-bold text-presson-positive">+3.8% IRR</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-presson-positive/10 rounded-lg">
                      <div>
                        <p className="font-medium text-pov-charcoal">HealthAI (Healthcare)</p>
                        <p className="text-sm text-charcoal-600">Regulatory approval milestone</p>
                      </div>
                      <span className="font-bold text-presson-positive">+2.9% IRR</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium text-pov-charcoal mb-4">Key Detractors</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-presson-negative/10 rounded-lg">
                      <div>
                        <p className="font-medium text-pov-charcoal">RetailTech Co</p>
                        <p className="text-sm text-charcoal-600">Market downturn impact</p>
                      </div>
                      <span className="font-bold text-presson-negative">-1.2% IRR</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-presson-negative/10 rounded-lg">
                      <div>
                        <p className="font-medium text-pov-charcoal">EnergyStart</p>
                        <p className="text-sm text-charcoal-600">Regulatory challenges</p>
                      </div>
                      <span className="font-bold text-presson-negative">-0.8% IRR</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  );
}
