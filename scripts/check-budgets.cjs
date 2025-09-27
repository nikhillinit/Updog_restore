/**
 * Bundle Budget Checker for CI
 * Ensures critical bundles stay within size limits to prevent performance regressions
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Check if we should use compressed sizes
const USE_COMPRESSED = process.env.BUNDLE_CHECK_COMPRESSED === 'true' || process.argv.includes('--compressed');

// Define budget limits (in KB)
// Tighter limits when checking compressed sizes
const BUDGETS = USE_COMPRESSED ? {
  'vendor-charts': 120,    // Charts library bundle (compressed)
  'vendor-ui-core': 45,     // UI components (compressed)
  'vendor-forms': 25,       // Form handling (compressed)
  'planning': 40,           // Planning page (compressed)
  'index': 25,              // Main entry bundle (compressed)
} : {
  'vendor-charts': 400,    // Charts library bundle (uncompressed - tightened from 450)
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

/**
 * Get size of file, optionally compressed
 */
function getFileSize(filePath) {
  const stats = fs.statSync(filePath);
  
  if (!USE_COMPRESSED) {
    return stats.size;
  }
  
  // Get gzip compressed size
  const fileContent = fs.readFileSync(filePath);
  const compressed = zlib.gzipSync(fileContent, { level: 9 });
  return compressed.length;
}

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
          const sizeBytes = getFileSize(filePath);
          const sizeKB = Math.round(sizeBytes / 1024);
          
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
    console.log(`\n📊 Bundle Size Report ${USE_COMPRESSED ? '(gzip compressed)' : '(uncompressed)'}:\n`);
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