import { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ScatterChart,
  Scatter
} from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, parseISO, isValid } from 'date-fns';
import { cn } from "@/lib/utils";

interface VarianceDataPoint {
  metric: string;
  baseline: number;
  actual: number;
  variance: number;
  variancePercent: number;
  timestamp?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

type ProcessedVarianceDataPoint = VarianceDataPoint & {
  index: number;
  absVariance: number;
  formattedMetric: string;
  severityColor: string;
};

const UI_SUCCESS_COLOR = '#10b981';
const UI_ERROR_COLOR = '#ef4444';
const CHART_GRID_COLOR = '#E0D8D1';
const CHART_AXIS_COLOR = '#5A5A5A';
const CHART_BASELINE_COLOR = CHART_GRID_COLOR;
const CHART_ACTUAL_COLOR = '#2563EB';
const CHART_REFERENCE_COLOR = '#9C6F19';
const CHART_VARIANCE_COLOR = '#B00020';
const CHART_BACKGROUND_COLOR = '#FFFFFF';

interface VarianceChartProps {
  data: VarianceDataPoint[];
  title: string;
  description?: string;
  valueFormatter?: (value: number) => string;
  height?: number;
  showVarianceBands?: boolean;
  acceptableVariance?: number;
  className?: string;
  loading?: boolean;
  chartType?: 'bar' | 'line' | 'scatter';
}

function getSeverityColor(severity?: string) {
  switch (severity) {
    case 'critical': return UI_ERROR_COLOR;
    case 'high': return CHART_REFERENCE_COLOR;
    case 'medium': return CHART_REFERENCE_COLOR;
    case 'low': return UI_SUCCESS_COLOR;
    default: return CHART_AXIS_COLOR;
  }
}

export function VarianceChart({
  data,
  title,
  description,
  valueFormatter = (value) => value.toLocaleString(),
  height = 300,
  showVarianceBands = true,
  acceptableVariance = 10, // 10% acceptable variance
  className = "",
  loading = false,
  chartType = 'bar'
}: VarianceChartProps) {
  const processedData = useMemo(() => {
    return data.map((point, index) => ({
      ...point,
      index,
      absVariance: Math.abs(point.variance),
      formattedMetric: point.metric.length > 15 ? `${point.metric.substring(0, 15)}...` : point.metric,
      severityColor: getSeverityColor(point.severity),
    }));
  }, [data]);

  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload: ProcessedVarianceDataPoint }>;
  }) => {
    if (active && payload && payload.length && payload[0]) {
      const data = payload[0].payload;
      return (
        <div className="bg-pov-white p-4 border border-beige-200 rounded-lg shadow-lg">
          <p className="font-medium text-pov-charcoal mb-2">{data.metric}</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-charcoal-600">Baseline:</span>
              <span className="font-medium">{valueFormatter(data.baseline)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-charcoal-600">Actual:</span>
              <span className="font-medium">{valueFormatter(data.actual)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-charcoal-600">Variance:</span>
              <span className={cn(
                "font-medium",
                data.variance > 0 ? "text-presson-positive" : "text-presson-negative"
              )}>
                {data.variance > 0 ? '+' : ''}{data.variancePercent.toFixed(1)}%
              </span>
            </div>
          </div>
          {data.severity && (
            <Badge
              variant="outline"
              className={cn(
                "mt-2",
                data.severity === 'critical' && "border-error/50 text-error-dark",
                data.severity === 'high' && "border-warning/50 text-warning-dark",
                data.severity === 'medium' && "border-warning/50 text-warning-dark",
                data.severity === 'low' && "border-success/50 text-success-dark"
              )}
            >
              {data.severity}
            </Badge>
          )}
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="h-6 w-48 bg-pov-gray rounded animate-pulse" />
          {description && <div className="h-4 w-72 bg-pov-gray rounded animate-pulse mt-2" />}
        </CardHeader>
        <CardContent>
          <div style={{ height }} className="w-full bg-pov-gray rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (!processedData.length) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <div style={{ height }} className="w-full flex items-center justify-center text-charcoal-500">
            No variance data available
          </div>
        </CardContent>
      </Card>
    );
  }

  const renderChart = () => {
    if (chartType === 'scatter') {
      return (
        <ScatterChart data={processedData} margin={{ top: 20, right: 30, bottom: 60, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
          <XAxis
            dataKey="baseline"
            tickFormatter={valueFormatter}
            stroke={CHART_AXIS_COLOR}
            fontSize={12}
            label={{ value: 'Baseline', position: 'bottom', offset: -5 }}
          />
          <YAxis
            dataKey="actual"
            tickFormatter={valueFormatter}
            stroke={CHART_AXIS_COLOR}
            fontSize={12}
            label={{ value: 'Actual', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip content={<CustomTooltip />} />

          {showVarianceBands && (
            <>
              <ReferenceLine
                stroke={CHART_AXIS_COLOR}
                strokeDasharray="5 5"
                segment={[
                  { x: Math.min(...processedData.map(d => d.baseline)), y: Math.min(...processedData.map(d => d.baseline)) },
                  { x: Math.max(...processedData.map(d => d.baseline)), y: Math.max(...processedData.map(d => d.baseline)) }
                ]}
              />
            </>
          )}

          <Scatter
            dataKey="actual"
            fill={CHART_ACTUAL_COLOR}
          />
        </ScatterChart>
      );
    }

    return (
      <ComposedChart data={processedData} margin={{ top: 20, right: 30, bottom: 60, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
        <XAxis
          dataKey="formattedMetric"
          angle={-45}
          textAnchor="end"
          height={80}
          stroke={CHART_AXIS_COLOR}
          fontSize={12}
        />
        <YAxis
          yAxisId="left"
          tickFormatter={valueFormatter}
          stroke={CHART_AXIS_COLOR}
          fontSize={12}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickFormatter={(value) => `${value}%`}
          stroke={CHART_AXIS_COLOR}
          fontSize={12}
        />
        <Tooltip content={<CustomTooltip />} />

        {showVarianceBands && (
          <>
            <ReferenceLine
              yAxisId="right"
              y={acceptableVariance}
              stroke={CHART_REFERENCE_COLOR}
              strokeDasharray="5 5"
              label={{ value: `+${acceptableVariance}%`, position: "top" }}
            />
            <ReferenceLine
              yAxisId="right"
              y={-acceptableVariance}
              stroke={CHART_REFERENCE_COLOR}
              strokeDasharray="5 5"
              label={{ value: `-${acceptableVariance}%`, position: "bottom" }}
            />
          </>
        )}

        <Bar
          yAxisId="left"
          dataKey="baseline"
          fill={CHART_BASELINE_COLOR}
          name="Baseline"
          radius={[2, 2, 0, 0]}
        />
        <Bar
          yAxisId="left"
          dataKey="actual"
          fill={CHART_ACTUAL_COLOR}
          name="Actual"
          radius={[2, 2, 0, 0]}
        />

        {chartType === 'line' && (
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="variancePercent"
            stroke={CHART_VARIANCE_COLOR}
            strokeWidth={2}
            dot={{ fill: CHART_VARIANCE_COLOR, strokeWidth: 2, r: 4 }}
            name="Variance %"
          />
        )}
      </ComposedChart>
    );
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div style={{ height }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            {renderChart()}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function VarianceTrendChart({
  data,
  title = "Variance Trend",
  description,
  height = 300,
  className = ""
}: {
  data: Array<{
    timestamp: string;
    variance: number;
    metric: string;
  }>;
  title?: string;
  description?: string;
  height?: number;
  className?: string;
}) {
  const processedData = useMemo(() => {
    return data
      .filter(point => {
        const date = parseISO(point.timestamp);
        return isValid(date);
      })
      .map(point => ({
        ...point,
        formattedDate: format(parseISO(point.timestamp), 'MMM dd'),
        timestamp: parseISO(point.timestamp).getTime(),
        absVariance: Math.abs(point.variance),
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [data]);

  const TrendTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{
      payload: {
        timestamp: number;
        variance: number;
        metric: string;
        formattedDate: string;
        absVariance: number;
      };
    }>;
  }) => {
    if (active && payload && payload.length && payload[0]) {
      const data = payload[0].payload;
      return (
        <div className="bg-pov-white p-3 border border-beige-200 rounded-lg shadow-lg">
          <p className="font-medium text-pov-charcoal">{data.formattedDate}</p>
          <p className="text-sm text-charcoal-600">
            Metric: <span className="font-medium">{data.metric}</span>
          </p>
          <p className="text-sm text-charcoal-600">
            Variance: <span className={cn(
              "font-medium",
              data.variance > 0 ? "text-presson-positive" : "text-presson-negative"
            )}>
              {data.variance > 0 ? '+' : ''}{data.variance.toFixed(1)}%
            </span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div style={{ height }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={processedData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
              <XAxis
                dataKey="timestamp"
                domain={['dataMin', 'dataMax']}
                scale="time"
                type="number"
                tickFormatter={(timestamp: ValueType | NameType) =>
                  format(new Date(Number(timestamp)), 'MMM dd')
                }
                stroke={CHART_AXIS_COLOR}
                fontSize={12}
              />
              <YAxis
                tickFormatter={(value) => `${value}%`}
                stroke={CHART_AXIS_COLOR}
                fontSize={12}
              />
              <Tooltip content={<TrendTooltip />} />

              <ReferenceLine y={0} stroke={CHART_AXIS_COLOR} strokeDasharray="2 2" />

              <Line
                type="monotone"
                dataKey="variance"
                stroke={CHART_VARIANCE_COLOR}
                strokeWidth={2}
                dot={{ fill: CHART_VARIANCE_COLOR, strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: CHART_VARIANCE_COLOR, strokeWidth: 2, fill: CHART_BACKGROUND_COLOR }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
