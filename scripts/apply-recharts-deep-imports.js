#!/usr/bin/env node
/**
 * Apply Recharts deep imports across all files
 * Converts barrel imports to specific component imports to reduce bundle size
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Map of Recharts components to their specific import paths
const RECHARTS_MAPPING = {
  // Core containers
  'ResponsiveContainer': 'recharts/lib/component/ResponsiveContainer',
  
  // Chart types
  'AreaChart': 'recharts/lib/chart/AreaChart',
  'BarChart': 'recharts/lib/chart/BarChart',
  'LineChart': 'recharts/lib/chart/LineChart',
  'PieChart': 'recharts/lib/chart/PieChart',
  'RadarChart': 'recharts/lib/chart/RadarChart',
  'RadialBarChart': 'recharts/lib/chart/RadialBarChart',
  'ScatterChart': 'recharts/lib/chart/ScatterChart',
  'ComposedChart': 'recharts/lib/chart/ComposedChart',
  'Treemap': 'recharts/lib/chart/Treemap',
  
  // Chart components
  'Area': 'recharts/lib/cartesian/Area',
  'Bar': 'recharts/lib/cartesian/Bar',
  'Line': 'recharts/lib/cartesian/Line',
  'Scatter': 'recharts/lib/cartesian/Scatter',
  'XAxis': 'recharts/lib/cartesian/XAxis',
  'YAxis': 'recharts/lib/cartesian/YAxis',
  'ZAxis': 'recharts/lib/cartesian/ZAxis',
  'Brush': 'recharts/lib/cartesian/Brush',
  'CartesianGrid': 'recharts/lib/cartesian/CartesianGrid',
  'ReferenceLine': 'recharts/lib/cartesian/ReferenceLine',
  'ReferenceDot': 'recharts/lib/cartesian/ReferenceDot',
  'ReferenceArea': 'recharts/lib/cartesian/ReferenceArea',
  'ErrorBar': 'recharts/lib/cartesian/ErrorBar',
  
  // Polar components
  'Pie': 'recharts/lib/polar/Pie',
  'Radar': 'recharts/lib/polar/Radar',
  'RadialBar': 'recharts/lib/polar/RadialBar',
  'PolarGrid': 'recharts/lib/polar/PolarGrid',
  'PolarAngleAxis': 'recharts/lib/polar/PolarAngleAxis',
  'PolarRadiusAxis': 'recharts/lib/polar/PolarRadiusAxis',
  
  // Common components
  'Tooltip': 'recharts/lib/component/Tooltip',
  'Legend': 'recharts/lib/component/Legend',
  'Cell': 'recharts/lib/component/Cell',
  'LabelList': 'recharts/lib/component/LabelList',
  'Label': 'recharts/lib/component/Label',
  'Text': 'recharts/lib/component/Text',
  'Customized': 'recharts/lib/component/Customized',
  
  // Shape components
  'Rectangle': 'recharts/lib/shape/Rectangle',
  'Sector': 'recharts/lib/shape/Sector',
  'Curve': 'recharts/lib/shape/Curve',
  'Dot': 'recharts/lib/shape/Dot',
  'Polygon': 'recharts/lib/shape/Polygon',
  'Cross': 'recharts/lib/shape/Cross'
};

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

function processFile(filePath) {
  const fullPath = path.join(process.cwd(), filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.warn(`File not found: ${fullPath}`);
    return;
  }
  
  let content = fs.readFileSync(fullPath, 'utf8');
  let modified = false;
  const usedComponents = new Set();
  
  // Find all recharts imports
  const importRegex = /import\s*(?:{([^}]+)}|\*\s+as\s+(\w+))\s*from\s*['"]recharts['"]/g;
  let match;
  
  while ((match = importRegex.exec(content)) !== null) {
    if (match[1]) {
      // Named imports: import { Component1, Component2 } from 'recharts'
      const components = match[1].split(',').map(c => c.trim());
      components.forEach(comp => {
        // Handle aliased imports like "Component as Alias"
        const [originalName] = comp.split(/\s+as\s+/);
        usedComponents.add(originalName.trim());
      });
    }
  }
  
  if (usedComponents.size === 0) {
    console.log(`No recharts imports found in ${filePath}`);
    return;
  }
  
  // Generate new import statements
  const newImports = [];
  const unknownComponents = [];
  
  for (const component of usedComponents) {
    if (RECHARTS_MAPPING[component]) {
      newImports.push(`import { ${component} } from '${RECHARTS_MAPPING[component]}';`);
    } else {
      unknownComponents.push(component);
    }
  }
  
  if (unknownComponents.length > 0) {
    console.warn(`Unknown recharts components in ${filePath}: ${unknownComponents.join(', ')}`);
    // Keep unknown components as barrel imports for safety
    newImports.push(`import { ${unknownComponents.join(', ')} } from 'recharts';`);
  }
  
  // Replace the old import with new imports
  content = content.replace(importRegex, () => {
    modified = true;
    return newImports.join('\n');
  });
  
  if (modified) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✅ Updated ${filePath} with deep imports`);
  }
}

console.log('Applying Recharts deep imports...\n');

files.forEach(file => {
  try {
    processFile(file);
  } catch (error) {
    console.error(`Error processing ${file}:`, error.message);
  }
});

console.log('\nDone! Remember to test your application to ensure everything still works.');