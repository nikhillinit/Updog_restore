import { ResponsiveScatterPlot } from '@nivo/scatterplot';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface MOICData {
  id: string;
  data: Array<{
    x: number; // IRR
    y: number; // MOIC
    company?: string;
    investment?: number;
  }>;
}

interface NivoMOICScatterProps {
  title: string;
  data: MOICData[];
  height?: number;
}

export default function NivoMOICScatter({ 
  title, 
  data, 
  height = 400 
}: NivoMOICScatterProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ height: `${height}px` }}>
          <ResponsiveScatterPlot
            data={data}
            margin={{ top: 20, right: 110, bottom: 70, left: 90 }}
            xScale={{ type: 'linear', min: 0, max: 'auto' }}
            xFormat=">-.1f"
            yScale={{ type: 'linear', min: 0, max: 'auto' }}
            yFormat=">-.2f"
            blendMode="multiply"
            axisTop={null}
            axisRight={null}
            axisBottom={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: 0,
              legend: 'IRR (%)',
              legendPosition: 'middle',
              legendOffset: 46,
              format: (value) => `${value}%`
            }}
            axisLeft={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: 0,
              legend: 'MOIC (x)',
              legendPosition: 'middle',
              legendOffset: -60,
              format: (value) => `${value}x`
            }}
            colors={['#2563eb', '#dc2626', '#16a34a', '#ca8a04']}
            nodeSize={{
              key: 'investment',
              values: [0, 5000000],
              sizes: [6, 20]
            }}
            animate={true}
            motionConfig="gentle"
            tooltip={({ node }) => (
              <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                <div className="font-semibold" style={{ color: node.style.color }}>
                  {node.data.company || node.serieId}
                </div>
                <div className="text-sm text-gray-600">
                  <div>IRR: {node.data.formattedX}%</div>
                  <div>MOIC: {node.data.formattedY}x</div>
                  {node.data.investment && (
                    <div>Investment: ${(node.data.investment / 1000000).toFixed(1)}M</div>
                  )}
                </div>
              </div>
            )}
            legends={[
              {
                anchor: 'bottom-right',
                direction: 'column',
                justify: false,
                translateX: 130,
                translateY: 0,
                itemWidth: 100,
                itemHeight: 12,
                itemsSpacing: 5,
                itemDirection: 'left-to-right',
                symbolSize: 12,
                symbolShape: 'circle',
                effects: [
                  {
                    on: 'hover',
                    style: {
                      itemOpacity: 1
                    }
                  }
                ]
              }
            ]}
          />
        </div>
      </CardContent>
    </Card>
  );
}