import { Line } from 'recharts/es6/cartesian/Line';
import { XAxis } from 'recharts/es6/cartesian/XAxis';
import { YAxis } from 'recharts/es6/cartesian/YAxis';
import { CartesianGrid } from 'recharts/es6/cartesian/CartesianGrid';
import { Tooltip } from 'recharts/es6/component/Tooltip';
import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer';
import { BarChart } from 'recharts/es6/chart/BarChart';
import { Bar } from 'recharts/es6/cartesian/Bar';
import { usePacingData } from '@/hooks/use-engine-data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Calendar, TrendingUp } from 'lucide-react';
import { getChartColor } from '@/lib/brand-tokens';
import { presson } from '@/theme/presson.tokens';

export default function PacingTimelineChart() {
  const { data: pacingData, loading, error } = usePacingData();

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Deployment Pacing</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-64 bg-pov-gray rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibent">Deployment Pacing</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64 text-error-dark">
            <AlertCircle className="h-6 w-6 mr-2" />
            <span>Error loading pacing data: {error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Transform pacing data for chart display
  const deployments = pacingData?.deployments || [];
  const chartData = deployments.map((item) => {
    const currentIndex = deployments.findIndex((d) => d.quarter === item.quarter);
    const cumulative = deployments
      .slice(0, currentIndex + 1)
      .reduce((sum: number, d: (typeof deployments)[number]) => sum + d.deployment, 0);

    return {
      quarter: `Q${item.quarter}`,
      deployment: item.deployment / 1000000, // Convert to millions
      cumulative: cumulative / 1000000,
      note: item.note,
    };
  });

  const fundSize = pacingData?.fundSize || 0;
  const avgQuarterlyDeployment = pacingData?.avgQuarterlyDeployment || 0;
  const totalQuarters = pacingData?.totalQuarters || 0;
  const marketCondition = pacingData?.marketCondition || 'neutral';

  return (
    <div className="space-y-6">
      {/* Main Pacing Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Deployment Pacing Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={presson.color.surfaceSubtle} />
                <XAxis dataKey="quarter" stroke={presson.color.text} fontSize={12} />
                <YAxis
                  stroke={presson.color.text}
                  fontSize={12}
                  label={{ value: 'Deployment ($M)', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip
                  formatter={(value, name) => [
                    value !== undefined ? `$${Number(value).toFixed(1)}M` : '',
                    name === 'deployment' ? 'Quarterly Deployment' : 'Cumulative',
                  ]}
                  labelFormatter={(label) => `Quarter: ${String(label)}`}
                />
                <Bar dataKey="deployment" fill={getChartColor(0)} name="deployment" />
                <Line
                  type="monotone"
                  dataKey="cumulative"
                  stroke={getChartColor(1)}
                  strokeWidth={3}
                  name="cumulative"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Pacing Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-charcoal-600 text-sm font-medium">Total Fund Size</p>
                <p className="text-2xl font-bold text-pov-charcoal mt-1">
                  ${(fundSize / 1000000).toFixed(0)}M
                </p>
              </div>
              <div className="w-12 h-12 bg-pov-gray rounded-lg flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-presson-info" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-charcoal-600 text-sm font-medium">Avg Quarterly</p>
                <p className="text-2xl font-bold text-pov-charcoal mt-1">
                  ${(avgQuarterlyDeployment / 1000000).toFixed(1)}M
                </p>
                <p className="text-sm text-charcoal-500 mt-1">{totalQuarters} quarters</p>
              </div>
              <div className="w-12 h-12 bg-pov-gray rounded-lg flex items-center justify-center">
                <Calendar className="h-6 w-6 text-pov-charcoal" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-charcoal-600 text-sm font-medium">Market Condition</p>
                <p className="text-2xl font-bold text-pov-charcoal mt-1">
                  {marketCondition.charAt(0).toUpperCase() + marketCondition.slice(1)}
                </p>
                <p className="text-sm text-charcoal-500 mt-1">Baseline pacing</p>
              </div>
              <div className="w-12 h-12 bg-pov-gray rounded-lg flex items-center justify-center">
                <Calendar className="h-6 w-6 text-presson-warning" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quarterly Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Quarterly Deployment Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {chartData.map((item, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-pov-gray/50 rounded-lg"
              >
                <div className="flex-1">
                  <p className="font-medium text-pov-charcoal">{item.quarter} Deployment</p>
                  <p className="text-sm text-charcoal-600">{item.note}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-pov-charcoal">${item.deployment.toFixed(1)}M</p>
                  <p className="text-sm text-charcoal-500">
                    Cumulative: ${item.cumulative.toFixed(1)}M
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
