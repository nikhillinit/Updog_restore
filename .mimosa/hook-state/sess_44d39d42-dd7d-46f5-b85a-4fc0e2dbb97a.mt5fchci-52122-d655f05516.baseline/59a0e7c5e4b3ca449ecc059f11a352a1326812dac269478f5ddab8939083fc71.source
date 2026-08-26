import { PieChart } from 'recharts/es6/chart/PieChart';
import { Pie } from 'recharts/es6/polar/Pie';
import { Cell } from 'recharts/es6/component/Cell';
import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer';
import { Tooltip } from 'recharts/es6/component/Tooltip';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MoreHorizontal } from 'lucide-react';
import { presson } from '@/theme/presson.tokens';
import { colors as brandColors } from '@/lib/brand-tokens';

const STATUS_SUCCESS = brandColors.success;
const CATEGORY_SERIES_COLORS = [
  presson.color.text,
  presson.color.positive,
  presson.color.info,
  STATUS_SUCCESS,
  presson.color.warning,
  presson.color.negative,
] as const;

const getCategorySeriesColor = (index: number): string =>
  CATEGORY_SERIES_COLORS[index % CATEGORY_SERIES_COLORS.length];

// Sample concentration data by different metrics
// TODO(design): sector and company charts exceed the six-token categorical palette.
const concentrationBySector = [
  { name: 'SaaS', value: 18.5, companies: 8, color: getCategorySeriesColor(0) },
  { name: 'Fintech', value: 16.2, companies: 6, color: getCategorySeriesColor(1) },
  { name: 'Healthcare', value: 14.8, companies: 5, color: getCategorySeriesColor(2) },
  { name: 'E-commerce', value: 12.3, companies: 4, color: getCategorySeriesColor(3) },
  { name: 'AI/ML', value: 10.7, companies: 3, color: getCategorySeriesColor(4) },
  { name: 'Marketplace', value: 9.2, companies: 3, color: getCategorySeriesColor(5) },
  { name: 'Proptech', value: 8.1, companies: 2, color: getCategorySeriesColor(6) },
  { name: 'Edtech', value: 6.4, companies: 2, color: getCategorySeriesColor(7) },
  { name: 'Other', value: 3.8, companies: 2, color: getCategorySeriesColor(8) },
];

const concentrationByStage = [
  { name: 'Seed', value: 42.3, companies: 12, color: getCategorySeriesColor(0) },
  { name: 'Series A', value: 28.7, companies: 8, color: getCategorySeriesColor(1) },
  { name: 'Series B', value: 18.9, companies: 5, color: getCategorySeriesColor(2) },
  { name: 'Pre-Seed', value: 6.8, companies: 3, color: getCategorySeriesColor(3) },
  { name: 'Series C+', value: 3.3, companies: 2, color: getCategorySeriesColor(4) },
];

const concentrationByGeography = [
  { name: 'San Francisco', value: 32.4, companies: 12, color: getCategorySeriesColor(0) },
  { name: 'New York', value: 24.1, companies: 8, color: getCategorySeriesColor(1) },
  { name: 'Los Angeles', value: 16.8, companies: 6, color: getCategorySeriesColor(2) },
  { name: 'Austin', value: 12.2, companies: 4, color: getCategorySeriesColor(3) },
  { name: 'Boston', value: 8.7, companies: 3, color: getCategorySeriesColor(4) },
  { name: 'Seattle', value: 5.8, companies: 2, color: getCategorySeriesColor(5) },
];

const concentrationByOwnership = [
  { name: 'High (>15%)', value: 28.4, companies: 4, color: presson.color.negative },
  { name: 'Medium (5-15%)', value: 45.2, companies: 12, color: presson.color.warning },
  { name: 'Low (<5%)', value: 26.4, companies: 14, color: STATUS_SUCCESS },
];

const concentrationByCheckSize = [
  { name: '$2M+', value: 34.7, companies: 6, color: getCategorySeriesColor(0) },
  { name: '$1M-$2M', value: 28.3, companies: 8, color: getCategorySeriesColor(1) },
  { name: '$500K-$1M', value: 22.1, companies: 10, color: getCategorySeriesColor(2) },
  { name: '$250K-$500K', value: 10.4, companies: 4, color: getCategorySeriesColor(3) },
  { name: '<$250K', value: 4.5, companies: 2, color: getCategorySeriesColor(4) },
];

