import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Files to update (excluding eslint-errors.json and the lazy component itself)
const filesToUpdate = [
  'client/src/components/charts/portfolio-cost-value-chart.tsx',
  'client/src/components/charts/investment-breakdown-chart.tsx',
  'client/src/components/charts/nivo-allocation-pie.tsx',
  'client/src/components/charts/enhanced-performance-chart.tsx',
  'client/src/components/charts/fund-expense-charts.tsx',
  'client/src/components/planning/portfolio-construction.tsx',
  'client/src/components/planning/graduation-rate-strategy.tsx',
  'client/src/pages/return-the-fund.tsx',
  'client/src/components/ui/recharts-bundle.tsx',
  'client/src/components/sensitivity/sensitivity-analysis.tsx',
  'client/src/components/reserves/graduation-reserves-demo.tsx',
  'client/src/components/portfolio/tag-performance-analysis.tsx',
  'client/src/components/portfolio/portfolio-analytics-dashboard.tsx',
  'client/src/components/performance/irr-summary.tsx',
  'client/src/components/forecasting/construction-actual-comparison.tsx',
  'client/src/components/dashboard/portfolio-concentration.tsx',
  'client/src/components/dashboard/dual-forecast-dashboard.tsx',
  'client/src/components/charts/performance-optimizer.tsx',
  'client/src/components/portfolio/moic-analysis.tsx',
  'client/src/components/charts/pacing-timeline-chart.tsx',
  'client/src/components/dashboard/tactyc-dashboard.tsx',
  'client/src/components/forecasting/investable-capital-summary.tsx',
  'client/src/components/forecasting/projected-performance.tsx',
  'client/src/components/portfolio/benchmarking-dashboard.tsx',
  'client/src/components/forecasting/portfolio-insights.tsx',
  'client/src/components/planning/exit-analysis.tsx',
  'client/src/components/investments/portfolio-company-detail.tsx',
  'client/src/components/dashboard/fund-overview.tsx',
  'client/src/components/charts/portfolio-performance-chart.tsx'
];

const oldImportPattern = /import\s*{\s*ResponsiveContainer\s*}\s*from\s*['"]recharts['"]/g;
const oldImportPattern2 = /import\s*{\s*ResponsiveContainer\s*}\s*from\s*['"]recharts\/es6\/component\/ResponsiveContainer['"]/g;
const newImport = "import { LazyResponsiveContainer as ResponsiveContainer } from '@/components/charts/LazyResponsiveContainer'";

let updatedCount = 0;

filesToUpdate.forEach(file => {
  const fullPath = path.join(path.dirname(__dirname), file);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`File not found: ${file}`);
    return;
  }
  
  let content = fs.readFileSync(fullPath, 'utf8');
  let originalContent = content;
  
  // Replace both import patterns
  content = content.replace(oldImportPattern, newImport);
  content = content.replace(oldImportPattern2, newImport);
  
  if (content !== originalContent) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✅ Updated: ${file}`);
    updatedCount++;
  } else {
    console.log(`⏭️ No changes needed: ${file}`);
  }
});

console.log(`\n✨ Updated ${updatedCount} files`);