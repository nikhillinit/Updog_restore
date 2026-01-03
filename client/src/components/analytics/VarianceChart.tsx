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
    case 'critical': return '#dc2626';
    case 'high': return '#ea580c';
    case 'medium': return '#d97706';
    case 'low': return '#16a34a';
    default: return '#6b7280';
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

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: unknown[]; label?: string }) => {
    if (active && payload && payload.length) {
      const data = payload[0]!.payload;
      return (
        <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium text-gray-900 mb-2">{data.metric}</p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Baseline:</span>
              <span className="font-medium">{valueFormatter(data.baseline)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Actual:</span>
              <span className="font-medium">{valueFormatter(data.actual)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Variance:</span>
              <span className={cn(
                "font-medium",
                data.variance > 0 ? "text-green-600" : "text-red-600"
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
                data.severity === 'critical' && "border-red-500 text-red-700",
                data.severity === 'high' && "border-orange-500 text-orange-700",
                data.severity === 'medium' && "border-yellow-500 text-yellow-700",
                data.severity === 'low' && "border-green-500 text-green-700"
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
          <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
          {description && <div className="h-4 w-72 bg-gray-200 rounded animate-pulse mt-2" />}
        </CardHeader>
        <CardContent>
          <div style={{ height }} className="w-full bg-gray-100 rounded animate-pulse" />
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
          <div style={{ height }} className="w-full flex items-center justify-center text-gray-500">
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
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="baseline"
            tickFormatter={valueFormatter}
            stroke="#6b7280"
            fontSize={12}
            label={{ value: 'Baseline', position: 'bottom', offset: -5 }}
          />
          <YAxis
            dataKey="actual"
            tickFormatter={valueFormatter}
            stroke="#6b7280"
            fontSize={12}
            label={{ value: 'Actual', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip content={<CustomTooltip />} />

          {showVarianceBands && (
            <>
              <ReferenceLine
                stroke="#dc2626"
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
            fill="#2563eb"
          />
        </ScatterChart>
      );
    }

    return (
      <ComposedChart data={processedData} margin={{ top: 20, right: 30, bottom: 60, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="formattedMetric"
          angle={-45}
          textAnchor="end"
          height={80}
          stroke="#6b7280"
          fontSize={12}
        />
        <YAxis
          yAxisId="left"
          tickFormatter={valueFormatter}
          stroke="#6b7280"
          fontSize={12}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickFormatter={(value) => `${value}%`}
          stroke="#6b7280"
          fontSize={12}
        />
        <Tooltip content={<CustomTooltip />} />

        {showVarianceBands && (
          <>
            <ReferenceLine
              yAxisId="right"
              y={acceptableVariance}
              stroke="#f59e0b"
              strokeDasharray="5 5"
              label={{ value: `+${acceptableVariance}%`, position: "top" }}
            />
            <ReferenceLine
              yAxisId="right"
              y={-acceptableVariance}
              stroke="#f59e0b"
              strokeDasharray="5 5"
              label={{ value: `-${acceptableVariance}%`, position: "bottom" }}
            />
          </>
        )}

        <Bar
          yAxisId="left"
          dataKey="baseline"
          fill="#e5e7eb"
          name="Baseline"
          radius={[2, 2, 0, 0]}
        />
        <Bar
          yAxisId="left"
          dataKey="actual"
          fill="#3b82f6"
          name="Actual"
          radius={[2, 2, 0, 0]}
        />

        {chartType === 'line' && (
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="variancePercent"
            stroke="#dc2626"
            strokeWidth={2}
            dot={{ fill: '#dc2626', strokeWidth: 2, r: 4 }}
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

  const TrendTooltip = ({ active, payload }: { active?: boolean; payload?: unknown[] }) => {
    if (active && payload && payload.length) {
      const data = payload[0]!.payload;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium text-gray-900">{data.formattedDate}</p>
          <p className="text-sm text-gray-600">
            Metric: <span className="font-medium">{data.metric}</span>
          </p>
          <p className="text-sm text-gray-600">
            Variance: <span className={cn(
              "font-medium",
              data.variance > 0 ? "text-green-600" : "text-red-600"
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
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="timestamp"
                domain={['dataMin', 'dataMax']}
                scale="time"
                type="number"
                tickFormatter={(timestamp) => format(new Date(timestamp), 'MMM dd')}
                stroke="#6b7280"
                fontSize={12}
              />
              <YAxis
                tickFormatter={(value) => `${value}%`}
                stroke="#6b7280"
                fontSize={12}
              />
              <Tooltip content={<TrendTooltip />} />

              <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="2 2" />

              <Line
                type="monotone"
                dataKey="variance"
                stroke="#dc2626"
                strokeWidth={2}
                dot={{ fill: '#dc2626', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: '#dc2626', strokeWidth: 2, fill: '#ffffff' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
