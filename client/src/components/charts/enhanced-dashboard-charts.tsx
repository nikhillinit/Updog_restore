import { ResponsiveLine } from '@nivo/line';
import { ResponsivePie } from '@nivo/pie';
import { ResponsiveScatterPlot } from '@nivo/scatterplot';
import { ResponsiveHeatMap } from '@nivo/heatmap';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, DollarSign, Target } from "lucide-react";

// Enhanced Performance Chart with Tactyc-style annotations
export function PerformanceChart({ data, title = "Fund Performance Over Time" }: any) {
  const performanceData = [
    {
      id: "TVPI",
      color: "#2563eb",
      data: [
        { x: "Q1 2023", y: 1.2 },
        { x: "Q2 2023", y: 1.5 },
        { x: "Q3 2023", y: 1.8 },
        { x: "Q4 2023", y: 2.3 },
        { x: "Q1 2024", y: 2.8 }
      ]
    },
    {
      id: "DPI",
      color: "#16a34a", 
      data: [
        { x: "Q1 2023", y: 0.1 },
        { x: "Q2 2023", y: 0.3 },
        { x: "Q3 2023", y: 0.5 },
        { x: "Q4 2023", y: 0.7 },
        { x: "Q1 2024", y: 1.1 }
      ]
    },
    {
      id: "Target TVPI",
      color: "#dc2626",
      data: [
        { x: "Q1 2023", y: 1.0 },
        { x: "Q2 2023", y: 1.3 },
        { x: "Q3 2023", y: 1.7 },
        { x: "Q4 2023", y: 2.2 },
        { x: "Q1 2024", y: 2.8 }
      ]
    }
  ];

  return (
    <Card className="col-span-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg font-semibold">{title}</CardTitle>
          <p className="text-sm text-muted-foreground">Quarterly performance tracking vs targets</p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="bg-green-50 text-green-700">
            <TrendingUp className="w-3 h-3 mr-1" />
            On Track
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: '350px' }}>
          <ResponsiveLine
            data={performanceData}
            margin={{ top: 20, right: 120, bottom: 60, left: 60 }}
            xScale={{ type: 'point' }}
            yScale={{ type: 'linear', min: 0, max: 'auto' }}
            axisTop={null}
            axisRight={null}
            axisBottom={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: -45,
              legend: 'Quarter',
              legendOffset: 50,
              legendPosition: 'middle'
            }}
            axisLeft={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: 0,
              legend: 'Multiple (x)',
              legendOffset: -50,
              legendPosition: 'middle',
              format: (value) => `${value}x`
            }}
            pointSize={8}
            pointColor={{ theme: 'background' }}
            pointBorderWidth={2}
            pointBorderColor={{ from: 'serieColor' }}
            useMesh={true}
            enableGridX={false}
            gridYValues={[1, 2, 3, 4, 5]}
            colors={['#2563eb', '#16a34a', '#dc2626']}
            lineWidth={3}
            animate={true}
            motionConfig="gentle"
            legends={[
              {
                anchor: 'bottom-right',
                direction: 'column',
                justify: false,
                translateX: 110,
                translateY: 0,
                itemsSpacing: 0,
                itemDirection: 'left-to-right',
                itemWidth: 80,
                itemHeight: 20,
                symbolSize: 12,
                symbolShape: 'circle'
              }
            ]}
            tooltip={({ point }) => (
              <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                <div className="font-semibold" style={{ color: point.serieColor }}>
                  {point.serieId}
                </div>
                <div className="text-sm text-gray-600">
                  {point.data.xFormatted}: {point.data.yFormatted}x
                </div>
              </div>
            )}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// Enhanced Sector Allocation with investment amounts
export function SectorAllocationChart({ data, title = "Capital Allocation by Sector" }: any) {
  const allocationData = [
    { id: 'fintech', label: 'FinTech', value: 18500000, color: '#2563eb' },
    { id: 'healthcare', label: 'Healthcare', value: 15200000, color: '#16a34a' },
    { id: 'saas', label: 'SaaS', value: 12800000, color: '#dc2626' },
    { id: 'marketplace', label: 'Marketplace', value: 8700000, color: '#ca8a04' },
    { id: 'ai', label: 'AI/ML', value: 6900000, color: '#7c3aed' },
  ];

  const totalValue = allocationData.reduce((sum, d) => sum + d.value, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        <div className="flex items-center space-x-4 text-sm text-muted-foreground">
          <span>Total Deployed: ${(totalValue / 1000000).toFixed(1)}M</span>
          <span>•</span>
          <span>5 Sectors</span>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: '350px' }}>
          <ResponsivePie
            data={allocationData}
            margin={{ top: 40, right: 80, bottom: 80, left: 80 }}
            innerRadius={0.5}
            padAngle={0.7}
            cornerRadius={3}
            activeOuterRadiusOffset={8}
            borderWidth={1}
            borderColor={{ from: 'color', modifiers: [['darker', 0.2]] }}
            arcLinkLabelsSkipAngle={10}
            arcLinkLabelsTextColor="#333333"
            arcLinkLabelsThickness={2}
            arcLinkLabelsColor={{ from: 'color' }}
            arcLabelsSkipAngle={10}
            arcLabelsTextColor={{ from: 'color', modifiers: [['darker', 2]] }}
            animate={true}
            motionConfig="gentle"
            tooltip={({ datum }) => (
              <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                <div className="font-semibold" style={{ color: datum.color }}>
                  {datum.label}
                </div>
                <div className="text-sm text-gray-600">
                  ${(datum.value / 1000000).toFixed(1)}M ({((datum.value / totalValue) * 100).toFixed(1)}%)
                </div>
              </div>
            )}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// Enhanced MOIC vs IRR Scatter with company names
