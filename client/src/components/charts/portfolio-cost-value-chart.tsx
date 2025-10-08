/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { ComposedChart } from 'recharts/es6/chart/ComposedChart';
import { Bar } from 'recharts/es6/cartesian/Bar';
import { Line } from 'recharts/es6/cartesian/Line';
import { XAxis } from 'recharts/es6/cartesian/XAxis';
import { YAxis } from 'recharts/es6/cartesian/YAxis';
import { CartesianGrid } from 'recharts/es6/cartesian/CartesianGrid';
import { Tooltip } from 'recharts/es6/component/Tooltip';
import { Legend } from 'recharts/es6/component/Legend';
import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Download, Info } from 'lucide-react';

interface PortfolioCostValueData {
  month: string;
  costBasis: number;
  realizedValue: number;
  unrealizedValue: number;
  totalValue: number;
}

const SAMPLE_DATA: PortfolioCostValueData[] = [
  { month: 'Jan 2021', costBasis: 2000000, realizedValue: 0, unrealizedValue: 2100000, totalValue: 2100000 },
  { month: 'Feb 2021', costBasis: 3500000, realizedValue: 0, unrealizedValue: 3800000, totalValue: 3800000 },
  { month: 'Mar 2021', costBasis: 5000000, realizedValue: 0, unrealizedValue: 5500000, totalValue: 5500000 },
  { month: 'Apr 2021', costBasis: 6200000, realizedValue: 0, unrealizedValue: 7100000, totalValue: 7100000 },
  { month: 'May 2021', costBasis: 7800000, realizedValue: 0, unrealizedValue: 9200000, totalValue: 9200000 },
  { month: 'Jun 2021', costBasis: 9500000, realizedValue: 0, unrealizedValue: 11800000, totalValue: 11800000 },
  { month: 'Jul 2021', costBasis: 11000000, realizedValue: 0, unrealizedValue: 14200000, totalValue: 14200000 },
  { month: 'Aug 2021', costBasis: 12800000, realizedValue: 0, unrealizedValue: 16800000, totalValue: 16800000 },
  { month: 'Sep 2021', costBasis: 14500000, realizedValue: 0, unrealizedValue: 19500000, totalValue: 19500000 },
  { month: 'Oct 2021', costBasis: 16200000, realizedValue: 0, unrealizedValue: 22100000, totalValue: 22100000 },
  { month: 'Nov 2021', costBasis: 17800000, realizedValue: 0, unrealizedValue: 24800000, totalValue: 24800000 },
  { month: 'Dec 2021', costBasis: 19500000, realizedValue: 0, unrealizedValue: 27200000, totalValue: 27200000 },
  { month: 'Jan 2022', costBasis: 21000000, realizedValue: 0, unrealizedValue: 29800000, totalValue: 29800000 },
  { month: 'Feb 2022', costBasis: 22800000, realizedValue: 0, unrealizedValue: 32500000, totalValue: 32500000 },
  { month: 'Mar 2022', costBasis: 24500000, realizedValue: 0, unrealizedValue: 35200000, totalValue: 35200000 },
  { month: 'Apr 2022', costBasis: 26200000, realizedValue: 0, unrealizedValue: 37800000, totalValue: 37800000 },
  { month: 'May 2022', costBasis: 27800000, realizedValue: 0, unrealizedValue: 40200000, totalValue: 40200000 },
  { month: 'Jun 2022', costBasis: 29500000, realizedValue: 0, unrealizedValue: 42800000, totalValue: 42800000 },
  { month: 'Jul 2022', costBasis: 31000000, realizedValue: 0, unrealizedValue: 45200000, totalValue: 45200000 },
  { month: 'Aug 2022', costBasis: 32800000, realizedValue: 0, unrealizedValue: 47800000, totalValue: 47800000 },
  { month: 'Sep 2022', costBasis: 34500000, realizedValue: 0, unrealizedValue: 50200000, totalValue: 50200000 },
  { month: 'Oct 2022', costBasis: 36200000, realizedValue: 0, unrealizedValue: 52800000, totalValue: 52800000 },
  { month: 'Nov 2022', costBasis: 37800000, realizedValue: 0, unrealizedValue: 55200000, totalValue: 55200000 },
  { month: 'Dec 2022', costBasis: 39500000, realizedValue: 0, unrealizedValue: 57800000, totalValue: 57800000 },
  { month: 'Jan 2023', costBasis: 41000000, realizedValue: 1200000, unrealizedValue: 42500000, totalValue: 43700000 },
  { month: 'Feb 2023', costBasis: 42800000, realizedValue: 1200000, unrealizedValue: 44800000, totalValue: 46000000 },
  { month: 'Mar 2023', costBasis: 44500000, realizedValue: 1200000, unrealizedValue: 46200000, totalValue: 47400000 },
  { month: 'Apr 2023', costBasis: 46200000, realizedValue: 3800000, unrealizedValue: 50200000, totalValue: 54000000 },
  { month: 'May 2023', costBasis: 47800000, realizedValue: 3800000, unrealizedValue: 52800000, totalValue: 56600000 },
  { month: 'Jun 2023', costBasis: 49500000, realizedValue: 3800000, unrealizedValue: 55500000, totalValue: 59300000 },
  { month: 'Jul 2023', costBasis: 51000000, realizedValue: 6200000, unrealizedValue: 58200000, totalValue: 64400000 },
  { month: 'Aug 2023', costBasis: 52800000, realizedValue: 8552632, unrealizedValue: 56944681, totalValue: 65497313 }
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0]!.payload;
    
    return (
      <div className="bg-white p-4 border border-gray-300 rounded-lg shadow-lg">
        <p className="font-medium text-gray-900 mb-2">{label}</p>
        <div className="space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-orange-400 rounded"></div>
              <span className="text-gray-600">Cost Basis:</span>
            </div>
            <span className="font-medium">${(data.costBasis / 1000000).toFixed(1)}M</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-blue-500 rounded"></div>
              <span className="text-gray-600">Realized:</span>
            </div>
            <span className="font-medium">${(data.realizedValue / 1000000).toFixed(1)}M</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-gray-700 rounded"></div>
              <span className="text-gray-600">Unrealized:</span>
            </div>
            <span className="font-medium">${(data.unrealizedValue / 1000000).toFixed(1)}M</span>
          </div>
          <div className="border-t pt-1 mt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-gray-400 rounded"></div>
                <span className="text-gray-600">Total Value:</span>
              </div>
              <span className="font-bold">${(data.totalValue / 1000000).toFixed(1)}M</span>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

const formatYAxisValue = (value: number) => {
  return `${(value / 1000000).toFixed(0)}M`;
};

const formatXAxisLabel = (value: string) => {
  const date = new Date(`${value  } 1`);
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

export default function PortfolioCostValueChart() {
  const [selectedPeriod, setSelectedPeriod] = useState('Aug 2023');
  
  const latestData = SAMPLE_DATA.length > 0 ? SAMPLE_DATA[SAMPLE_DATA.length - 1] : { realizedValue: 0, unrealizedValue: 0 };
  const realizedAmount = latestData?.realizedValue ?? 0;
  const unrealizedAmount = latestData?.unrealizedValue ?? 0;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-medium text-gray-900">Portfolio Cost and Value</CardTitle>
            <div className="flex items-center space-x-4 mt-2">
              <span className="text-sm text-gray-500">Reporting Period</span>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-[140px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Aug 2023">Aug 2023</SelectItem>
                  <SelectItem value="Jul 2023">Jul 2023</SelectItem>
                  <SelectItem value="Jun 2023">Jun 2023</SelectItem>
                  <SelectItem value="May 2023">May 2023</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="sm">
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm">
              <Info className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Summary Values */}
        <div className="grid grid-cols-2 gap-8 mb-6">
          <div>
            <div className="text-2xl font-bold text-blue-600">
              ${(realizedAmount / 1000000).toFixed(3).replace(/\.?0+$/, '')}M
            </div>
            <div className="text-sm text-gray-600">Est. Actual Realized</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-700">
              ${(unrealizedAmount / 1000000).toFixed(3).replace(/\.?0+$/, '')}M
            </div>
            <div className="text-sm text-gray-600">Est. Actual Unrealized</div>
          </div>
        </div>

        {/* Chart */}
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={SAMPLE_DATA}
              margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="month"
                tickFormatter={formatXAxisLabel}
                angle={-45}
                textAnchor="end"
                height={80}
                tick={{ fontSize: 11 }}
                stroke="#666"
              />
              <YAxis 
                tickFormatter={formatYAxisValue}
                tick={{ fontSize: 11 }}
                stroke="#666"
              />
              <Tooltip content={<CustomTooltip />} />
              
              {/* Cost Basis - Orange Bars */}
              <Bar 
                dataKey="costBasis" 
                fill="#fb923c"
                name="Cost Basis"
                radius={[0, 0, 0, 0]}
              />
              
              {/* Realized Value - Blue Bars */}
              <Bar 
                dataKey="realizedValue" 
                fill="#3b82f6"
                name="Realized"
                radius={[0, 0, 0, 0]}
                stackId="value"
              />
              
              {/* Unrealized Value - Dark Bars */}
              <Bar 
                dataKey="unrealizedValue" 
                fill="#374151"
                name="Unrealized"
                radius={[2, 2, 0, 0]}
                stackId="value"
              />
              
              {/* Total Value Line */}
              <Line 
                type="monotone" 
                dataKey="totalValue" 
                stroke="#9ca3af"
                strokeWidth={2}
                dot={false}
                name="Total Value"
                connectNulls={false}
              />
              
              <Legend 
                wrapperStyle={{ paddingTop: '20px' }}
                iconType="circle"
                formatter={(value: any) => (
                  <span style={{ color: '#666', fontSize: '12px' }}>{value}</span>
                )}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Legend with custom styling to match reference */}
        <div className="flex items-center justify-center space-x-6 mt-4 text-sm">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            <span className="text-gray-600">Realized</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-gray-700 rounded-full"></div>
            <span className="text-gray-600">Unrealized</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
            <span className="text-gray-600">Total Value</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-orange-400 rounded-full"></div>
            <span className="text-gray-600">Cost Basis</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
