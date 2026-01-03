/**
 * Portfolio Performance Chart
 *
 * Displays portfolio value and IRR over time with Press On Ventures brand styling.
 */

import { LineChart } from 'recharts/es6/chart/LineChart';
import { Line } from 'recharts/es6/cartesian/Line';
import { XAxis } from 'recharts/es6/cartesian/XAxis';
import { YAxis } from 'recharts/es6/cartesian/YAxis';
import { CartesianGrid } from 'recharts/es6/cartesian/CartesianGrid';
import { Tooltip } from 'recharts/es6/component/Tooltip';
import { Legend } from 'recharts/es6/component/Legend';
import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import {
  rechartsProps,
  getChartColor,
} from '@/lib/chart-theme';

interface PerformanceData {
  month: string;
  portfolioValue: number;
  irr: number;
}

const sampleData: PerformanceData[] = [
  { month: 'Jan 2023', portfolioValue: 85, irr: 18.5 },
  { month: 'Feb 2023', portfolioValue: 88, irr: 19.2 },
  { month: 'Mar 2023', portfolioValue: 92, irr: 21.8 },
  { month: 'Apr 2023', portfolioValue: 89, irr: 20.1 },
  { month: 'May 2023', portfolioValue: 95, irr: 24.3 },
  { month: 'Jun 2023', portfolioValue: 102, irr: 26.7 },
  { month: 'Jul 2023', portfolioValue: 98, irr: 25.1 },
  { month: 'Aug 2023', portfolioValue: 105, irr: 27.8 },
  { month: 'Sep 2023', portfolioValue: 110, irr: 28.4 },
];

export default function PortfolioPerformanceChart() {
  const [timeRange, setTimeRange] = useState('YTD');
  const timeRanges = ['YTD', '1Y', '3Y'] as const;

  // Get brand colors for the two data series
  const portfolioValueColor = getChartColor(0);
  const irrColor = getChartColor(1);

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-800">
            Portfolio Performance
          </CardTitle>
          <div className="flex space-x-2">
            {timeRanges.map((range) => (
              <Button
                key={range}
                variant={timeRange === range ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimeRange(range)}
                className={
                  timeRange === range ? 'povc-bg-primary-light text-blue-700 border-blue-200' : ''
                }
              >
                {range}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sampleData}>
              <CartesianGrid {...rechartsProps.cartesianGrid} />
              <XAxis dataKey="month" {...rechartsProps.xAxis} />
              <YAxis
                yAxisId="left"
                {...rechartsProps.yAxis}
                label={{ value: 'Portfolio Value (M)', angle: -90, position: 'insideLeft' }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                {...rechartsProps.yAxis}
                label={{ value: 'IRR (%)', angle: 90, position: 'insideRight' }}
              />
              <Tooltip {...rechartsProps.tooltip()} />
              <Legend {...rechartsProps.legend} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="portfolioValue"
                stroke={portfolioValueColor}
                strokeWidth={2}
                name="Portfolio Value ($M)"
                dot={{ r: 4, fill: portfolioValueColor }}
                activeDot={{ r: 6, stroke: portfolioValueColor, strokeWidth: 2, fill: '#FFFFFF' }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="irr"
                stroke={irrColor}
                strokeWidth={2}
                name="IRR (%)"
                dot={{ r: 4, fill: irrColor }}
                activeDot={{ r: 6, stroke: irrColor, strokeWidth: 2, fill: '#FFFFFF' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
