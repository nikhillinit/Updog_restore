/**
 * Bundle Budget Checker for CI
 * Ensures critical bundles stay within size limits to prevent performance regressions
 */

const fs = require('fs');
const path = require('path');

// Define budget limits (in KB)
const BUDGETS = {
  'vendor-charts': 450,    // Charts library bundle
  'vendor-ui-core': 150,    // UI components
  'vendor-forms': 100,      // Form handling
  'planning': 150,          // Planning page
  'index': 100,             // Main entry bundle
};

// Colors for console output
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function checkBudgets() {
  const manifestPath = path.join(process.cwd(), 'dist/public/.vite/manifest.json');
  
  // Check if manifest exists
  if (!fs.existsSync(manifestPath)) {
    console.log(`${YELLOW}Warning: Manifest file not found at ${manifestPath}${RESET}`);
    console.log('Skipping budget checks. Make sure to run build with manifest enabled in CI.');
    return 0; // Don't fail if manifest doesn't exist
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const violations = [];
    const results = [];

    // Check each entry in the manifest
    Object.entries(manifest).forEach(([key, value]) => {
      if (value.file) {
        const filePath = path.join(process.cwd(), 'dist/public', value.file);
        
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          const sizeKB = Math.round(stats.size / 1024);
          
          // Check against budgets
          Object.entries(BUDGETS).forEach(([budgetKey, limitKB]) => {
            if (value.file.includes(budgetKey)) {
              results.push({
                file: value.file,
                size: sizeKB,
                limit: limitKB,
                key: budgetKey
              });
              
              if (sizeKB > limitKB) {
                violations.push({
                  file: value.file,
                  size: sizeKB,
                  limit: limitKB,
                  excess: sizeKB - limitKB,
                  key: budgetKey
                });
              }
            }
          });
        }
      }
    });

    // Report results
    console.log('\n📊 Bundle Size Report:\n');
    console.log('─'.repeat(60));
    
    results.forEach(result => {
      const percentage = Math.round((result.size / result.limit) * 100);
      const color = result.size > result.limit ? RED : 
                    percentage > 80 ? YELLOW : GREEN;
      const status = result.size > result.limit ? '❌' : '✅';
      
      console.log(
        `${status} ${result.key.padEnd(20)} ${color}${result.size}KB${RESET} / ${result.limit}KB (${percentage}%)`
      );
    });
    
    console.log('─'.repeat(60));

    // Report violations
    if (violations.length > 0) {
      console.error(`\n${RED}❌ Budget violations detected:${RESET}\n`);
      violations.forEach(v => {
        console.error(
          `  ${RED}• ${v.key}: ${v.size}KB exceeds limit of ${v.limit}KB by ${v.excess}KB${RESET}`
        );
      });
      console.error('\nPlease optimize the bundles or update the budget limits if the increase is justified.\n');
      return 1;
    } else {
      console.log(`\n${GREEN}✅ All bundles within budget limits!${RESET}\n`);
      return 0;
    }
  } catch (error) {
    console.error(`${RED}Error checking budgets: ${error.message}${RESET}`);
    return 1;
  }
}

// Run the check
const exitCode = checkBudgets();
process.exit(exitCode);