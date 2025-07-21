import { ResponsivePie } from '@nivo/pie';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AllocationData {
  id: string;
  label: string;
  value: number;
  color?: string;
}

interface NivoAllocationPieProps {
  title: string;
  data: AllocationData[];
  height?: number;
}

export default function NivoAllocationPie({ 
  title, 
  data, 
  height = 400 
}: NivoAllocationPieProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ height: `${height}px` }}>
          <ResponsivePie
            data={data}
            margin={{ top: 40, right: 80, bottom: 80, left: 80 }}
            innerRadius={0.5}
            padAngle={0.7}
            cornerRadius={3}
            activeOuterRadiusOffset={8}
            borderWidth={1}
            borderColor={{
              from: 'color',
              modifiers: [['darker', 0.2]]
            }}
            arcLinkLabelsSkipAngle={10}
            arcLinkLabelsTextColor="#333333"
            arcLinkLabelsThickness={2}
            arcLinkLabelsColor={{ from: 'color' }}
            arcLabelsSkipAngle={10}
            arcLabelsTextColor={{
              from: 'color',
              modifiers: [['darker', 2]]
            }}
            colors={['#2563eb', '#dc2626', '#16a34a', '#ca8a04', '#7c3aed', '#ea580c']}
            animate={true}
            motionConfig="gentle"
            tooltip={({ datum }) => (
              <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                <div className="font-semibold" style={{ color: datum.color }}>
                  {datum.label}
                </div>
                <div className="text-sm text-gray-600">
                  ${(datum.value / 1000000).toFixed(1)}M ({((datum.value / data.reduce((sum, d) => sum + d.value, 0)) * 100).toFixed(1)}%)
                </div>
              </div>
            )}
            legends={[
              {
                anchor: 'bottom',
                direction: 'row',
                justify: false,
                translateX: 0,
                translateY: 56,
                itemsSpacing: 0,
                itemWidth: 100,
                itemHeight: 18,
                itemTextColor: '#999',
                itemDirection: 'left-to-right',
                itemOpacity: 1,
                symbolSize: 18,
                symbolShape: 'circle',
                effects: [
                  {
                    on: 'hover',
                    style: {
                      itemTextColor: '#000'
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