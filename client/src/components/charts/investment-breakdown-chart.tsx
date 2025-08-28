/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { PieChart } from 'recharts/es6/chart/PieChart';
import { Pie } from 'recharts/es6/polar/Pie';
import { Cell } from 'recharts/es6/component/Cell';
import { ResponsiveContainer } from 'recharts/es6/component/ResponsiveContainer';
import { Tooltip } from 'recharts/es6/component/Tooltip';
import { Legend } from 'recharts/es6/component/Legend';
import ChartContainer from './chart-container';

interface SectorData {
  name: string;
  value: number;
  color: string;
  amount?: number;
}

const sectorData: SectorData[] = [
  { name: 'Fintech', value: 35, color: '#3b82f6', amount: 52.5 },
  { name: 'Healthcare', value: 28, color: '#06b6d4', amount: 42.0 },
  { name: 'SaaS', value: 22, color: '#10b981', amount: 33.0 },
  { name: 'Other', value: 15, color: '#f59e0b', amount: 22.5 },
];

interface InvestmentBreakdownChartProps {
  data?: SectorData[];
  title?: string;
  height?: number;
}

const formatTooltipValue = (value: number, name: string, props: any) => {
  const amount = props.payload?.amount;
  return [
    `${value}% ${amount ? `($${amount}M)` : ''}`,
    'Portfolio Allocation'
  ];
};

export default function InvestmentBreakdownChart({ 
  data = sectorData, 
  title = "Portfolio Allocation by Sector",
  height = 320 
}: InvestmentBreakdownChartProps) {
  if (!data || data.length === 0) {
    return (
      <ChartContainer 
        title={title} 
        description="Investment distribution across sectors"
        height={height}
      >
        <div className="flex items-center justify-center h-full text-gray-500">
          No allocation data available
        </div>
      </ChartContainer>
    );
  }

  return (
    <ChartContainer 
      title={title} 
      description="Investment distribution across sectors"
      height={height}
    >
      <div className="flex flex-col h-full">
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={80}
                dataKey="value"
                label={({ value }) => `${value}%`}
                labelLine={false}
                stroke="#fff"
                strokeWidth={2}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                formatter={formatTooltipValue}
                contentStyle={{ 
                  backgroundColor: '#fff', 
                  border: '1px solid #e0e0e0', 
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        <div className="space-y-3 pt-4 border-t border-gray-100">
          {data.map((sector, index) => (
            <div key={index} className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-3">
                <div 
                  className="w-4 h-4 rounded-full shadow-sm"
                  style={{ backgroundColor: sector.color }}
                ></div>
                <span className="text-gray-700 font-medium">{sector.name}</span>
              </div>
              <div className="text-right">
                <span className="font-semibold text-gray-800">{sector.value}%</span>
                {sector.amount && (
                  <div className="text-xs text-gray-500">${sector.amount}M</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </ChartContainer>
  );
}

