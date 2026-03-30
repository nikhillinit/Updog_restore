import React, { memo, useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type MOICDatum = {
  x: number; // IRR
  y: number; // MOIC
  company?: string;
  investment?: number;
};

interface MOICData {
  id: string;
  data: MOICDatum[];
}

interface NivoMOICScatterProps {
  title: string;
  data: MOICData[];
  height?: number;
}

const NivoMOICScatter = memo(function NivoMOICScatter({
  title,
  data,
  height = 400,
}: NivoMOICScatterProps) {
  const colors = useMemo(() => ['#2563eb', '#dc2626', '#16a34a', '#ca8a04'], []);
  const chartSeries = useMemo(
    () =>
      data.map((series) => ({
        id: series.id,
        data: series.data.map((point) => ({
          ...point,
          z: point.investment ?? 1000000,
        })),
      })),
    [data]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ height: `${height}px` }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 110, bottom: 70, left: 90 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="x"
                tickFormatter={(value: number) => `${value}%`}
                label={{ value: 'IRR (%)', position: 'insideBottom', offset: -10 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                tickFormatter={(value: number) => `${value}x`}
                label={{ value: 'MOIC (x)', angle: -90, position: 'insideLeft' }}
              />
              <ZAxis type="number" dataKey="z" range={[60, 280]} />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                content={({ active, payload }) => {
                  const point = payload?.[0]?.payload as (MOICDatum & { z?: number }) | undefined;
                  if (!active || !point) {
                    return null;
                  }

                  return (
                    <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                      <div className="font-semibold">{point.company || 'Company'}</div>
                      <div className="text-sm text-gray-600">
                        <div>IRR: {point.x.toFixed(1)}%</div>
                        <div>MOIC: {point.y.toFixed(2)}x</div>
                        {point.investment != null && (
                          <div>Investment: ${(point.investment / 1000000).toFixed(1)}M</div>
                        )}
                      </div>
                    </div>
                  );
                }}
              />
              <Legend verticalAlign="bottom" align="right" />
              {chartSeries.map((series, index) => (
                <Scatter
                  key={series.id}
                  name={series.id}
                  data={series.data}
                  fill={colors[index % colors.length] ?? colors[0]!}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
});

export default NivoMOICScatter;
