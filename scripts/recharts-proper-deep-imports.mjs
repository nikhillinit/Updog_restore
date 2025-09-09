#!/usr/bin/env node
/**
 * Apply proper Recharts deep imports using es6 paths
 * This reduces bundle size by only importing what we use
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Comprehensive mapping for Recharts components
const RECHARTS_MAPPING = {
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
  'Funnel': 'recharts/es6/chart/Funnel',
  'Sankey': 'recharts/es6/chart/Sankey',
  
  // Cartesian components
  'Area': 'recharts/es6/cartesian/Area',
  'Bar': 'recharts/es6/cartesian/Bar',
  'Line': 'recharts/es6/cartesian/Line',
  'Scatter': 'recharts/es6/cartesian/Scatter',
  'XAxis': 'recharts/es6/cartesian/XAxis',
  'YAxis': 'recharts/es6/cartesian/YAxis',
  'ZAxis': 'recharts/es6/cartesian/ZAxis',
  'Brush': 'recharts/es6/cartesian/Brush',
  'CartesianAxis': 'recharts/es6/cartesian/CartesianAxis',
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
  
  // Components
  'ResponsiveContainer': 'recharts/es6/component/ResponsiveContainer',
  'Tooltip': 'recharts/es6/component/Tooltip',
  'Legend': 'recharts/es6/component/Legend',
  'Cell': 'recharts/es6/component/Cell',
  'LabelList': 'recharts/es6/component/LabelList',
  'Label': 'recharts/es6/component/Label',
  'Text': 'recharts/es6/component/Text',
  'Customized': 'recharts/es6/component/Customized',
  
  // Shapes
  'Rectangle': 'recharts/es6/shape/Rectangle',
  'Sector': 'recharts/es6/shape/Sector',
  'Curve': 'recharts/es6/shape/Curve',
  'Dot': 'recharts/es6/shape/Dot',
  'Polygon': 'recharts/es6/shape/Polygon',
  'Cross': 'recharts/es6/shape/Cross',
};

async function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  let newContent = content;
  
  // Find all recharts imports (both es6 and regular)
  const importRegex = /import\s*{\s*([^}]+)\s*}\s*from\s*['"]recharts(?:\/es6\/[^'"]*)?['"]/g;
  
  const imports = [];
  let match;
  
  // Collect all imports
  while ((match = importRegex.exec(content)) !== null) {
    const components = match[1].split(',').map(c => c.trim());
    components.forEach(comp => {
      const [name] = comp.split(/\s+as\s+/);
      if (!imports.includes(name.trim())) {
        imports.push(name.trim());
      }
    });
  }
  
  if (imports.length === 0) {
    return false;
  }
  
  // Build new import statements
  const newImports = [];
  const unknownComponents = [];
  
  for (const component of imports) {
    if (RECHARTS_MAPPING[component]) {
      newImports.push(`import { ${component} } from '${RECHARTS_MAPPING[component]}';`);
    } else {
      unknownComponents.push(component);
    }
  }
  
  if (unknownComponents.length > 0) {
    console.warn(`  ⚠️  Unknown components in ${path.basename(filePath)}: ${unknownComponents.join(', ')}`);
    // Keep unknown components as barrel imports
    newImports.push(`import { ${unknownComponents.join(', ')} } from 'recharts';`);
  }
  
  // Replace all recharts imports with new ones
  const allImports = newImports.join('\n');
  
  // Remove all existing recharts imports
  newContent = newContent.replace(/import\s*{\s*[^}]+\s*}\s*from\s*['"]recharts(?:\/es6\/[^'"]*)?['"];?\n?/g, '');
  
  // Add new imports at the first import position
  const firstImportMatch = newContent.match(/^import\s+/m);
  if (firstImportMatch) {
    const insertPos = newContent.indexOf(firstImportMatch[0]);
    newContent = newContent.slice(0, insertPos) + allImports + '\n' + newContent.slice(insertPos);
    modified = true;
  }
  
  if (modified) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`✅ Updated ${path.relative(process.cwd(), filePath)}`);
    return true;
  }
  
  return false;
}

async function main() {
  console.log('🚀 Applying proper Recharts deep imports...\n');
  
  // Use forward slashes for glob pattern
  const pattern = 'client/src/**/*.{ts,tsx}';
  const files = await glob(pattern, { 
    ignore: '**/node_modules/**',
    windowsPathsNoEscape: true 
  });
  
  console.log(`Found ${files.length} TypeScript files to process\n`);
  
  let updatedCount = 0;
  
  for (const file of files) {
    if (await processFile(file)) {
      updatedCount++;
    }
  }
  
  console.log(`\n✨ Done! Updated ${updatedCount} files with deep imports`);
  console.log('\n📦 Now rebuild to see the bundle size reduction:');
  console.log('   npm run build:web');
}

main().catch(console.error);