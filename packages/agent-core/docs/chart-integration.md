# Chart Integration Guide

How to use BacktestReporter chart data with popular visualization libraries.

## Chart Data Formats

The BacktestReporter provides standardized chart data that can be easily integrated with:
- Recharts (React)
- Chart.js (vanilla JS/React)
- Nivo (React)
- D3.js (custom)
- Plotly (interactive)

## Recharts Integration (React)

### Success Rate Bar Chart

```typescript
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { BacktestReport } from '@agent-core';

interface Props {
  report: BacktestReport;
}

export function SuccessRateChart({ report }: Props) {
  const data = report.charts.successRateByPattern.data;

  return (
    <BarChart width={600} height={400} data={data}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="label" />
      <YAxis domain={[0, 100]} />
      <Tooltip />
      <Legend />
      <Bar dataKey="value" fill="#10b981" name="Success Rate %" />
    </BarChart>
  );
}
```

### Cost Savings Line Chart

```typescript
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

export function CostSavingsChart({ report }: Props) {
  const data = report.charts.costSavingsOverTime.series[0].data;

  return (
    <LineChart width={800} height={400} data={data}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="x" />
      <YAxis />
      <Tooltip />
      <Legend />
      <Line
        type="monotone"
        dataKey="y"
        stroke="#3b82f6"
        name="Cumulative Savings ($)"
        strokeWidth={2}
      />
    </LineChart>
  );
}
```

### Quality Distribution Histogram

```typescript
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

export function QualityDistributionChart({ report }: Props) {
  const data = report.charts.qualityDistribution.bins;

  return (
    <BarChart width={600} height={400} data={data}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="range" />
      <YAxis />
      <Tooltip />
      <Bar dataKey="count" fill="#8b5cf6" name="Cases" />
    </BarChart>
  );
}
```

### Pattern Usage Pie Chart

```typescript
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

export function PatternUsageChart({ report }: Props) {
  const data = report.charts.patternUsage.data;

  return (
    <PieChart width={500} height={400}>
      <Pie
        data={data}
        dataKey="value"
        nameKey="label"
        cx="50%"
        cy="50%"
        outerRadius={120}
        label={(entry) => `${entry.label}: ${entry.percentage.toFixed(1)}%`}
      >
        {data.map((_, index) => (
          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
        ))}
      </Pie>
      <Tooltip />
      <Legend />
    </PieChart>
  );
}
```

## Nivo Integration (React)

### Responsive Bar Chart

```typescript
import { ResponsiveBar } from '@nivo/bar';

export function NivoSuccessRateChart({ report }: Props) {
  const data = report.charts.successRateByPattern.data.map(d => ({
    pattern: d.label,
    'Success Rate': d.value
  }));

  return (
    <div style={{ height: 400 }}>
      <ResponsiveBar
        data={data}
        keys={['Success Rate']}
        indexBy="pattern"
        margin={{ top: 50, right: 130, bottom: 50, left: 60 }}
        padding={0.3}
        valueScale={{ type: 'linear' }}
        colors={{ scheme: 'nivo' }}
        axisBottom={{
          tickSize: 5,
          tickPadding: 5,
          tickRotation: 0,
          legend: 'Pattern',
          legendPosition: 'middle',
          legendOffset: 32
        }}
        axisLeft={{
          tickSize: 5,
          tickPadding: 5,
          tickRotation: 0,
          legend: 'Success Rate (%)',
          legendPosition: 'middle',
          legendOffset: -40
        }}
        labelSkipWidth={12}
        labelSkipHeight={12}
        animate={true}
      />
    </div>
  );
}
```

### Line Chart

```typescript
import { ResponsiveLine } from '@nivo/line';

export function NivoCostSavingsChart({ report }: Props) {
  const rawData = report.charts.costSavingsOverTime.series[0].data;

  const data = [{
    id: 'Savings',
    data: rawData.map(d => ({ x: d.x, y: d.y }))
  }];

  return (
    <div style={{ height: 400 }}>
      <ResponsiveLine
        data={data}
        margin={{ top: 50, right: 110, bottom: 50, left: 60 }}
        xScale={{ type: 'point' }}
        yScale={{ type: 'linear', min: 'auto', max: 'auto' }}
        axisBottom={{
          tickSize: 5,
          tickPadding: 5,
          tickRotation: -45,
          legend: 'Week',
          legendOffset: 45,
          legendPosition: 'middle'
        }}
        axisLeft={{
          tickSize: 5,
          tickPadding: 5,
          tickRotation: 0,
          legend: 'Cumulative Savings ($)',
          legendOffset: -50,
          legendPosition: 'middle'
        }}
        pointSize={8}
        pointColor={{ theme: 'background' }}
        pointBorderWidth={2}
        pointBorderColor={{ from: 'serieColor' }}
        enableArea={true}
        areaOpacity={0.1}
        useMesh={true}
      />
    </div>
  );
}
```

