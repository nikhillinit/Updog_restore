import { PieChart } from 'recharts/es6/chart/PieChart';
import { Pie } from 'recharts/es6/polar/Pie';
import { Cell } from 'recharts/es6/component/Cell';
import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer';
import { Tooltip } from 'recharts/es6/component/Tooltip';
import ChartContainer from './chart-container';
import { createPayloadFormatter } from '@/lib/chart-formatters';
import { getChartColor } from '@/lib/brand-tokens';
import { presson } from '@/theme/presson.tokens';

interface SectorData {
  name: string;
  value: number;
  color: string;
  amount?: number;
  [key: string]: unknown;
}

const sectorData: SectorData[] = [
  { name: 'Fintech', value: 35, color: getChartColor(0), amount: 52.5 },
  { name: 'Healthcare', value: 28, color: getChartColor(1), amount: 42.0 },
  { name: 'SaaS', value: 22, color: getChartColor(2), amount: 33.0 },
  { name: 'Other', value: 15, color: getChartColor(3), amount: 22.5 },
];

interface InvestmentBreakdownChartProps {
  data?: SectorData[];
  title?: string;
  height?: number;
}

const formatTooltipValue = createPayloadFormatter((value, _name, item) => {
  const amount = (item.payload as SectorData | undefined)?.amount;
  return [
    value !== undefined ? `${value}% ${amount ? `($${amount}M)` : ''}` : '',
    'Portfolio Allocation',
  ];
});

export default function InvestmentBreakdownChart({
  data = sectorData,
  title = 'Portfolio Allocation by Sector',
  height = 320,
}: InvestmentBreakdownChartProps) {
  if (!data || data.length === 0) {
    return (
      <ChartContainer
        title={title}
        description="Investment distribution across sectors"
        height={height}
      >
        <div className="flex items-center justify-center h-full text-charcoal-500">
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
                stroke={presson.color.surface}
                strokeWidth={2}
              >
                {data.map((entry: SectorData, index: number) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={formatTooltipValue}
                contentStyle={{
                  backgroundColor: presson.color.surface,
                  border: `1px solid ${presson.color.borderSubtle}`,
                  borderRadius: '8px',
                  boxShadow: presson.shadow.card,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-3 pt-4 border-t border-charcoal/7">
          {data.map((sector: SectorData, index: number) => (
            <div key={index} className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-3">
                <div
                  className="w-4 h-4 rounded-full shadow-sm"
                  style={{ backgroundColor: sector.color }}
                ></div>
                <span className="text-charcoal-700 font-medium">{sector.name}</span>
              </div>
              <div className="text-right">
                <span className="font-semibold text-pov-charcoal">{sector.value}%</span>
                {sector.amount && (
                  <div className="text-xs text-charcoal-500">${sector.amount}M</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </ChartContainer>
  );
}
