#!/usr/bin/env node

/**
 * Fix remaining underscore imports that were missed in the first pass
 */

import { promises as fs } from 'fs';
import { glob } from 'glob';

const DRY_RUN = process.argv.includes('--dry-run');

// Additional fixes based on TypeScript errors
const ADDITIONAL_FIXES = [
  // Dashboard portfolio concentration
  { pattern: /_title/g, replacement: 'title', files: ['**/portfolio-concentration.tsx'] },
  
  // Command input
  { pattern: /_CommandInput/g, replacement: 'CommandInput', files: ['**/deal-tags-editor.tsx'] },
  
  // Stage policies
  { pattern: /_stagePolicies/g, replacement: 'stagePolicies', files: ['**/ConstrainedReserveEngine.ts'] },
  
  // Feature flags
  { pattern: /_isEnabled/g, replacement: 'isEnabled', files: ['**/rollout-orchestrator.ts'] },
  
  // Wouter Link
  { pattern: /_Link/g, replacement: 'Link', files: ['**/allocation-manager.tsx'] },
  
  // POV components
  { pattern: /_POVIcon/g, replacement: 'POVIcon', files: ['**/dashboard-modern.tsx'] },
  { pattern: /_POVLogo/g, replacement: 'POVLogo', files: ['**/fund-setup.tsx'] },
  
  // React hooks
  { pattern: /_useRef/g, replacement: 'useRef', files: ['**/fund-setup.tsx'] },
  { pattern: /_useMutation/g, replacement: 'useMutation', files: ['**/planning.tsx'] },
  { pattern: /_useFundContext/g, replacement: 'useFundContext', files: ['**/investment-detail.tsx'] },
  
  // Service functions
  { pattern: /_startCreateFund/g, replacement: 'startCreateFund', files: ['**/fund-setup.tsx'] },
  { pattern: /_cancelCreateFund/g, replacement: 'cancelCreateFund', files: ['**/fund-setup.tsx'] },
  { pattern: /_computeCreateFundHash/g, replacement: 'computeCreateFundHash', files: ['**/fund-setup.tsx'] },
  
  // Toast
  { pattern: /_toast/g, replacement: 'toast', files: ['**/fund-setup.tsx'] },
  
  // Wizard components
  { pattern: /_WizardSectionHeading/g, replacement: 'WizardSectionHeading', files: ['**/fund-setup.tsx'] },
  { pattern: /_WizardInputLabel/g, replacement: 'WizardInputLabel', files: ['**/fund-setup.tsx'] },
  
  // Lucide icons
  { pattern: /_CheckCircle/g, replacement: 'CheckCircle', files: ['**/fund-setup.tsx'] },
  { pattern: /_X/g, replacement: 'X', files: ['**/fund-setup.tsx'] },
  
  // UI components
  { pattern: /_Textarea/g, replacement: 'Textarea', files: ['**/kpi-manager.tsx'] },
  
  // Recharts
  { pattern: /_ComposedChart/g, replacement: 'ComposedChart', files: ['**/return-the-fund.tsx'] },
  { pattern: /_Area/g, replacement: 'Area', files: ['**/return-the-fund.tsx'] },
  { pattern: /_AreaChart/g, replacement: 'AreaChart', files: ['**/return-the-fund.tsx'] },
  
  // Date functions
  { pattern: /_format/g, replacement: 'format', files: ['**/planning.tsx'] },
  
  // Zustand
  { pattern: /_shallow/g, replacement: 'shallow', files: ['**/useStageValidation.ts'] },
  
  // Sentry
  { pattern: /_Sentry/g, replacement: 'Sentry', files: ['**/sentry.ts'] },
  
  // Shared types
  { pattern: /_Stage/g, replacement: 'Stage', files: ['**/useFundStore.ts'] },
  { pattern: /_safeArray/g, replacement: 'safeArray', files: ['**/async-iteration.ts'] },
  { pattern: /_zNumberish/g, replacement: 'zNumberish', files: ['**/dto.ts'] },
  
  // Drizzle
  { pattern: /_boolean/g, replacement: 'boolean', files: ['**/flags.ts'] },
  
  // Investment strategy
  { pattern: /_allValid/g, replacement: 'allValid', files: ['**/InvestmentStrategyStep.tsx'] },
];

async function main() {
  console.log('🔧 Fixing remaining underscore imports...');
  if (DRY_RUN) console.log('🏃 DRY RUN MODE - No files will be modified');
  
  let totalFixes = 0;
  let fixedFiles = 0;
  
  for (const fix of ADDITIONAL_FIXES) {
    console.log(`Fixing ${fix.pattern} in ${fix.files.join(', ')}`);
    
    for (const filePattern of fix.files) {
      const files = await glob(filePattern, { 
        ignore: ['**/node_modules/**', '**/dist/**'],
        cwd: process.cwd()
      });
      
      for (const file of files) {
        try {
          const content = await fs.readFile(file, 'utf8');
          const matches = content.match(fix.pattern);
          
          if (matches) {
            const newContent = content.replace(fix.pattern, fix.replacement);
            console.log(`  Fixed ${matches.length} occurrences in ${file}`);
            
            if (!DRY_RUN) {
              await fs.writeFile(file, newContent, 'utf8');
            }
            
            totalFixes += matches.length;
            fixedFiles++;
          }
        } catch (error) {
          console.error(`Error processing ${file}:`, error.message);
        }
      }
    }
  }
  
  console.log(`\n📊 Summary:`);
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