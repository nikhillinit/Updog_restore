#!/usr/bin/env node

/**
 * Script to automatically remove unused variables and imports from TypeScript/JavaScript files
 * This handles the 1458 no-unused-vars errors reported by ESLint
 */

import { promises as fs } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  extensions: ['.ts', '.tsx', '.js', '.jsx'],
  excludeDirs: ['node_modules', 'dist', '.git', 'coverage'],
  batchSize: 10, // Process files in batches to avoid memory issues
  dryRun: process.argv.includes('--dry-run'),
  verbose: process.argv.includes('--verbose'),
};

// Patterns to identify and remove unused items
const PATTERNS = {
  // Import patterns
  unusedImport: /^import\s+(?:type\s+)?{([^}]+)}\s+from\s+['"][^'"]+['"];?\s*$/gm,
  unusedDefaultImport: /^import\s+(\w+)\s+from\s+['"][^'"]+['"];?\s*$/gm,
  unusedNamespaceImport: /^import\s+\*\s+as\s+(\w+)\s+from\s+['"][^'"]+['"];?\s*$/gm,
  mixedImport: /^import\s+(\w+),\s*{([^}]+)}\s+from\s+['"][^'"]+['"];?\s*$/gm,
  
  // Variable patterns
  unusedConst: /^\s*const\s+(\w+)\s*=\s*[^;]+;?\s*$/gm,
  unusedLet: /^\s*let\s+(\w+)\s*=\s*[^;]+;?\s*$/gm,
  unusedDestructuring: /^\s*const\s*{([^}]+)}\s*=\s*[^;]+;?\s*$/gm,
  unusedArrayDestructuring: /^\s*const\s*\[([^\]]+)\]\s*=\s*[^;]+;?\s*$/gm,
  
  // Function parameter patterns (for callbacks)
  unusedParams: /\(([^)]*)\)\s*=>/g,
  unusedFunctionParams: /function\s*\w*\s*\(([^)]*)\)/g,
};

/**
 * Parse ESLint output to get list of unused variables
 */
async function getUnusedVars() {
  try {
    // Run ESLint and capture output
    const output = execSync('npm run lint -- --format json', { 
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024 // 50MB buffer for large output
    });
    
    const results = JSON.parse(output);
    const unusedVars = new Map(); // filename -> Set of unused variable names
    
    for (const file of results) {
      if (file.messages.length === 0) continue;
      
      const unused = new Set();
      for (const message of file.messages) {
        if (message.ruleId === 'no-unused-vars') {
          // Extract variable name from message
          const match = message.message.match(/'([^']+)'/);
          if (match) {
            unused.add(match[1]);
          }
        }
      }
      
      if (unused.size > 0) {
        unusedVars.set(file.filePath, unused);
      }
    }
    
    return unusedVars;
  } catch (error) {
    // ESLint exits with error code when there are lint errors
    // Parse the output anyway
    const output = error.stdout?.toString() || error.output?.[1]?.toString() || '[]';
    try {
      const results = JSON.parse(output);
      const unusedVars = new Map();
      
      for (const file of results) {
        if (file.messages.length === 0) continue;
        
        const unused = new Set();
        for (const message of file.messages) {
          if (message.ruleId === 'no-unused-vars') {
            const match = message.message.match(/'([^']+)'/);
            if (match) {
              unused.add(match[1]);
            }
          }
        }
        
        if (unused.size > 0) {
          unusedVars.set(file.filePath, unused);
        }
      }
      
      return unusedVars;
    } catch (parseError) {
      console.error('Failed to parse ESLint output:', parseError);
      return new Map();
    }
  }
}

/**
 * Remove unused imports from file content
 */
function removeUnusedImports(content, unusedVars) {
  let modified = content;
  
  // Handle named imports
  modified = modified.replace(PATTERNS.unusedImport, (match, imports) => {
    const importList = imports.split(',').map(i => i.trim());
    const usedImports = importList.filter(imp => {
      const name = imp.split(/\s+as\s+/).pop().trim();
      return !unusedVars.has(name);
    });
    
    if (usedImports.length === 0) {
      return ''; // Remove entire import
    } else if (usedImports.length < importList.length) {
      return match.replace(imports, usedImports.join(', '));
    }
    return match;
  });
  
  // Handle default imports
  modified = modified.replace(PATTERNS.unusedDefaultImport, (match, name) => {
    return unusedVars.has(name) ? '' : match;
  });
  
  // Handle namespace imports
  modified = modified.replace(PATTERNS.unusedNamespaceImport, (match, name) => {
    return unusedVars.has(name) ? '' : match;
  });
  
  // Handle mixed imports (default + named)
  modified = modified.replace(PATTERNS.mixedImport, (match, defaultImport, namedImports) => {
    const namedList = namedImports.split(',').map(i => i.trim());
    const usedNamed = namedList.filter(imp => {
      const name = imp.split(/\s+as\s+/).pop().trim();
      return !unusedVars.has(name);
    });
    
    const defaultUsed = !unusedVars.has(defaultImport);
    
    if (!defaultUsed && usedNamed.length === 0) {
      return ''; // Remove entire import
    } else if (!defaultUsed) {
      return match.replace(/^\s*import\s+\w+,\s*{/, 'import {');
    } else if (usedNamed.length === 0) {
      return match.replace(/,\s*{[^}]+}/, '');
    } else if (usedNamed.length < namedList.length) {
      return match.replace(namedImports, usedNamed.join(', '));
    }
    return match;
  });
  
  return modified;
}

