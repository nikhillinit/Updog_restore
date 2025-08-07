import ModernPortfolio from "./portfolio-modern";

export default function Portfolio() {
  return <ModernPortfolio />;
}
import PortfolioCostValueChart from "@/components/charts/portfolio-cost-value-chart";

const sectorDistribution = [
  { name: 'Fintech', value: 35, color: '#3b82f6' },
  { name: 'Healthcare', value: 28, color: '#06b6d4' },
  { name: 'SaaS', value: 22, color: '#10b981' },
  { name: 'Other', value: 15, color: '#f59e0b' },
];

const stageDistribution = [
  { stage: 'Seed', count: 8, value: 12 },
  { stage: 'Series A', count: 6, value: 28 },
  { stage: 'Series B', count: 4, value: 35 },
  { stage: 'Series C+', count: 6, value: 65 },
];

export default function Portfolio() {
  const { currentFund } = useFundContext();
  const { portfolioCompanies: companies, isLoading } = usePortfolioCompanies(currentFund?.id);
  const [viewMode, setViewMode] = useState<'overview' | 'table' | 'moic' | 'charts'>('table');

  const totalInvestment = companies?.reduce((sum: number, company: any) => 
    sum + parseFloat(company.investmentAmount), 0) || 0;

  const totalValuation = companies?.reduce((sum: number, company: any) => 
    sum + parseFloat(company.currentValuation || "0"), 0) || 0;

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <div className="animate-pulse space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto p-6 custom-scrollbar">
      {/* Header with view toggle */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {viewMode === 'table' ? 'Investments Table' : 
             viewMode === 'moic' ? 'Investment MOICs Analysis' :
             viewMode === 'charts' ? 'Portfolio Cost and Value' :
             'Portfolio Overview'}
          </h1>
          <p className="text-gray-600 mt-1">
            {viewMode === 'table' 
              ? 'A consolidated view of all portfolio companies and their metrics'
              : viewMode === 'moic'
              ? 'Track seven different MOIC calculations for comprehensive investment performance analysis'
              : viewMode === 'charts'
              ? 'Visualize the difference between cost basis and realized & unrealized value from active investments'
              : 'Monitor your portfolio companies and track performance'
            }
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex items-center bg-white rounded-lg border border-gray-200 p-1">
            <Button
              variant={viewMode === 'table' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('table')}
            >
              <BarChart3 className="w-4 h-4 mr-1" />
              Investments Table
            </Button>
            <Button
              variant={viewMode === 'moic' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('moic')}
            >
              <Calculator className="w-4 h-4 mr-1" />
              MOIC Analysis
            </Button>
            <Button
              variant={viewMode === 'charts' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('charts')}
            >
              <TrendingUp className="w-4 h-4 mr-1" />
              Cost & Value
            </Button>
            <Button
              variant={viewMode === 'charts' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('charts')}
            >
              <TrendingUp className="w-4 h-4 mr-1" />
              Cost & Value
            </Button>
            <Button
              variant={viewMode === 'overview' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('overview')}
            >
              <Building2 className="w-4 h-4 mr-1" />
              Portfolio Overview
            </Button>
          </div>
          {(viewMode === 'table' || viewMode === 'moic' || viewMode === 'charts') && (
            <>
              <Button variant="outline">
                <Settings className="w-4 h-4 mr-2" />
                {viewMode === 'moic' ? 'MOIC Settings' : 
                 viewMode === 'charts' ? 'Chart Settings' : 'Columns'}
              </Button>
              <Button variant="outline">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </>
          )}
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Investment
          </Button>
        </div>
      </div>

      {viewMode === 'table' ? (
        <InvestmentsTable />
      ) : viewMode === 'moic' ? (
        <MOICAnalysis />
      ) : viewMode === 'charts' ? (
        <PortfolioCostValueChart />
      ) : (
        <>
          {/* Portfolio Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Total Companies</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">{companies?.length || 0}</p>
                <p className="text-green-600 text-sm mt-1">+3 this quarter</p>
              </div>
              <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                <Building className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Total Investment</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">
                  ${(totalInvestment / 1000000).toFixed(1)}M
                </p>
                <p className="text-green-600 text-sm mt-1">67.5% deployed</p>
              </div>
              <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Total Valuation</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">
                  ${(totalValuation / 1000000).toFixed(1)}M
                </p>
                <p className="text-green-600 text-sm mt-1">+15.2% growth</p>
              </div>
              <div className="w-12 h-12 bg-cyan-50 rounded-lg flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-cyan-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Average Multiple</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">
                  {totalInvestment > 0 ? (totalValuation / totalInvestment).toFixed(2) : '0.00'}x
                </p>
                <p className="text-green-600 text-sm mt-1">Above target</p>
              </div>
              <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Portfolio Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-gray-800">
              Sector Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sectorDistribution}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label={({ value }) => `${value}%`}
                  >
                    {sectorDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-gray-800">
              Stage Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stageDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="stage" stroke="#666" fontSize={12} />
                  <YAxis stroke="#666" fontSize={12} />
                  <Tooltip formatter={(value, name) => [`${value}M`, 'Avg Investment']} />
                  <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

          {/* Portfolio Companies Table */}
          <PortfolioTable companies={companies} />
        </>
      )}
    </main>
  );
}