## Chart.js Integration

### Bar Chart

```typescript
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export function ChartJsSuccessRate({ report }: Props) {
  const chartData = report.charts.successRateByPattern;

  const data = {
    labels: chartData.data.map(d => d.label),
    datasets: [{
      label: 'Success Rate (%)',
      data: chartData.data.map(d => d.value),
      backgroundColor: 'rgba(16, 185, 129, 0.5)',
      borderColor: 'rgba(16, 185, 129, 1)',
      borderWidth: 1
    }]
  };

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: chartData.title
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100
      }
    }
  };

  return <Bar data={data} options={options} />;
}
```

### Line Chart

```typescript
import { Line } from 'react-chartjs-2';

export function ChartJsCostSavings({ report }: Props) {
  const seriesData = report.charts.costSavingsOverTime.series[0].data;

  const data = {
    labels: seriesData.map(d => d.x),
    datasets: [{
      label: 'Cumulative Savings ($)',
      data: seriesData.map(d => d.y),
      borderColor: 'rgb(59, 130, 246)',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      fill: true,
      tension: 0.4
    }]
  };

  const options = {
    responsive: true,
    plugins: {
      title: {
        display: true,
        text: 'Cumulative Cost Savings Over Time'
      }
    },
    scales: {
      y: {
        beginAtZero: true
      }
    }
  };

  return <Line data={data} options={options} />;
}
```

## D3.js Custom Visualization

### Speedup Comparison Chart

```typescript
import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

export function D3SpeedupChart({ report }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const data = report.charts.speedupComparison.data;
    const margin = { top: 20, right: 30, bottom: 40, left: 60 };
    const width = 600 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    // Clear previous chart
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const x = d3.scaleBand()
      .domain(data.map(d => d.label))
      .range([0, width])
      .padding(0.2);

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.value) || 10])
      .nice()
      .range([height, 0]);

    // Axes
    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end');

    svg.append('g')
      .call(d3.axisLeft(y));

    // Bars
    svg.selectAll('.bar')
      .data(data)
      .enter().append('rect')
      .attr('class', 'bar')
      .attr('x', d => x(d.label) || 0)
      .attr('y', d => y(d.value))
      .attr('width', x.bandwidth())
      .attr('height', d => height - y(d.value))
      .attr('fill', '#f59e0b');

    // Labels
    svg.selectAll('.label')
      .data(data)
      .enter().append('text')
      .attr('class', 'label')
      .attr('x', d => (x(d.label) || 0) + x.bandwidth() / 2)
      .attr('y', d => y(d.value) - 5)
      .attr('text-anchor', 'middle')
      .text(d => `${d.value.toFixed(1)}x`);

  }, [report]);

  return <svg ref={svgRef}></svg>;
}
```

## Complete Dashboard Example

```typescript
import { BacktestReport } from '@agent-core';

interface DashboardProps {
  report: BacktestReport;
}

export function BacktestDashboard({ report }: DashboardProps) {
  return (
    <div className="p-6 space-y-8">
      {/* Executive Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Success Rate"
          value={`${report.summary.successRate.toFixed(1)}%`}
          trend={report.summary.successRate >= 80 ? 'up' : 'down'}
        />
        <MetricCard
          title="Cost Savings"
          value={`$${report.summary.totalCostSavingsUSD.toFixed(2)}`}
          trend="up"
        />
        <MetricCard
          title="ROI"
          value={`${report.summary.annualizedROI.toFixed(0)}%`}
          trend={report.summary.annualizedROI > 100 ? 'up' : 'neutral'}
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Success Rate by Pattern</h3>
          <SuccessRateChart report={report} />
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Cost Savings Over Time</h3>
          <CostSavingsChart report={report} />
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Quality Distribution</h3>
          <QualityDistributionChart report={report} />
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Pattern Usage</h3>
          <PatternUsageChart report={report} />
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Recommendations</h3>
        <ul className="space-y-2">
          {report.recommendations.map((rec, i) => (
            <li key={i} className="flex items-start">
              <span className="font-bold mr-2">{i + 1}.</span>
              <span>{rec}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Recent Cases Table */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Recent Cases</h3>
        <CaseDetailsTable cases={report.caseDetails.slice(0, 10)} />
      </div>
    </div>
  );
}

function MetricCard({ title, value, trend }: {
  title: string;
  value: string;
  trend: 'up' | 'down' | 'neutral';
}) {
  const trendColors = {
    up: 'text-green-600',
    down: 'text-red-600',
    neutral: 'text-gray-600'
  };

  const trendIcons = {
    up: '↑',
    down: '↓',
    neutral: '→'
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h4 className="text-sm text-gray-600 mb-2">{title}</h4>
      <div className="flex items-baseline">
        <p className="text-3xl font-bold">{value}</p>
        <span className={`ml-2 ${trendColors[trend]}`}>
          {trendIcons[trend]}
        </span>
      </div>
    </div>
  );
}
```

