/* eslint-disable @typescript-eslint/no-explicit-any */
 
 
 
 
import { BarChart } from 'recharts/es6/chart/BarChart';
import { Bar } from 'recharts/es6/cartesian/Bar';
import { XAxis } from 'recharts/es6/cartesian/XAxis';
import { YAxis } from 'recharts/es6/cartesian/YAxis';
import { CartesianGrid } from 'recharts/es6/cartesian/CartesianGrid';
import { Tooltip } from 'recharts/es6/component/Tooltip';
import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer';
import { RadarChart } from 'recharts/es6/chart/RadarChart';
import { PolarGrid } from 'recharts/es6/polar/PolarGrid';
import { PolarAngleAxis } from 'recharts/es6/polar/PolarAngleAxis';
import { PolarRadiusAxis } from 'recharts/es6/polar/PolarRadiusAxis';
import { Radar } from 'recharts/es6/polar/Radar';
import { Legend } from 'recharts/es6/component/Legend';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Settings,
  Info
} from 'lucide-react';
import { Input } from '@/components/ui/input';

// Mock data - in real app, this would come from API
const PORTFOLIO_COMPANIES = [
  {
    id: 1,
    name: 'Helix.ai',
    sector: 'SaaS',
    stage: 'Series A',
    revenue: '$1M',
    revenueGrowth: 35,
    grossMargin: 88,
    operatingMargin: -24,
    burnRate: -566000,
    runway: 14,
    percentiles: {
      revenue: 80,
      revenueGrowth: 74,
      grossMargin: 79,
      operatingMargin: 93,
      burnRate: 55,
      runway: 68
    }
  },
  {
    id: 2,
    name: 'Kevin Inc.',
    sector: 'FinTech',
    stage: 'Seed',
    revenue: '$500K',
    revenueGrowth: 55,
    grossMargin: 75,
    operatingMargin: -45,
    burnRate: -250000,
    runway: 18,
    percentiles: {
      revenue: 60,
      revenueGrowth: 85,
      grossMargin: 70,
      operatingMargin: 40,
      burnRate: 75,
      runway: 80
    }
  },
  {
    id: 3,
    name: 'AirChair',
    sector: 'Hardware',
    stage: 'Series B',
    revenue: '$12M',
    revenueGrowth: 72,
    grossMargin: 48,
    operatingMargin: 23,
    burnRate: -1200000,
    runway: 16,
    percentiles: {
      revenue: 90,
      revenueGrowth: 72,
      grossMargin: 30,
      operatingMargin: 91,
      burnRate: 50,
      runway: 60
    }
  }
];

