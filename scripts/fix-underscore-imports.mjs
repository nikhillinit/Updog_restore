#!/usr/bin/env node

/**
 * Fix underscore imports that were incorrectly prefixed by ESLint cleanup
 * These imports are actually being used, so we need to remove the underscore
 */

import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

// Files to process
const FILE_PATTERNS = [
  'client/src/**/*.{ts,tsx}',
  'server/**/*.{ts,tsx}',
  'shared/**/*.{ts,tsx}',
];

// Common UI components that are actually used
const UI_COMPONENTS = [
  'Button', 'Input', 'Label', 'Select', 'SelectContent', 'SelectItem', 
  'SelectTrigger', 'SelectValue', 'Badge', 'Card', 'CardHeader', 'CardTitle',
  'CardDescription', 'Dialog', 'DialogContent', 'DialogDescription', 
  'DialogHeader', 'DialogTitle', 'DialogTrigger', 'Tabs', 'TabsContent',
  'TabsList', 'TabsTrigger', 'Separator', 'Slider', 'Switch', 'Progress',
];

// React/Lucide components that are used
const REACT_COMPONENTS = [
  'useState', 'useEffect', 'useQuery',
];

const LUCIDE_ICONS = [
  'Calculator', 'DollarSign', 'Edit', 'Trash2', 'TrendingUp', 'Target',
  'Calendar', 'Users', 'ArrowUpRight', 'ArrowDownRight', 'Info', 'Edit2',
  'Percent', 'AlertCircle', 'Building2', 'Circle', 'BarChart3', 'TrendingDown',
  'InfoIcon',
];

// Recharts components
const RECHARTS_COMPONENTS = [
  'LineChart', 'PieChart', 'BarChart', 'Line', 'Pie', 'Bar', 'Cell',
  'XAxis', 'YAxis', 'CartesianGrid', 'Tooltip', 'ResponsiveContainer',
  'Legend',
];

async function main() {
  console.log('🔧 Fixing underscore imports...');
  if (DRY_RUN) console.log('🏃 DRY RUN MODE - No files will be modified');
  
  // Get all TypeScript files
  const allFiles = [];
  
  for (const pattern of FILE_PATTERNS) {
    const files = await glob(pattern, { 
      ignore: ['**/node_modules/**', '**/dist/**', '**/*.d.ts'],
      cwd: process.cwd()
    });
    allFiles.push(...files);
  }
  
  console.log(`Found ${allFiles.length} files to process`);
  
  let fixedFiles = 0;
  let totalFixes = 0;
  
  for (const file of allFiles) {
    try {
      const content = await fs.readFile(file, 'utf8');
      let newContent = content;
      let fileFixes = 0;
      
      // Fix UI component imports
      for (const component of UI_COMPONENTS) {
        const underscorePattern = new RegExp(`_${component}`, 'g');
        const matches = content.match(underscorePattern);
        if (matches) {
          newContent = newContent.replace(underscorePattern, component);
          fileFixes += matches.length;
        }
      }
      
      // Fix React imports
      for (const component of REACT_COMPONENTS) {
        const underscorePattern = new RegExp(`_${component}`, 'g');
        const matches = content.match(underscorePattern);
        if (matches) {
          newContent = newContent.replace(underscorePattern, component);
          fileFixes += matches.length;
        }
      }
      
      // Fix Lucide imports
      for (const icon of LUCIDE_ICONS) {
        const underscorePattern = new RegExp(`_${icon}`, 'g');
        const matches = content.match(underscorePattern);
        if (matches) {
          newContent = newContent.replace(underscorePattern, icon);
          fileFixes += matches.length;
        }
      }
      
      // Fix Recharts imports
      for (const component of RECHARTS_COMPONENTS) {
        const underscorePattern = new RegExp(`_${component}`, 'g');
        const matches = content.match(underscorePattern);
        if (matches) {
          newContent = newContent.replace(underscorePattern, component);
          fileFixes += matches.length;
        }
      }
      
      // Fix common patterns
      const commonFixes = [
        { pattern: /_className/g, replacement: 'className' },
        { pattern: /_currentFund/g, replacement: 'currentFund' },
        { pattern: /_isLoading/g, replacement: 'isLoading' },
        { pattern: /_selectedColumns/g, replacement: 'selectedColumns' },
        { pattern: /_subtitle/g, replacement: 'subtitle' },
        { pattern: /_config/g, replacement: 'config' },
        { pattern: /_companies/g, replacement: 'companies' },
        { pattern: /_value/g, replacement: 'value' },
        { pattern: /_CustomField/g, replacement: 'CustomField' },
        { pattern: /_exportToExcel/g, replacement: 'exportToExcel' },
        { pattern: /_isSentryEnabled/g, replacement: 'isSentryEnabled' },
        { pattern: /_GraduationStep/g, replacement: 'GraduationStep' },
        { pattern: /_AllocationDecision/g, replacement: 'AllocationDecision' },
        { pattern: /_useFundStore/g, replacement: 'useFundStore' },
        { pattern: /_subCents/g, replacement: 'subCents' },
        { pattern: /_minCents/g, replacement: 'minCents' },
      ];
      
      for (const fix of commonFixes) {
        const matches = content.match(fix.pattern);
        if (matches) {
          newContent = newContent.replace(fix.pattern, fix.replacement);
          fileFixes += matches.length;
        }
      }
      
      if (fileFixes > 0) {
        if (VERBOSE) {
          console.log(`Fixing ${fileFixes} issues in ${path.relative(process.cwd(), file)}`);
        }
        
        if (!DRY_RUN) {
          await fs.writeFile(file, newContent, 'utf8');
        }
        
        fixedFiles++;
        totalFixes += fileFixes;
      }
      
    } catch (error) {
      console.error(`Error processing ${file}:`, error.message);
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`  Files processed: ${allFiles.length}`);
  console.log(`  Files fixed: ${fixedFiles}`);
  console.log(`  Total fixes: ${totalFixes}`);
  
  if (!DRY_RUN) {
    console.log(`\n🔧 Running TypeScript check...`);
    try {
      const { execSync } = await import('child_process');
      const result = execSync('npm run check:client 2>&1 | grep -c "error TS" || echo "0"', 
        { encoding: 'utf8', cwd: process.cwd() });
      const errorCount = parseInt(result.trim());
      console.log(`Remaining TypeScript errors: ${errorCount}`);
    } catch (error) {
      console.log('Could not check TypeScript errors automatically');
    }
  }
}

main().catch(console.error);