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

export default function NivoPerformanceChart({ 
  title, 
  data, 
  height = 400 
}: NivoPerformanceChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ height: `${height}px` }}>
          <ResponsiveLine
            data={data}
            margin={{ top: 20, right: 110, bottom: 50, left: 60 }}
            xScale={{ type: 'point' }}
            yScale={{
              type: 'linear',
              min: 'auto',
              max: 'auto',
              stacked: false,
            }}
            axisTop={null}
            axisRight={null}
            axisBottom={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: 0,
              legend: 'Time Period',
              legendOffset: 36,
              legendPosition: 'middle'
            }}
            axisLeft={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: 0,
              legend: 'Value ($M)',
              legendOffset: -50,
              legendPosition: 'middle',
              format: (value) => `$${(value / 1000000).toFixed(1)}M`
            }}
            pointSize={8}
            pointColor={{ theme: 'background' }}
            pointBorderWidth={2}
            pointBorderColor={{ from: 'serieColor' }}
            pointLabelYOffset={-12}
            useMesh={true}
            legends={[
              {
                anchor: 'bottom-right',
                direction: 'column',
                justify: false,
                translateX: 100,
                translateY: 0,
                itemsSpacing: 0,
                itemDirection: 'left-to-right',
                itemWidth: 80,
                itemHeight: 20,
                itemOpacity: 0.75,
                symbolSize: 12,
                symbolShape: 'circle',
                symbolBorderColor: 'rgba(0, 0, 0, .5)',
                effects: [
                  {
                    on: 'hover',
                    style: {
                      itemBackground: 'rgba(0, 0, 0, .03)',
                      itemOpacity: 1
                    }
                  }
                ]
              }
            ]}
            colors={['#2563eb', '#dc2626', '#16a34a', '#ca8a04']}
            animate={true}
            motionConfig="gentle"
            tooltip={({ point }) => (
              <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                <div className="font-semibold" style={{ color: point.serieColor }}>
                  {point.serieId}
                </div>
                <div className="text-sm text-gray-600">
                  {point.data.xFormatted}: ${(Number(point.data.yFormatted) / 1000000).toFixed(2)}M
                </div>
              </div>
            )}
          />
        </div>
      </CardContent>
    </Card>
  );
}