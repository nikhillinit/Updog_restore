#!/usr/bin/env node
/**
 * Fix Recharts deep imports to use proper ES module paths
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Updated mapping for ES modules
const RECHARTS_MAPPING = {
  // Core containers
  'ResponsiveContainer': 'recharts/es6/component/ResponsiveContainer',
  
  // Chart types
  'AreaChart': 'recharts/es6/chart/AreaChart',
  'BarChart': 'recharts/es6/chart/BarChart',
  'LineChart': 'recharts/es6/chart/LineChart',
  'PieChart': 'recharts/es6/chart/PieChart',
  'RadarChart': 'recharts/es6/chart/RadarChart',
  'RadialBarChart': 'recharts/es6/chart/RadialBarChart',
  'ScatterChart': 'recharts/es6/chart/ScatterChart',
  'ComposedChart': 'recharts/es6/chart/ComposedChart',
  'Treemap': 'recharts/es6/chart/Treemap',
  
  // Chart components
  'Area': 'recharts/es6/cartesian/Area',
  'Bar': 'recharts/es6/cartesian/Bar',
  'Line': 'recharts/es6/cartesian/Line',
  'Scatter': 'recharts/es6/cartesian/Scatter',
  'XAxis': 'recharts/es6/cartesian/XAxis',
  'YAxis': 'recharts/es6/cartesian/YAxis',
  'ZAxis': 'recharts/es6/cartesian/ZAxis',
  'Brush': 'recharts/es6/cartesian/Brush',
  'CartesianGrid': 'recharts/es6/cartesian/CartesianGrid',
  'ReferenceLine': 'recharts/es6/cartesian/ReferenceLine',
  'ReferenceDot': 'recharts/es6/cartesian/ReferenceDot',
  'ReferenceArea': 'recharts/es6/cartesian/ReferenceArea',
  'ErrorBar': 'recharts/es6/cartesian/ErrorBar',
  
  // Polar components
  'Pie': 'recharts/es6/polar/Pie',
  'Radar': 'recharts/es6/polar/Radar',
  'RadialBar': 'recharts/es6/polar/RadialBar',
  'PolarGrid': 'recharts/es6/polar/PolarGrid',
  'PolarAngleAxis': 'recharts/es6/polar/PolarAngleAxis',
  'PolarRadiusAxis': 'recharts/es6/polar/PolarRadiusAxis',
  
  // Common components
  'Tooltip': 'recharts/es6/component/Tooltip',
  'Legend': 'recharts/es6/component/Legend',
  'Cell': 'recharts/es6/component/Cell',
  'LabelList': 'recharts/es6/component/LabelList',
  'Label': 'recharts/es6/component/Label',
  'Text': 'recharts/es6/component/Text',
  'Customized': 'recharts/es6/component/Customized',
  
  // Shape components
  'Rectangle': 'recharts/es6/shape/Rectangle',
  'Sector': 'recharts/es6/shape/Sector',
  'Curve': 'recharts/es6/shape/Curve',
  'Dot': 'recharts/es6/shape/Dot',
  'Polygon': 'recharts/es6/shape/Polygon',
  'Cross': 'recharts/es6/shape/Cross'
};

function processFile(filePath) {
  const fullPath = path.join(process.cwd(), filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.warn(`File not found: ${fullPath}`);
    return;
  }
  
  let content = fs.readFileSync(fullPath, 'utf8');
  let modified = false;
  
  // Fix lib imports to es6
  content = content.replace(/from 'recharts\/lib\//g, "from 'recharts/es6/");
  
  // Check if replacements were made
  if (content.includes("from 'recharts/es6/")) {
    modified = true;
  }
  
  if (modified) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✅ Fixed ${filePath}`);
  }
}

const files = [
  'client/src/components/ui/chart.tsx',
  'client/src/pages/return-the-fund.tsx',
  'client/src/pages/dashboard-modern.tsx',
  'client/src/components/sensitivity/sensitivity-analysis.tsx',
  'client/src/components/reserves/graduation-reserves-demo.tsx',
  'client/src/components/portfolio/tag-performance-analysis.tsx',
  'client/src/components/portfolio/portfolio-analytics-dashboard.tsx',
  'client/src/components/portfolio/moic-analysis.tsx',
  'client/src/components/portfolio/benchmarking-dashboard.tsx',
  'client/src/components/planning/portfolio-construction.tsx',
  'client/src/components/planning/graduation-rate-strategy.tsx',
  'client/src/components/performance/irr-summary.tsx',
  'client/src/components/planning/exit-analysis.tsx',
  'client/src/components/investments/portfolio-company-detail.tsx',
  'client/src/components/forecasting/projected-performance.tsx',
  'client/src/components/forecasting/portfolio-insights.tsx',
  'client/src/components/forecasting/investable-capital-summary.tsx',
  'client/src/components/forecasting/construction-actual-comparison.tsx',
  'client/src/components/dashboard/tactyc-dashboard.tsx',
  'client/src/components/dashboard/portfolio-concentration.tsx',
  'client/src/components/dashboard/dual-forecast-dashboard.tsx',
  'client/src/components/dashboard/fund-overview.tsx',
  'client/src/components/charts/pacing-timeline-chart.tsx',
  'client/src/components/charts/performance-optimizer.tsx',
  'client/src/components/charts/portfolio-cost-value-chart.tsx',
  'client/src/components/charts/portfolio-performance-chart.tsx',
  'client/src/components/charts/investment-breakdown-chart.tsx',
  'client/src/components/charts/fund-expense-charts.tsx',
  'client/src/components/charts/enhanced-performance-chart.tsx'
];

console.log('Fixing Recharts imports to use ES6 modules...\n');

files.forEach(file => {
  try {
    processFile(file);
  } catch (error) {
    console.error(`Error processing ${file}:`, error.message);
  }
});

console.log('\nDone!');