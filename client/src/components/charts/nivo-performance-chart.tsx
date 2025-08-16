/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import React, { memo, useMemo, useCallback } from 'react';
import { ResponsiveLine } from '@nivo/line';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";


interface PerformanceData {
  id: string;
  data: Array<{
    x: string;
    y: number;
  }>;
}

interface NivoPerformanceChartProps {
  title: string;
  data: PerformanceData[];
  height?: number;
}

const NivoPerformanceChart = memo(function NivoPerformanceChart({ 
  title, 
  data, 
  height = 400 
}: NivoPerformanceChartProps) {
  // Memoize tooltip component
  const TooltipComponent = useCallback(({ point }: { point: any }) => (
    <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
      <div className="font-semibold" style={{ color: point.serieColor }}>
        {point.serieId}
      </div>
      <div className="text-sm text-gray-600">
        {point.data.xFormatted}: ${(Number(point.data.yFormatted) / 1000000).toFixed(2)}M
      </div>
    </div>
  ), []);
  
  // Memoize chart configuration
  const chartConfig = useMemo(() => ({
    margin: { top: 20, right: 110, bottom: 50, left: 60 },
    xScale: { type: 'point' as const },
    yScale: {
      type: 'linear' as const,
      min: 'auto' as const,
      max: 'auto' as const,
      stacked: false,
    },
    axisTop: null,
    axisRight: null,
    axisBottom: {
      tickSize: 5,
      tickPadding: 5,
      tickRotation: 0,
      legend: 'Time Period',
      legendOffset: 36,
      legendPosition: 'middle' as const
    },
    axisLeft: {
      tickSize: 5,
      tickPadding: 5,
      tickRotation: 0,
      legend: 'Value ($M)',
      legendOffset: -50,
      legendPosition: 'middle' as const,
      format: (value: number) => `$${(value / 1000000).toFixed(1)}M`
    },
    pointSize: 8,
    pointColor: { theme: 'background' as const },
    pointBorderWidth: 2,
    pointBorderColor: { from: 'serieColor' as const },
    pointLabelYOffset: -12,
    useMesh: true,
    colors: ['#2563eb', '#dc2626', '#16a34a', '#ca8a04'],
    animate: true,
    motionConfig: 'gentle' as const,
    legends: [{
      anchor: 'bottom-right' as const,
      direction: 'column' as const,
      justify: false,
      translateX: 100,
      translateY: 0,
      itemsSpacing: 0,
      itemDirection: 'left-to-right' as const,
      itemWidth: 80,
      itemHeight: 20,
      itemOpacity: 0.75,
      symbolSize: 12,
      symbolShape: 'circle' as const,
      symbolBorderColor: 'rgba(0, 0, 0, .5)',
      effects: [{
        on: 'hover' as const,
        style: {
          itemBackground: 'rgba(0, 0, 0, .03)',
          itemOpacity: 1
        }
      }]
    }]
  }), []);
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ height: `${height}px` }}>
          <ResponsiveLine
            data={data}
            {...chartConfig}
            tooltip={TooltipComponent}
          />
        </div>
      </CardContent>
    </Card>
  );
});

export default NivoPerformanceChart;

