import { BarChart } from 'recharts/es6/chart/BarChart';
import { Bar } from 'recharts/es6/cartesian/Bar';
import { XAxis } from 'recharts/es6/cartesian/XAxis';
import { YAxis } from 'recharts/es6/cartesian/YAxis';
import { CartesianGrid } from 'recharts/es6/cartesian/CartesianGrid';
import { Tooltip } from 'recharts/es6/component/Tooltip';
import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer';
import { Legend } from 'recharts/es6/component/Legend';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  computeReservesFromGraduation,
  type FundDataForReserves,
} from '@/core/reserves/computeReservesFromGraduation';
import { Calculator, TrendingUp, Target, AlertTriangle } from 'lucide-react';
import { createDynamicFormatter } from '@/lib/chart-formatters';
import { presson } from '@/theme/presson.tokens';

type GraduationRates = FundDataForReserves['graduationRates'];
type GraduationStage = keyof GraduationRates;

const formatComparisonTooltip = createDynamicFormatter((value, name) => {
  if (name === 'reserveRatio') {
    return [value !== undefined ? `${value}%` : '', 'Reserve Ratio'];
  }

  return [value !== undefined ? `$${value}M` : '', typeof name === 'string' ? name : 'Value'];
});

interface Scenario {
  name: string;
  description: string;
  fundData: FundDataForReserves;
  color: string;
}

