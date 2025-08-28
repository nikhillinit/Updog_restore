#!/usr/bin/env node
/**
 * Fix double semicolons in import statements
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  
  // Fix double semicolons
  if (content.includes(';;')) {
    content = content.replace(/;;/g, ';');
    modified = true;
  }
  
  // Remove empty import from 'recharts'
  if (content.includes("import {  } from 'recharts';")) {
    content = content.replace(/import\s*{\s*}\s*from\s*['"]recharts['"];?\n?/g, '');
    modified = true;
  }
  
  if (modified) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✅ Fixed ${filePath}`);
  }
}

console.log('Fixing double semicolons and empty imports...\n');

files.forEach(file => {
  try {
    processFile(file);
  } catch (error) {
    console.error(`Error processing ${file}:`, error.message);
  }
});

console.log('\nDone!');