const concentrationByPortfolioCompany = [
  { name: 'TechCorp Inc.', value: 8.7, companies: 1, color: getCategorySeriesColor(0) },
  { name: 'DataFlow Solutions', value: 7.9, companies: 1, color: getCategorySeriesColor(1) },
  { name: 'AI Dynamics', value: 7.2, companies: 1, color: getCategorySeriesColor(2) },
  { name: 'FinanceFlow', value: 6.8, companies: 1, color: getCategorySeriesColor(3) },
  { name: 'HealthTech Pro', value: 6.1, companies: 1, color: getCategorySeriesColor(4) },
  { name: 'EduConnect', value: 5.4, companies: 1, color: getCategorySeriesColor(5) },
  { name: 'PropTech Hub', value: 4.9, companies: 1, color: getCategorySeriesColor(6) },
  { name: 'RetailNext', value: 4.3, companies: 1, color: getCategorySeriesColor(7) },
  { name: 'CloudSecure', value: 3.8, companies: 1, color: getCategorySeriesColor(8) },
  { name: 'Other (21 companies)', value: 44.9, companies: 21, color: getCategorySeriesColor(9) },
];

interface ConcentrationData {
  name: string;
  value: number;
  companies: number;
  color: string;
  [key: string]: unknown;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ConcentrationData }>;
}

const CustomTooltip = ({ active, payload }: TooltipProps) => {
  if (active && payload && payload.length && payload[0]) {
    const data = payload[0].payload;
    return (
      <div className="bg-white p-3 border border-beige-200 rounded-lg shadow-lg">
        <div className="flex items-center space-x-2 mb-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: data.color }}></div>
          <span className="font-medium text-pov-charcoal">{data.name}</span>
        </div>
        <div className="text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-charcoal-600">Percentage:</span>
            <span className="font-medium">{data.value}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-charcoal-600">Companies:</span>
            <span className="font-medium">{data.companies}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

const ConcentrationChart = ({
  data,
  title: _title,
}: {
  data: ConcentrationData[];
  title: string;
}) => {
  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={120}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      {/* Custom Legend */}
      <div className="mt-4 grid grid-cols-1 gap-2 max-h-32 overflow-y-auto">
        {data.map((entry, index) => (
          <div key={index} className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: entry.color }}
              ></div>
              <span className="text-charcoal-700 truncate" title={entry.name}>
                {entry.name}
              </span>
            </div>
            <div className="flex items-center space-x-3 text-charcoal-600">
              <span>{entry.value}%</span>
              <span className="text-xs">({entry.companies})</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function PortfolioConcentration() {
  const [activeTab, setActiveTab] = useState('sector');

  const getTabData = (tab: string) => {
    switch (tab) {
      case 'sector':
        return concentrationBySector;
      case 'stage':
        return concentrationByStage;
      case 'geography':
        return concentrationByGeography;
      case 'ownership':
        return concentrationByOwnership;
      case 'checksize':
        return concentrationByCheckSize;
      case 'company':
        return concentrationByPortfolioCompany;
      default:
        return concentrationBySector;
    }
  };

  const getTabTitle = (tab: string) => {
    switch (tab) {
      case 'sector':
        return 'By Sector';
      case 'stage':
        return 'By Stage';
      case 'geography':
        return 'By Geography';
      case 'ownership':
        return 'By Ownership %';
      case 'checksize':
        return 'By Check Size';
      case 'company':
        return 'By Portfolio Company';
      default:
        return 'By Sector';
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-medium text-pov-charcoal">
            Concentration Analysis
          </CardTitle>
          <Button variant="ghost" size="sm">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 mb-4">
            <TabsTrigger value="sector" className="text-xs">
              Sector
            </TabsTrigger>
            <TabsTrigger value="stage" className="text-xs">
              Stage
            </TabsTrigger>
            <TabsTrigger value="geography" className="text-xs">
              Geography
            </TabsTrigger>
            <TabsTrigger value="ownership" className="text-xs">
              Ownership
            </TabsTrigger>
            <TabsTrigger value="checksize" className="text-xs">
              Check Size
            </TabsTrigger>
            <TabsTrigger value="company" className="text-xs">
              Company
            </TabsTrigger>
          </TabsList>

          {['sector', 'stage', 'geography', 'ownership', 'checksize', 'company'].map((tab) => (
            <TabsContent key={tab} value={tab} className="mt-0">
              <ConcentrationChart data={getTabData(tab)} title={getTabTitle(tab)} />
            </TabsContent>
          ))}
        </Tabs>

        {/* Summary Statistics */}
        <div className="mt-6 pt-4 border-t border-beige-200">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div className="text-center">
              <div className="text-lg font-semibold text-pov-charcoal">
                {getTabData(activeTab).length}
              </div>
              <div className="text-charcoal-500">Categories</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-pov-charcoal">
                {getTabData(activeTab)[0]?.value}%
              </div>
              <div className="text-charcoal-500">Top Category</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-pov-charcoal">
                {getTabData(activeTab).reduce((sum, item) => sum + item.companies, 0)}
              </div>
              <div className="text-charcoal-500">Total Companies</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-pov-charcoal">
                {getTabData(activeTab)
                  .slice(0, 3)
                  .reduce((sum, item) => sum + item.value, 0)
                  .toFixed(1)}
                %
              </div>
              <div className="text-charcoal-500">Top 3 Concentration</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
