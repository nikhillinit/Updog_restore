/**
 * Comparison Delta Table Component
 *
 * Displays scenario comparison results in a tabular format with delta highlighting.
 * Shows metrics for each scenario with absolute and percentage differences from baseline.
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DeltaMetric, ScenarioSnapshot } from '@shared/types/scenario-comparison';

interface ComparisonDeltaTableProps {
  deltaMetrics: DeltaMetric[];
  scenarios: ScenarioSnapshot[];
  showAbsolute?: boolean;
  showPercentage?: boolean;
  highlightThreshold?: number;
  colorScheme?: 'traffic_light' | 'heatmap' | 'grayscale';
}

const formatValue = (value: number, metricName: string): string => {
  if (metricName === 'moic' || metricName.includes('multiple')) {
    return `${value.toFixed(2)}x`;
  }
  if (metricName === 'irr' || metricName.includes('irr')) {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return value.toFixed(2);
};

const formatDelta = (delta: number, metricName: string, isPercentage: boolean): string => {
  const sign = delta >= 0 ? '+' : '';
  if (isPercentage) {
    return `${sign}${delta.toFixed(1)}%`;
  }
  if (metricName === 'moic' || metricName.includes('multiple')) {
    return `${sign}${delta.toFixed(2)}x`;
  }
  if (metricName === 'irr' || metricName.includes('irr')) {
    return `${sign}${(delta * 100).toFixed(1)}%`;
  }
  if (Math.abs(delta) >= 1_000_000) {
    return `${sign}$${(delta / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(delta) >= 1_000) {
    return `${sign}$${(delta / 1_000).toFixed(0)}K`;
  }
  return `${sign}${delta.toFixed(2)}`;
};

const getDeltaColor = (
  isBetter: boolean,
  isSignificant: boolean,
  colorScheme: string
): string => {
  if (!isSignificant) return 'text-gray-500';

  if (colorScheme === 'grayscale') {
    return isBetter ? 'text-gray-900 font-semibold' : 'text-gray-600';
  }

  if (colorScheme === 'heatmap') {
    return isBetter ? 'text-blue-600' : 'text-orange-600';
  }

  // traffic_light (default)
  return isBetter ? 'text-green-600' : 'text-red-600';
};

const DeltaIndicator: React.FC<{
  delta: number;
  isBetter: boolean;
  isSignificant: boolean;
}> = ({ delta, isBetter, isSignificant }) => {
  if (!isSignificant || delta === 0) {
    return <Minus className="w-3 h-3 text-gray-400" />;
  }

  const Icon = delta > 0 ? ArrowUp : ArrowDown;
  const color = isBetter ? 'text-green-500' : 'text-red-500';

  return <Icon className={cn('w-3 h-3', color)} />;
};

export function ComparisonDeltaTable({
  deltaMetrics,
  scenarios,
  showAbsolute = true,
  showPercentage = true,
  highlightThreshold = 0.1,
  colorScheme = 'traffic_light',
}: ComparisonDeltaTableProps) {
  // Group metrics by metric name
  const metricsByName = deltaMetrics.reduce<Record<string, DeltaMetric[]>>(
    (acc, metric) => {
      if (!acc[metric.metricName]) {
        acc[metric.metricName] = [];
      }
      acc[metric.metricName].push(metric);
      return acc;
    },
    {}
  );

  const baseScenario = scenarios.find((s) => s.isBase);
  const comparisonScenarios = scenarios.filter((s) => !s.isBase);

  if (!baseScenario || comparisonScenarios.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-gray-500">
          No comparison data available
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          Metric Comparison
          <Badge variant="outline" className="text-xs font-normal">
            Base: {baseScenario.name}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Metric</TableHead>
                <TableHead className="text-right">Base Value</TableHead>
                {comparisonScenarios.map((scenario) => (
                  <TableHead key={scenario.id} className="text-right">
                    <div className="flex flex-col items-end">
                      <span>{scenario.name}</span>
                      <span className="text-xs text-gray-400 font-normal">
                        vs Base
                      </span>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(metricsByName).map(([metricName, metrics]) => {
                const firstMetric = metrics[0];
                const baseValue = firstMetric?.baseValue ?? 0;
                const isSignificant =
                  Math.abs(firstMetric?.percentageDelta ?? 0) / 100 >=
                  highlightThreshold;

                return (
                  <TableRow key={metricName}>
                    <TableCell className="font-medium">
                      {firstMetric?.displayName || metricName}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatValue(baseValue, metricName)}
                    </TableCell>
                    {comparisonScenarios.map((scenario) => {
                      const metric = metrics.find(
                        (m) => m.scenarioId === scenario.id
                      );
                      if (!metric) {
                        return (
                          <TableCell key={scenario.id} className="text-right">
                            -
                          </TableCell>
                        );
                      }

                      const metricIsSignificant =
                        Math.abs(metric.percentageDelta ?? 0) / 100 >=
                        highlightThreshold;

                      return (
                        <TableCell key={scenario.id} className="text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-mono">
                              {formatValue(metric.comparisonValue, metricName)}
                            </span>
                            <div className="flex items-center gap-1 text-sm">
                              <DeltaIndicator
                                delta={metric.absoluteDelta}
                                isBetter={metric.isBetter}
                                isSignificant={metricIsSignificant}
                              />
                              <span
                                className={getDeltaColor(
                                  metric.isBetter,
                                  metricIsSignificant,
                                  colorScheme
                                )}
                              >
                                {showAbsolute && (
                                  <span>
                                    {formatDelta(
                                      metric.absoluteDelta,
                                      metricName,
                                      false
                                    )}
                                  </span>
                                )}
                                {showAbsolute && showPercentage && ' '}
                                {showPercentage && metric.percentageDelta !== null && (
                                  <span className="text-xs">
                                    ({formatDelta(metric.percentageDelta, metricName, true)})
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export default ComparisonDeltaTable;