export default function GraduationReservesDemo() {
  const [selectedScenario, setSelectedScenario] = useState<number>(0);

  const scenarios: Scenario[] = [
    {
      name: 'Conservative VC',
      description: 'Lower graduation rates, higher follow-on checks',
      color: presson.color.negative,
      fundData: {
        totalCommitment: 50000000,
        targetCompanies: 25,
        avgCheckSize: 800000,
        deploymentPacePerYear: 10,
        graduationRates: {
          seedToA: { graduate: 25, fail: 55, remain: 20, months: 24 },
          aToB: { graduate: 40, fail: 40, remain: 20, months: 30 },
          bToC: { graduate: 50, fail: 35, remain: 15, months: 24 },
        },
        followOnChecks: { A: 1200000, B: 2000000, C: 3500000 },
      },
    },
    {
      name: 'Aggressive Growth',
      description: 'Higher graduation rates, moderate follow-ons',
      color: presson.color.positive,
      fundData: {
        totalCommitment: 50000000,
        targetCompanies: 35,
        avgCheckSize: 700000,
        deploymentPacePerYear: 15,
        graduationRates: {
          seedToA: { graduate: 45, fail: 35, remain: 20, months: 15 },
          aToB: { graduate: 65, fail: 20, remain: 15, months: 18 },
          bToC: { graduate: 70, fail: 20, remain: 10, months: 15 },
        },
        followOnChecks: { A: 800000, B: 1500000, C: 2200000 },
      },
    },
    {
      name: 'Balanced Portfolio',
      description: 'Market-average rates and check sizes',
      color: presson.color.info,
      fundData: {
        totalCommitment: 50000000,
        targetCompanies: 30,
        avgCheckSize: 750000,
        deploymentPacePerYear: 12,
        graduationRates: {
          seedToA: { graduate: 35, fail: 45, remain: 20, months: 18 },
          aToB: { graduate: 50, fail: 30, remain: 20, months: 24 },
          bToC: { graduate: 60, fail: 25, remain: 15, months: 18 },
        },
        followOnChecks: { A: 1000000, B: 1800000, C: 2800000 },
      },
    },
  ];

  const currentScenario = scenarios[selectedScenario] ?? scenarios[0];
  if (!currentScenario) return null;
  const result = computeReservesFromGraduation(currentScenario.fundData);
  const graduationRateEntries = Object.entries(currentScenario.fundData.graduationRates) as Array<
    [GraduationStage, GraduationRates[GraduationStage]]
  >;

  // Calculate comparison data for all scenarios
  const comparisonData = scenarios.map((scenario) => {
    const scenarioResult = computeReservesFromGraduation(scenario.fundData);
    return {
      name: scenario.name,
      reserveRatio: scenarioResult.reserveRatioPct,
      totalReserves: scenarioResult.totalReserves / 1000000, // Convert to millions
      seriesA: scenarioResult.aggregateByStage.A / 1000000,
      seriesB: scenarioResult.aggregateByStage.B / 1000000,
      seriesC: scenarioResult.aggregateByStage.C / 1000000,
      color: scenario.color,
    };
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  return (
    <div className="space-y-6" data-testid="demo-root">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-bold flex items-center">
                <Calculator className="w-6 h-6 mr-2 text-presson-info" />
                Graduation-Driven Reserves Engine
              </CardTitle>
              <p className="text-charcoal-600 mt-2">
                Compare how different graduation rates and follow-on strategies impact your reserve
                requirements
              </p>
            </div>
            <Badge
              variant="outline"
              className="bg-presson-info/10 text-presson-info border-presson-info/20"
            >
              Expected Value v1
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Scenario Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Select Investment Strategy</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {scenarios.map((scenario, index) => (
              <Button
                key={index}
                variant={selectedScenario === index ? 'default' : 'outline'}
                className={`h-auto p-4 text-left justify-start ${
                  selectedScenario === index ? '' : 'hover:bg-pov-gray'
                }`}
                onClick={() => setSelectedScenario(index)}
              >
                <div>
                  <div className="font-semibold">{scenario.name}</div>
                  <div className="text-sm text-charcoal-600 mt-1">{scenario.description}</div>
                </div>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Current Scenario Results */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Key Metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <Target className="w-5 h-5 mr-2 text-presson-positive" />
              {currentScenario.name} Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-presson-info/10 p-4 rounded-lg">
                  <div className="text-sm font-medium text-presson-info">Total Reserves</div>
                  <div className="text-2xl font-bold text-presson-info">
                    {formatCurrency(result?.totalReserves ?? 0)}
                  </div>
                </div>
                <div className="bg-presson-info/10 p-4 rounded-lg">
                  <div className="text-sm font-medium text-presson-info">Reserve Ratio</div>
                  <div className="text-2xl font-bold text-presson-info" data-testid="demo-ratio">
                    {formatPercent(result?.reserveRatioPct ?? 0)}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-charcoal-600">Series A Follow-ons:</span>
                  <span className="font-medium">
                    {formatCurrency(result?.aggregateByStage.A ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-charcoal-600">Series B Follow-ons:</span>
                  <span className="font-medium">
                    {formatCurrency(result?.aggregateByStage.B ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-charcoal-600">Series C Follow-ons:</span>
                  <span className="font-medium">
                    {formatCurrency(result?.aggregateByStage.C ?? 0)}
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t">
                <div className="text-sm text-charcoal-600 space-y-1">
                  <div>
                    <strong>Companies per Quarter:</strong> {result?.assumptions.perQuarter ?? 0}
                  </div>
                  <div>
                    <strong>Deployment Period:</strong>{' '}
                    {result?.assumptions.deploymentQuarters ?? 0} quarters
                  </div>
                  <div>
                    <strong>Target Companies:</strong>{' '}
                    {currentScenario?.fundData?.targetCompanies ?? 0}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Graduation Rates */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Graduation Assumptions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {graduationRateEntries.map(([stage, rates]) => (
                <div key={stage} className="bg-pov-gray p-4 rounded-lg">
                  <div className="text-sm font-semibold text-charcoal-700 mb-2">
                    {stage === 'seedToA'
                      ? 'Seed -> Series A'
                      : stage === 'aToB'
                        ? 'Series A -> Series B'
                        : 'Series B -> Series C'}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-success font-medium">Graduate: {rates.graduate}%</div>
                    </div>
                    <div>
                      <div className="text-error font-medium">Fail: {rates.fail}%</div>
                    </div>
                    <div>
                      <div className="text-warning font-medium">Remain: {rates.remain}%</div>
                    </div>
                  </div>
                  <div className="text-xs text-charcoal-500 mt-1">
                    Avg time: {rates.months} months
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Scenario Comparison Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center">
            <BarChart className="w-5 h-5 mr-2 text-presson-info" />
            Strategy Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis
                  yAxisId="left"
                  label={{ value: 'Reserves ($M)', angle: -90, position: 'insideLeft' }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  label={{ value: 'Reserve Ratio (%)', angle: 90, position: 'insideRight' }}
                />
                <Tooltip formatter={formatComparisonTooltip} />
                <Legend />
                <Bar
                  yAxisId="left"
                  dataKey="seriesA"
                  stackId="reserves"
                  fill={presson.color.text}
                  name="Series A"
                />
                <Bar
                  yAxisId="left"
                  dataKey="seriesB"
                  stackId="reserves"
                  fill={presson.color.positive}
                  name="Series B"
                />
                <Bar
                  yAxisId="left"
                  dataKey="seriesC"
                  stackId="reserves"
                  fill={presson.color.info}
                  name="Series C"
                />
                <Bar
                  yAxisId="right"
                  dataKey="reserveRatio"
                  fill={presson.color.warning}
                  name="Reserve Ratio (%)"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Key Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center">
            <TrendingUp className="w-5 h-5 mr-2 text-presson-warning" />
            Key Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-warning/10 p-4 rounded-lg border border-warning/50">
              <div className="flex items-center mb-2">
                <AlertTriangle className="w-4 h-4 text-warning mr-2" />
                <span className="text-sm font-medium text-warning-dark">Conservative Strategy</span>
              </div>
              <p className="text-sm text-warning-dark">
                Lower graduation rates require higher reserve ratios (
                {formatPercent(comparisonData[0]?.reserveRatio ?? 0)}) due to fewer companies
                reaching follow-on stages.
              </p>
            </div>

            <div className="bg-success/10 p-4 rounded-lg border border-success/50">
              <div className="flex items-center mb-2">
                <TrendingUp className="w-4 h-4 text-success mr-2" />
                <span className="text-sm font-medium text-success-dark">Aggressive Growth</span>
              </div>
              <p className="text-sm text-success-dark">
                High graduation rates with smaller checks create the most capital-efficient reserves
                ({formatPercent(comparisonData[1]?.reserveRatio ?? 0)}).
              </p>
            </div>

            <div className="bg-presson-info/10 p-4 rounded-lg border border-presson-info/20">
              <div className="flex items-center mb-2">
                <Target className="w-4 h-4 text-presson-info mr-2" />
                <span className="text-sm font-medium text-presson-info">Dynamic Calculation</span>
              </div>
              <p className="text-sm text-presson-info">
                Reserve ratios automatically adjust based on your portfolio graduation assumptions
                instead of using fixed percentages.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
