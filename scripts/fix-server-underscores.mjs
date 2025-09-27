#!/usr/bin/env node

/**
 * Fix remaining server-side underscore issues
 */

import { promises as fs } from 'fs';
import { glob } from 'glob';

const DRY_RUN = process.argv.includes('--dry-run');

const SERVER_FIXES = [
  // Drizzle ORM fixes
  { pattern: /_eq/g, replacement: 'eq', files: ['**/adapter.ts'] },
  { pattern: /_and/g, replacement: 'and', files: ['**/adapter.ts'] },
  
  // Schema fixes
  { pattern: /_fundEvents/g, replacement: 'fundEvents', files: ['**/websocket.ts'] },
];

async function main() {
  console.log('🔧 Fixing server-side underscore imports...');
  if (DRY_RUN) console.log('🏃 DRY RUN MODE - No files will be modified');
  
  let totalFixes = 0;
  let fixedFiles = 0;
  
  for (const fix of SERVER_FIXES) {
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
}

main().catch(console.error);