const BENCHMARK_DATA = [
  {
    metric: 'Revenue Growth',
    portfolioMedian: 35,
    globalMedian: 28,
    portfolioCount: 21,
    globalCount: 7500
  },
  {
    metric: 'Gross Margin',
    portfolioMedian: 75,
    globalMedian: 65,
    portfolioCount: 21,
    globalCount: 7500
  },
  {
    metric: 'Operating Margin',
    portfolioMedian: -24,
    globalMedian: -18,
    portfolioCount: 21,
    globalCount: 7500
  },
  {
    metric: 'Burn Rate',
    portfolioMedian: -566000,
    globalMedian: -420000,
    portfolioCount: 21,
    globalCount: 7500
  }
];

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function BenchmarkingDashboard() {
  const [selectedCompany, setSelectedCompany] = useState(PORTFOLIO_COMPANIES[0]);
  const [selectedPeriod, setSelectedPeriod] = useState('Q4 2024');
  const [selectedSector, setSelectedSector] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');

  // Portfolio vs Global Benchmarks Chart
  const renderBenchmarkChart = () => {
    return (
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={BENCHMARK_DATA} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="metric" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="portfolioMedian" fill="#3b82f6" name="Portfolio Benchmarks" />
          <Bar dataKey="globalMedian" fill="#10b981" name="Global Benchmarks" />
        </BarChart>
      </ResponsiveContainer>
    );
  };

  // Portfolio Quartile Ranking Radar Chart
  const renderRadarChart = (company: typeof PORTFOLIO_COMPANIES[0]) => {
    const radarData = [
      { metric: 'Revenue', value: company.percentiles.revenue, fullMark: 100 },
      { metric: 'Revenue Growth', value: company.percentiles.revenueGrowth, fullMark: 100 },
      { metric: 'Gross Margin', value: company.percentiles.grossMargin, fullMark: 100 },
      { metric: 'Operating Margin', value: company.percentiles.operatingMargin, fullMark: 100 },
      { metric: 'Burn Rate', value: company.percentiles.burnRate, fullMark: 100 },
      { metric: 'Runway', value: company.percentiles.runway, fullMark: 100 }
    ];

    return (
      <ResponsiveContainer width="100%" height={400}>
        <RadarChart data={radarData}>
          <PolarGrid />
          <PolarAngleAxis dataKey="metric" />
          <PolarRadiusAxis angle={90} domain={[0, 100]} />
          <Radar
            name="Company Percentile"
            dataKey="value"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.3}
            strokeWidth={2}
          />
        </RadarChart>
      </ResponsiveContainer>
    );
  };

  // Performance Score Card
  const renderScorecard = (company: typeof PORTFOLIO_COMPANIES[0]) => {
    const getPerformanceColor = (percentile: number) => {
      if (percentile >= 75) return 'text-green-600 bg-green-100';
      if (percentile >= 50) return 'text-blue-600 bg-blue-100';
      if (percentile >= 25) return 'text-yellow-600 bg-yellow-100';
      return 'text-red-600 bg-red-100';
    };

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>My Scorecard</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <div className="text-sm text-gray-500 mb-2">My sector</div>
              <div className="text-2xl font-bold text-blue-600">{company.sector}</div>
            </div>
            <div className="text-center">
              <div className="text-sm text-gray-500 mb-2">My annualized revenue:</div>
              <div className="text-3xl font-bold">{company.revenue}</div>
            </div>
            <div className="text-center">
              <div className="text-sm text-gray-500 mb-2">My peers' revenue scale:</div>
              <div className="text-2xl font-bold">$500K-20M</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Percentile Ranking</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { label: 'Revenue', value: company.revenue, percentile: company.percentiles.revenue },
                { label: 'Revenue Growth', value: `${company.revenueGrowth}%`, percentile: company.percentiles.revenueGrowth },
                { label: 'Gross Margin', value: `${company.grossMargin}%`, percentile: company.percentiles.grossMargin },
                { label: 'Operating Margin', value: `${company.operatingMargin}%`, percentile: company.percentiles.operatingMargin },
                { label: 'Runway', value: `${company.runway} Mo.`, percentile: company.percentiles.runway }
              ].map((item: any, index: any) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="text-sm">{item.label} {item.value}</div>
                  <Badge className={`${getPerformanceColor(item.percentile)} border-0`}>
                    {item.percentile}th %tile
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header with Controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Benchmarks</h2>
          <p className="text-gray-600">Compare your portfolio companies against industry benchmarks</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Q4 2024">Q4 2024</SelectItem>
              <SelectItem value="Q3 2024">Q3 2024</SelectItem>
              <SelectItem value="Q2 2024">Q2 2024</SelectItem>
              <SelectItem value="Q1 2024">Q1 2024</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedSector} onValueChange={setSelectedSector}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Sectors</SelectItem>
              <SelectItem value="SaaS">SaaS</SelectItem>
              <SelectItem value="FinTech">FinTech</SelectItem>
              <SelectItem value="Hardware">Hardware</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Manage metrics
          </Button>
        </div>
      </div>

      {/* Main Benchmarking Interface */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">By Metric</TabsTrigger>
          <TabsTrigger value="company">By Company</TabsTrigger>
          <TabsTrigger value="scorecard">My Scorecard</TabsTrigger>
          <TabsTrigger value="companies">Companies</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Portfolio vs Global Toggle */}
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2">
              <Badge variant="default" className="bg-blue-600">
                P
              </Badge>
              <span className="text-sm">Portfolio Benchmarks</span>
            </div>
            <span className="text-gray-400">VS.</span>
            <div className="flex items-center space-x-2">
              <Badge variant="default" className="bg-green-600">
                G
              </Badge>
              <span className="text-sm">Global Benchmarks</span>
              <div className="w-6 h-4 bg-green-600 rounded-full relative">
                <div className="absolute right-1 top-0.5 w-3 h-3 bg-white rounded-full"></div>
              </div>
            </div>
          </div>

          {/* Benchmark Comparison Chart */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  Revenue Growth
                  <Info className="h-4 w-4 text-gray-400" />
                </CardTitle>
                <div className="text-sm text-gray-500">Q4 2024</div>
              </div>
            </CardHeader>
            <CardContent>
              {renderBenchmarkChart()}
            </CardContent>
          </Card>

          {/* Standard Metrics Sidebar */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Standard Metrics
                <Button variant="outline" size="sm">
                  <Settings className="h-4 w-4 mr-2" />
                  Manage metrics
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[
                  'Burn / FTE', 'Gross Margin', 'Headcount', 'Operating Margin',
                  'Net Burn', 'Revenue', 'Revenue / FTE', 'Revenue Growth', 'Runway'
                ].map((metric: any) => (
                  <div
                    key={metric}
                    className="p-2 text-sm border rounded cursor-pointer hover:bg-gray-50"
                  >
                    {metric}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="company" className="space-y-6">
          {/* Company Selection */}
          <div className="flex items-center gap-4">
            <Select
              value={selectedCompany?.id?.toString() ?? ''}
              onValueChange={(value: any) => {
                const company = PORTFOLIO_COMPANIES.find(c => c.id.toString() === value);
                if (company) setSelectedCompany(company);
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PORTFOLIO_COMPANIES.map((company: any) => (
                  <SelectItem key={company.id} value={company.id.toString()}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="outline" className="bg-green-100 text-green-800">
              Online
            </Badge>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Company Info */}
            <Card>
              <CardHeader>
                <CardTitle>Company info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-sm text-gray-500 mb-1">Sector</div>
                  <div className="font-medium">{selectedCompany?.sector ?? 'N/A'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">Revenue scale</div>
                  <div className="font-medium">{selectedCompany?.revenue ?? 'N/A'}</div>
                </div>
                <div>
                  <a href="#" className="text-blue-600 text-sm hover:underline">
                    http://www.{selectedCompany?.name?.toLowerCase() ?? 'company'}.ai
                  </a>
                </div>
              </CardContent>
            </Card>

            {/* Portfolio Quartile Ranking */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Portfolio quartile ranking</CardTitle>
                    <p className="text-sm text-gray-600 mt-1">Chart shows company's metrics vs. peers.</p>
                  </div>
                  <Button variant="outline" size="sm">
                    Edit Chart
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {selectedCompany && renderRadarChart(selectedCompany)}
              </CardContent>
            </Card>
          </div>

          {/* Portfolio Companies List */}
          <Card>
            <CardHeader>
              <CardTitle>20 Portfolio Companies</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {PORTFOLIO_COMPANIES.map((company: any) => (
                  <div
                    key={company.id}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-gray-50 ${
                      company.id === selectedCompany?.id ? 'bg-blue-50 border-blue-200' : ''
                    }`}
                    onClick={() => setSelectedCompany(company)}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-gray-900 text-white rounded flex items-center justify-center text-sm font-medium">
                        {company.name.charAt(0)}
                      </div>
                      <span className="font-medium">{company.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scorecard" className="space-y-6">
          {selectedCompany && renderScorecard(selectedCompany)}

          {/* Revenue Growth Performance */}
          <Card>
            <CardHeader>
              <CardTitle>Revenue Growth</CardTitle>
              <div className="text-right text-sm text-gray-500">As of Q2 2024</div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="text-center">
                  <div className="text-6xl font-bold">72%</div>
                  <Badge variant="default" className="bg-green-100 text-green-800 mt-2">
                    Above Average
                  </Badge>
                </div>
                
                {/* Performance Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Bottom Quartile: 0.00%</span>
                    <span>Median Quartile: 10.00%</span>
                    <span>Top Quartile: 24.00%</span>
                  </div>
                  <div className="relative">
                    <div className="w-full h-6 bg-gradient-to-r from-red-200 via-yellow-200 to-green-200 rounded"></div>
                    <div className="absolute top-0 right-8 transform -translate-y-1">
                      <Badge variant="default" className="bg-gray-900 text-white text-xs">
                        Instaspace 30.66%
                      </Badge>
                      <div className="w-0.5 h-8 bg-gray-900 mx-auto"></div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="companies" className="space-y-6">
          {/* Company Filters */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-2">
              <Search className="h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search companies..."
                value={searchTerm}
                onChange={(e: any) => setSearchTerm(e.target.value)}
                className="w-64"
              />
            </div>
            <Select defaultValue="low-runway">
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low-runway">Low Runway</SelectItem>
                <SelectItem value="high-growth">High Growth</SelectItem>
                <SelectItem value="profitable">Profitable</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="quarterly">
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
              </SelectContent>
            </Select>
            <Button className="bg-blue-600 hover:bg-blue-700">
              Add company
            </Button>
          </div>

          {/* Companies Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b">
                    <tr className="text-left">
                      <th className="p-4 font-medium text-gray-500 uppercase text-xs">Vendor</th>
                      <th className="p-4 font-medium text-gray-500 uppercase text-xs">Firm Sector</th>
                      <th className="p-4 font-medium text-gray-500 uppercase text-xs">Cash in Bank</th>
                      <th className="p-4 font-medium text-gray-500 uppercase text-xs">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: 'Bike.Ai', sector: 'AI', cash: '$36M', revenue: '$51M', logo: '🚲' },
                      { name: 'Stewart Gaming', sector: 'SaaS', cash: '$2M', revenue: '$551K', logo: '🎮' },
                      { name: 'Dakarai', sector: 'FinTech', cash: '$18M', revenue: '$4M', logo: '🔺' },
                      { name: 'Oceans Drone', sector: 'ClimateTech', cash: '$30K', revenue: '$47K', logo: '🌊' }
                    ].map((company: any, index: any) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="p-4">
                          <div className="flex items-center space-x-3">
                            <div className="text-2xl">{company.logo}</div>
                            <span className="font-medium">{company.name}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <Badge variant="outline">{company.sector}</Badge>
                        </td>
                        <td className="p-4 font-medium">{company.cash}</td>
                        <td className="p-4 font-medium">{company.revenue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