export function MOICAnalysisChart({ data, title = "Portfolio Performance Analysis" }: any) {
  const portfolioData = [
    {
      id: "Active Investments",
      data: [
        { x: 25, y: 3.2, company: "TechCorp", investment: 4500000 },
        { x: 45, y: 5.8, company: "FinanceAI", investment: 3200000 },
        { x: 18, y: 2.1, company: "HealthTech", investment: 2800000 },
        { x: 65, y: 8.3, company: "DataFlow", investment: 1500000 },
        { x: 12, y: 1.4, company: "MarketPlace", investment: 3800000 }
      ]
    }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">IRR vs MOIC performance with investment size indicators</p>
      </CardHeader>
      <CardContent>
        <div style={{ height: '350px' }}>
          <ResponsiveScatterPlot
            data={portfolioData}
            margin={{ top: 20, right: 140, bottom: 70, left: 90 }}
            xScale={{ type: 'linear', min: 0, max: 80 }}
            yScale={{ type: 'linear', min: 0, max: 10 }}
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
            colors={['#2563eb']}
            nodeSize={{
              key: 'investment',
              values: [1000000, 5000000],
              sizes: [8, 24]
            }}
            animate={true}
            motionConfig="gentle"
            tooltip={({ node }) => (
              <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                <div className="font-semibold text-blue-600">
                  {node.data.company}
                </div>
                <div className="text-sm text-gray-600 space-y-1">
                  <div>IRR: {node.data.x}%</div>
                  <div>MOIC: {node.data.y}x</div>
                  <div>Investment: ${(node.data.investment / 1000000).toFixed(1)}M</div>
                </div>
              </div>
            )}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// Enhanced Capital Deployment Heatmap
export function CapitalDeploymentHeatmap({ data, title = "Capital Deployment by Stage & Quarter" }: any) {
  const heatmapData = [
    { stage: 'Pre-Seed', 'Q1 2023': 2.1, 'Q2 2023': 3.2, 'Q3 2023': 1.8, 'Q4 2023': 2.5, 'Q1 2024': 1.9 },
    { stage: 'Seed', 'Q1 2023': 4.5, 'Q2 2023': 6.1, 'Q3 2023': 5.2, 'Q4 2023': 4.8, 'Q1 2024': 5.5 },
    { stage: 'Series A', 'Q1 2023': 8.2, 'Q2 2023': 12.1, 'Q3 2023': 9.5, 'Q4 2023': 11.2, 'Q1 2024': 8.8 },
    { stage: 'Follow-on', 'Q1 2023': 1.2, 'Q2 2023': 2.8, 'Q3 2023': 3.1, 'Q4 2023': 4.2, 'Q1 2024': 3.6 }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">Investment activity heatmap ($M)</p>
      </CardHeader>
      <CardContent>
        <div style={{ height: '300px' }}>
          <ResponsiveHeatMap
            data={heatmapData}
            keys={['Q1 2023', 'Q2 2023', 'Q3 2023', 'Q4 2023', 'Q1 2024']}
            indexBy="stage"
            margin={{ top: 20, right: 20, bottom: 60, left: 80 }}
            colors={{
              type: 'diverging',
              scheme: 'blues',
              divergeAt: 0.5,
              minValue: 0,
              maxValue: 15
            }}
            emptyColor="#ffffff"
            borderColor={{ from: 'color', modifiers: [['darker', 0.4]] }}
            borderWidth={1}
            animate={true}
            motionConfig="gentle"
            hoverTarget="cell"
            cellHoverOthersOpacity={0.25}
            tooltip={({ cell }) => (
              <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                <div className="font-semibold">
                  {cell.serieId} - {cell.data.x}
                </div>
                <div className="text-sm text-gray-600">
                  ${cell.formattedValue}M invested
                </div>
              </div>
            )}
          />
        </div>
      </CardContent>
    </Card>
  );
}