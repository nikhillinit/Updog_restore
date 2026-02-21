import React, { memo, useMemo, useCallback } from 'react';
import { ResponsiveScatterPlot } from '@nivo/scatterplot';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type MOICDatum = {
  x: number; // IRR
  y: number; // MOIC
  company?: string;
  investment?: number;
};

interface ScatterNode {
  color: string;
  serieId: string | number;
  formattedX: string;
  formattedY: string;
  data: MOICDatum;
}

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
  // Memoize tooltip component
  const TooltipComponent = useCallback(
    ({ node }: { node: ScatterNode }) => (
      <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
        <div className="font-semibold" style={{ color: node.color }}>
          {node.data.company || String(node.serieId)}
        </div>
        <div className="text-sm text-gray-600">
          <div>IRR: {node.formattedX}%</div>
          <div>MOIC: {node.formattedY}x</div>
          {node.data.investment && (
            <div>Investment: ${(node.data.investment / 1000000).toFixed(1)}M</div>
          )}
        </div>
      </div>
    ),
    []
  );

  // Memoize chart configuration
  const chartConfig = useMemo(
    () => ({
      margin: { top: 20, right: 110, bottom: 70, left: 90 },
      xScale: { type: 'linear' as const, min: 0 as const, max: 'auto' as const },
      xFormat: '>-.1f',
      yScale: { type: 'linear' as const, min: 0 as const, max: 'auto' as const },
      yFormat: '>-.2f',
      blendMode: 'multiply' as const,
      axisTop: null,
      axisRight: null,
      axisBottom: {
        tickSize: 5,
        tickPadding: 5,
        tickRotation: 0,
        legend: 'IRR (%)',
        legendPosition: 'middle' as const,
        legendOffset: 46,
        format: (value: number) => `${value}%`,
      },
      axisLeft: {
        tickSize: 5,
        tickPadding: 5,
        tickRotation: 0,
        legend: 'MOIC (x)',
        legendPosition: 'middle' as const,
        legendOffset: -60,
        format: (value: number) => `${value}x`,
      },
      colors: ['#2563eb', '#dc2626', '#16a34a', '#ca8a04'],
      nodeSize: {
        key: 'investment',
        values: [0, 5000000] as [number, number],
        sizes: [6, 20] as [number, number],
      },
      animate: true,
      motionConfig: 'gentle' as const,
      legends: [
        {
          anchor: 'bottom-right' as const,
          direction: 'column' as const,
          justify: false,
          translateX: 130,
          translateY: 0,
          itemWidth: 100,
          itemHeight: 12,
          itemsSpacing: 5,
          itemDirection: 'left-to-right' as const,
          symbolSize: 12,
          symbolShape: 'circle' as const,
          effects: [
            {
              on: 'hover' as const,
              style: {
                itemOpacity: 1,
              },
            },
          ],
        },
      ],
    }),
    []
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ height: `${height}px` }}>
          <ResponsiveScatterPlot data={data} {...chartConfig} tooltip={TooltipComponent} />
        </div>
      </CardContent>
    </Card>
  );
});

export default NivoMOICScatter;