/**
 * Remove unused variables from file content
 */
function removeUnusedVariables(content, unusedVars) {
  let modified = content;
  
  // Remove unused const declarations
  modified = modified.replace(PATTERNS.unusedConst, (match, name) => {
    return unusedVars.has(name) ? '' : match;
  });
  
  // Remove unused let declarations
  modified = modified.replace(PATTERNS.unusedLet, (match, name) => {
    return unusedVars.has(name) ? '' : match;
  });
  
  // Handle destructuring
  modified = modified.replace(PATTERNS.unusedDestructuring, (match, destructured) => {
    const vars = destructured.split(',').map(v => v.trim());
    const usedVars = vars.filter(v => {
      const name = v.split(':').pop().trim();
      return !unusedVars.has(name);
    });
    
    if (usedVars.length === 0) {
      return ''; // Remove entire declaration
    } else if (usedVars.length < vars.length) {
      return match.replace(destructured, usedVars.join(', '));
    }
    return match;
  });
  
  return modified;
}

/**
 * Prefix unused parameters with underscore
 */
function prefixUnusedParameters(content, unusedVars) {
  let modified = content;
  
  // Arrow functions
  modified = modified.replace(PATTERNS.unusedParams, (match, params) => {
    const paramList = params.split(',').map(p => p.trim());
    const updatedParams = paramList.map(param => {
      const name = param.split(/[:\s=]/, 1)[0].trim();
      if (unusedVars.has(name) && !name.startsWith('_')) {
        return param.replace(name, '_' + name);
      }
      return param;
    });
    return '(' + updatedParams.join(', ') + ') =>';
  });
  
  // Regular functions
  modified = modified.replace(PATTERNS.unusedFunctionParams, (match, params) => {
    const paramList = params.split(',').map(p => p.trim());
    const updatedParams = paramList.map(param => {
      const name = param.split(/[:\s=]/, 1)[0].trim();
      if (unusedVars.has(name) && !name.startsWith('_')) {
        return param.replace(name, '_' + name);
      }
      return param;
    });
    return match.replace(params, updatedParams.join(', '));
  });
  
  return modified;
}

/**
 * Process a single file
 */
async function processFile(filePath, unusedVars) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    let modified = content;
    
    // Apply fixes
    modified = removeUnusedImports(modified, unusedVars);
    modified = removeUnusedVariables(modified, unusedVars);
    modified = prefixUnusedParameters(modified, unusedVars);
    
    // Clean up multiple blank lines
    modified = modified.replace(/\n\n\n+/g, '\n\n');
    
    if (modified !== content) {
      if (!CONFIG.dryRun) {
        await fs.writeFile(filePath, modified, 'utf-8');
      }
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🔍 Analyzing codebase for unused variables...');
  
  const unusedVarsMap = await getUnusedVars();
  
  if (unusedVarsMap.size === 0) {
    console.log('✅ No unused variables found!');
    return;
  }
  
  console.log(`Found ${unusedVarsMap.size} files with unused variables`);
  
  if (CONFIG.dryRun) {
    console.log('🏃 DRY RUN MODE - No files will be modified');
  }
  
  let processedCount = 0;
  let modifiedCount = 0;
  
  for (const [filePath, unusedVars] of unusedVarsMap) {
    if (CONFIG.verbose) {
      console.log(`Processing ${filePath} (${unusedVars.size} unused vars)`);
    }
    
    const modified = await processFile(filePath, unusedVars);
    if (modified) {
      modifiedCount++;
    }
    processedCount++;
    
    if (processedCount % CONFIG.batchSize === 0) {
      console.log(`Progress: ${processedCount}/${unusedVarsMap.size} files processed`);
    }
  }
  
  console.log('\n📊 Summary:');
  console.log(`  Files analyzed: ${unusedVarsMap.size}`);
  console.log(`  Files modified: ${modifiedCount}`);
  
  if (!CONFIG.dryRun && modifiedCount > 0) {
    console.log('\n🔧 Running ESLint to verify fixes...');
    try {
      execSync('npm run lint', { stdio: 'inherit' });
      console.log('✅ All lint errors fixed!');
    } catch (error) {
      console.log('⚠️  Some lint errors remain. Run `npm run lint` to see details.');
    }
  }
}

// Execute
main().catch(console.error);

export { processFile, removeUnusedImports, removeUnusedVariables };