## Export to Excel/CSV

```typescript
import { BacktestReport } from '@agent-core';

export function exportToCSV(report: BacktestReport): string {
  const headers = [
    'ID',
    'Timestamp',
    'Task Type',
    'Pattern',
    'Success',
    'Quality Score',
    'Human Time (min)',
    'Agent Time (min)',
    'Speedup',
    'Human Cost',
    'Agent Cost',
    'Savings'
  ].join(',');

  const rows = report.caseDetails.map(c => {
    const speedup = c.success
      ? (c.humanTimeMinutes / Math.max(c.agentTimeMinutes, 0.1)).toFixed(2)
      : 'N/A';
    const savings = c.success
      ? (c.humanCostUSD - c.agentCostUSD).toFixed(2)
      : '0.00';

    return [
      c.id,
      c.timestamp,
      c.taskType,
      c.agentPattern,
      c.success ? 'Yes' : 'No',
      c.qualityScore,
      c.humanTimeMinutes,
      c.agentTimeMinutes,
      speedup,
      c.humanCostUSD.toFixed(2),
      c.agentCostUSD.toFixed(2),
      savings
    ].join(',');
  });

  return [headers, ...rows].join('\n');
}

// Download CSV
export function downloadCSV(report: BacktestReport, filename = 'backtest-report.csv') {
  const csv = exportToCSV(report);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}
```

## Plotly Integration (Interactive Charts)

```typescript
import Plot from 'react-plotly.js';

export function PlotlySuccessRate({ report }: Props) {
  const chartData = report.charts.successRateByPattern;

  const data = [{
    x: chartData.data.map(d => d.label),
    y: chartData.data.map(d => d.value),
    type: 'bar' as const,
    marker: { color: '#10b981' }
  }];

  const layout = {
    title: chartData.title,
    xaxis: { title: chartData.xAxis },
    yaxis: { title: chartData.yAxis, range: [0, 100] },
    hovermode: 'closest' as const
  };

  return <Plot data={data} layout={layout} />;
}
```

## Best Practices

### Performance
- Use React.memo for chart components
- Debounce data updates
- Lazy load chart libraries
- Consider virtualization for large datasets

### Accessibility
- Add ARIA labels to charts
- Provide text alternatives
- Ensure sufficient color contrast
- Support keyboard navigation

### Responsive Design
- Use responsive chart libraries (Recharts, Nivo)
- Set container dimensions appropriately
- Test on mobile devices
- Consider chart complexity on small screens

### Data Updates
```typescript
// Real-time updates
import { useQuery } from '@tanstack/react-query';

function useLiveBacktestReport() {
  return useQuery({
    queryKey: ['backtest-report'],
    queryFn: async () => {
      const cases = await fetchLatestCases();
      const reporter = new BacktestReporter();
      return reporter.generateReport(cases, DEV_HOURS);
    },
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000
  });
}
```

## Theming

```typescript
// Tailwind CSS theme
const chartColors = {
  primary: '#3b82f6',    // blue
  success: '#10b981',    // green
  warning: '#f59e0b',    // amber
  danger: '#ef4444',     // red
  purple: '#8b5cf6'
};

// Chart.js theme
Chart.defaults.color = '#374151'; // gray-700
Chart.defaults.borderColor = '#e5e7eb'; // gray-200
Chart.defaults.font.family = 'Inter, sans-serif';
```
