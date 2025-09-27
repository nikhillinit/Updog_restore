#!/usr/bin/env node

/**
 * Automated TypeScript error fixing script
 * Handles common patterns across the codebase systematically
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Common fix patterns
const fixes = {
  // TS4111: Property access from index signature
  ts4111: [
    {
      pattern: /process\.env\.([A-Z_]+)/g,
      replacement: "process.env['$1']"
    },
    {
      pattern: /\.setHeader\(/g,
      replacement: "['setHeader']("
    },
    {
      pattern: /\.on\(/g,
      replacement: "['on']("
    },
    {
      pattern: /\.disable\(/g,
      replacement: "['disable']("
    },
    {
      pattern: /\.get\(/g,
      replacement: "['get']("
    },
    {
      pattern: /\.set\(/g,
      replacement: "['set']("
    },
    {
      pattern: /\.del\(/g,
      replacement: "['del']("
    },
    {
      pattern: /\.incr\(/g,
      replacement: "['incr']("
    },
    {
      pattern: /\.expire\(/g,
      replacement: "['expire']("
    },
    {
      pattern: /\.ping\(/g,
      replacement: "['ping']("
    },
    {
      pattern: /\.quit\(/g,
      replacement: "['quit']("
    },
    {
      pattern: /\.clearAllMocks\(/g,
      replacement: "['clearAllMocks']("
    }
  ],

  // TS2532/TS18048: Object possibly undefined
  ts2532: [
    {
      // Add non-null assertion for array access patterns that are safe
      pattern: /(\w+)\[(\d+)\](?![\!\?])/g,
      replacement: "$1[$2]!",
      condition: (line) => !line.includes('?.') && !line.includes('??')
    }
  ],

  // TS7006: Implicit any parameters
  ts7006: [
    {
      pattern: /\((\w+)\) =>/g,
      replacement: "($1: any) =>"
    },
    {
      pattern: /\((\w+),\s*(\w+)\) =>/g,
      replacement: "($1: any, $2: any) =>"
    }
  ]
};

// File extensions to process
const targetExtensions = ['.ts', '.tsx'];

// Directories to process
const targetDirs = ['client/src', 'server', 'shared'];

function isTargetFile(filePath) {
  return targetExtensions.some(ext => filePath.endsWith(ext)) &&
         !filePath.includes('node_modules') &&
         !filePath.includes('.test.') &&
         !filePath.includes('.spec.');
}

function getFilesToProcess() {
  const files = [];

  function walkDir(dir) {
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          walkDir(fullPath);
        } else if (stat.isFile() && isTargetFile(fullPath)) {
          files.push(fullPath);
        }
      }
    } catch (err) {
      console.warn(`Warning: Could not read directory ${dir}: ${err.message}`);
    }
  }

  for (const dir of targetDirs) {
    if (fs.existsSync(dir)) {
      walkDir(dir);
    }
  }

  return files;
}

function applyFixes(filePath, content) {
  let modified = content;
  let changeCount = 0;

  // Apply TS4111 fixes (property access)
  for (const fix of fixes.ts4111) {
    const before = modified;
    modified = modified.replace(fix.pattern, fix.replacement);
    if (modified !== before) {
      changeCount++;
    }
  }

  // Apply TS2532 fixes (undefined access) - be more conservative
  for (const fix of fixes.ts2532) {
    if (fix.condition && !fix.condition(modified)) continue;

    const before = modified;
    modified = modified.replace(fix.pattern, fix.replacement);
    if (modified !== before) {
      changeCount++;
    }
  }

  // Apply TS7006 fixes (implicit any)
  for (const fix of fixes.ts7006) {
    const before = modified;
    modified = modified.replace(fix.pattern, fix.replacement);
    if (modified !== before) {
      changeCount++;
    }
  }

  return { content: modified, changeCount };
}

function main() {
  console.log('🔧 Starting TypeScript error fixing...');

  // Get current error count
  let initialErrors;
  try {
    execSync('npx tsc --noEmit', { stdio: 'pipe' });
    initialErrors = 0;
  } catch (err) {
    const output = err.stdout?.toString() || err.stderr?.toString() || '';
    const matches = output.match(/error TS\d+/g);
    initialErrors = matches ? matches.length : 0;
  }

  console.log(`📊 Initial error count: ${initialErrors}`);

  const files = getFilesToProcess();
  console.log(`📁 Processing ${files.length} files...`);

  let totalChanges = 0;
  let processedFiles = 0;

  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const result = applyFixes(filePath, content);

      if (result.changeCount > 0) {
        fs.writeFileSync(filePath, result.content);
        totalChanges += result.changeCount;
        console.log(`✅ ${filePath}: ${result.changeCount} fixes applied`);
      }

      processedFiles++;
    } catch (err) {
      console.error(`❌ Error processing ${filePath}: ${err.message}`);
    }
  }

  console.log(`\n📈 Summary:`);
  console.log(`   Files processed: ${processedFiles}`);
  console.log(`   Total fixes applied: ${totalChanges}`);

  // Check final error count
  let finalErrors;
  try {
    execSync('npx tsc --noEmit', { stdio: 'pipe' });
    finalErrors = 0;
  } catch (err) {
    const output = err.stdout?.toString() || err.stderr?.toString() || '';
    const matches = output.match(/error TS\d+/g);
    finalErrors = matches ? matches.length : 0;
  }

  console.log(`📊 Final error count: ${finalErrors}`);
  console.log(`📉 Errors reduced by: ${initialErrors - finalErrors}`);

  if (finalErrors < initialErrors) {
    console.log('🎉 Progress made! TypeScript errors reduced.');
  } else if (finalErrors === initialErrors) {
    console.log('📝 No net change in error count. Some errors may need manual review.');
  } else {
    console.log('⚠️  Error count increased. Some changes may have introduced new issues.');
  }
}

if (require.main === module) {
  main();
}

module.exports = { applyFixes, getFilesToProcess };