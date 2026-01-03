import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, parseISO, isValid } from 'date-fns';

interface TimelineDataPoint {
  timestamp: string;
  value: number;
  label?: string;
  type?: 'event' | 'snapshot' | 'milestone';
  metadata?: Record<string, unknown>;
}

interface TimelineChartProps {
  data: TimelineDataPoint[];
  title: string;
  description?: string;
  valueFormatter?: (value: number) => string;
  height?: number;
  showBaseline?: boolean;
  baselineValue?: number;
  baselineLabel?: string;
  className?: string;
  loading?: boolean;
}

export function TimelineChart({
  data,
  title,
  description,
  valueFormatter = value => value.toLocaleString(),
  height = 300,
  showBaseline = false,
  baselineValue,
  baselineLabel = "Baseline",
  className = "",
  loading = false
}: TimelineChartProps) {
  const processedData = useMemo(() => {
    return data
      .filter(point => {
        const date = parseISO(point.timestamp);
        return isValid(date);
      })
      .map(point => ({
        ...point,
        formattedDate: format(parseISO(point.timestamp), 'MMM dd, yyyy'),
        timestamp: parseISO(point.timestamp).getTime(),
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [data]);

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: { formattedDate: string; label?: string; type?: string }; value: number }>; label?: number }) => {
    if (active && payload && payload.length) {
      const data = payload[0]!.payload;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium text-gray-900">{data.formattedDate}</p>
          <p className="text-sm text-gray-600">
            Value: <span className="font-medium">{valueFormatter(payload[0]!.value)}</span>
          </p>
          {data.label && (
            <p className="text-sm text-gray-600">
              Event: <span className="font-medium">{data.label}</span>
            </p>
          )}
          {data.type && (
            <Badge variant="outline" className="mt-1">
              {data.type}
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
            No timeline data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div style={{ height }} className="w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={processedData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="timestamp"
                domain={['dataMin', 'dataMax']}
                scale="time"
                type="number"
                tickFormatter={(timestamp: number) => format(new Date(timestamp), 'MMM dd')}
                stroke="#6b7280"
                fontSize={12}
              />
              <YAxis
                tickFormatter={valueFormatter as (value: number) => string}
                stroke="#6b7280"
                fontSize={12}
              />
              <Tooltip content={<CustomTooltip />} />

              {showBaseline && baselineValue && (
                <ReferenceLine
                  y={baselineValue}
                  stroke="#dc2626"
                  strokeDasharray="5 5"
                  label={{ value: baselineLabel, position: "top" }}
                />
              )}

              <Line
                type="monotone"
                dataKey="value"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ fill: '#2563eb', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: '#2563eb', strokeWidth: 2, fill: '#ffffff' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function EventTimelineChart({
  events,
  title = "Event Timeline",
  description,
  height = 200,
  className = ""
}: {
  events: Array<{
    timestamp: string;
    type: string;
    label: string;
    value?: number;
  }>;
  title?: string;
  description?: string;
  height?: number;
  className?: string;
}) {
  const processedEvents = useMemo(() => {
    return events
      .filter(event => {
        const date = parseISO(event.timestamp);
        return isValid(date);
      })
      .map((event, index) => ({
        ...event,
        formattedDate: format(parseISO(event.timestamp), 'MMM dd, HH:mm'),
        timestamp: parseISO(event.timestamp).getTime(),
        y: index % 3, // Stagger events vertically
      }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [events]);

  const EventTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: { label: string; formattedDate: string; type: string } }> }) => {
    if (active && payload && payload.length) {
      const event = payload[0]!.payload;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium text-gray-900">{event.label}</p>
          <p className="text-sm text-gray-600">{event.formattedDate}</p>
          <Badge variant="outline" className="mt-1">
            {event.type}
          </Badge>
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
            <LineChart data={processedEvents} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="timestamp"
                domain={['dataMin', 'dataMax']}
                scale="time"
                type="number"
                tickFormatter={(timestamp: number) => format(new Date(timestamp), 'MMM dd')}
                stroke="#6b7280"
                fontSize={12}
              />
              <YAxis hide />
              <Tooltip content={<EventTooltip />} />

              <Line
                type="monotone"
                dataKey="y"
                stroke="none"
                dot={{ fill: '#2563eb', strokeWidth: 2, r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}