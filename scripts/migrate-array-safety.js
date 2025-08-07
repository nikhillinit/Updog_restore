#!/usr/bin/env node
/**
 * Migration script to find and optionally fix unsafe array forEach patterns
 * Usage: node scripts/migrate-array-safety.js [--fix] [--pattern=specific-pattern]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SEARCH_DIRS = ['src', 'client/src', 'server', 'shared'];
const FILE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const EXCLUDE_PATTERNS = [
  'node_modules',
  '.git', 
  'dist',
  'build',
  '__tests__',
  '.test.',
  '.spec.'
];

// Patterns to find and fix
const UNSAFE_PATTERNS = [
  {
    name: 'Inline null-safe forEach',
    regex: /\(\s*([a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)*)\s*\|\|\s*\[\]\s*\)\.forEach/g,
    replacement: 'forEach($1',
    needsImport: true
  },
  {
    name: 'Optional chaining forEach',
    regex: /([a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)*)\?\.forEach/g,
    replacement: 'forEach($1',
    needsImport: true
  },
  {
    name: 'Inline null-safe map',
    regex: /\(\s*([a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)*)\s*\|\|\s*\[\]\s*\)\.map/g,
    replacement: 'map($1',
    needsImport: true
  },
  {
    name: 'Inline null-safe filter',
    regex: /\(\s*([a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)*)\s*\|\|\s*\[\]\s*\)\.filter/g,
    replacement: 'filter($1',
    needsImport: true
  }
];

class ArraySafetyMigrator {
  constructor(options = {}) {
    this.shouldFix = options.fix || false;
    this.specificPattern = options.pattern;
    this.foundIssues = [];
    this.fixedFiles = new Set();
  }

  // Find all relevant files
  findFiles(dir, files = []) {
    if (!fs.existsSync(dir)) return files;
    
    const entries = fs.readdirSync(dir);
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        if (!EXCLUDE_PATTERNS.some(pattern => entry.includes(pattern))) {
          this.findFiles(fullPath, files);
        }
      } else {
        if (FILE_EXTENSIONS.some(ext => entry.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    }
    
    return files;
  }

  // Analyze a single file
  analyzeFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const issues = [];
    
    for (const pattern of UNSAFE_PATTERNS) {
      if (this.specificPattern && pattern.name !== this.specificPattern) {
        continue;
      }
      
      let match;
      const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
      
      while ((match = regex.exec(content)) !== null) {
        const lines = content.substring(0, match.index).split('\n');
        const lineNumber = lines.length;
        const lineContent = lines[lines.length - 1] + match[0];
        
        issues.push({
          file: filePath,
          pattern: pattern.name,
          line: lineNumber,
          match: match[0],
          fullLine: lineContent.trim(),
          replacement: pattern.replacement,
          needsImport: pattern.needsImport
        });
      }
    }
    
    return issues;
  }

  // Fix issues in a file
  fixFile(filePath, fileIssues) {
    let content = fs.readFileSync(filePath, 'utf8');
    let needsImport = false;
    let modified = false;
    
    // Apply fixes in reverse order to maintain positions
    const sortedIssues = fileIssues.sort((a, b) => b.line - a.line);
    
    for (const issue of sortedIssues) {
      const pattern = UNSAFE_PATTERNS.find(p => p.name === issue.pattern);
      if (pattern) {
        const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
        const newContent = content.replace(regex, pattern.replacement);
        
        if (newContent !== content) {
          content = newContent;
          modified = true;
          if (pattern.needsImport) {
            needsImport = true;
          }
        }
      }
    }
    
    // Add import if needed
    if (needsImport && modified) {
      const importStatement = `import { forEach, map, filter, reduce } from '../utils/array-safety';\n`;
      
      // Check if import already exists
      if (!content.includes('from \'../utils/array-safety\'') && 
          !content.includes('from "../utils/array-safety"')) {
        
        // Find the best place to insert import
        const lines = content.split('\n');
        let insertIndex = 0;
        
        // Insert after existing imports
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].trim().startsWith('import ')) {
            insertIndex = i + 1;
          } else if (lines[i].trim() === '' && insertIndex > 0) {
            break;
          }
        }
        
        lines.splice(insertIndex, 0, importStatement);
        content = lines.join('\n');
      }
    }
    
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      this.fixedFiles.add(filePath);
      
      process.stdout.write(`✅ Fixed ${fileIssues.length} issues in ${filePath}\n`);
    }
  }

  // Main migration process
  async migrate() {
    process.stdout.write('🔍 Scanning for unsafe array patterns...\n\n');
    
    // Find all files
    let allFiles = [];
    for (const dir of SEARCH_DIRS) {
      allFiles = allFiles.concat(this.findFiles(dir));
    }
    
    process.stdout.write(`📁 Found ${allFiles.length} files to analyze\n\n`);
    
    // Analyze each file
    for (const filePath of allFiles) {
      const issues = this.analyzeFile(filePath);
      
      if (issues.length > 0) {
        this.foundIssues = this.foundIssues.concat(issues);
        
        if (this.shouldFix) {
          this.fixFile(filePath, issues);
        }
      }
    }
    
    // Report results
    this.reportResults();
  }

  // Generate report
  reportResults() {
    console.log('\n📊 Migration Report');
    console.log('='.repeat(50));
    
    if (this.foundIssues.length === 0) {
      console.log('✅ No unsafe array patterns found!');
      return;
    }
    
    // Group by pattern type
    const byPattern = {};
    for (const issue of this.foundIssues) {
      if (!byPattern[issue.pattern]) {
        byPattern[issue.pattern] = [];
      }
      byPattern[issue.pattern].push(issue);
    }
    
    // Summary
    console.log(`📋 Total issues found: ${this.foundIssues.length}`);
    console.log(`📁 Files affected: ${new Set(this.foundIssues.map(i => i.file)).size}`);
    
    if (this.shouldFix) {
      console.log(`🔧 Files fixed: ${this.fixedFiles.size}`);
    }
    
    console.log('\n📈 Issues by pattern:');
    
    for (const [patternName, issues] of Object.entries(byPattern)) {
      console.log(`\n🔍 ${patternName}: ${issues.length} occurrences`);
      
      // Show first few examples
      const examples = issues.slice(0, 3);
      for (const issue of examples) {
        console.log(`   ${path.relative(process.cwd(), issue.file)}:${issue.line}`);
        console.log(`   ${issue.fullLine}`);
      }
      
      if (issues.length > 3) {
        console.log(`   ... and ${issues.length - 3} more`);
      }
    }
    
    if (!this.shouldFix) {
      console.log('\n💡 Run with --fix to automatically apply fixes');
      console.log('💡 Run with --pattern="pattern name" to target specific pattern');
    }
    
    console.log('\n📚 See docs/array-safety-adoption-guide.md for more information');
  }
}

// CLI interface
function main() {
  const args = process.argv.slice(2);
  const options = {
    fix: args.includes('--fix'),
    pattern: args.find(arg => arg.startsWith('--pattern='))?.split('=')[1]
  };
  
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(`
Array Safety Migration Tool
==========================

Usage: node scripts/migrate-array-safety.js [options]

Options:
  --fix                    Apply fixes automatically
  --pattern=<name>         Target specific pattern only
  --help, -h              Show this help

Examples:
  node scripts/migrate-array-safety.js                    # Scan only
  node scripts/migrate-array-safety.js --fix             # Scan and fix
  node scripts/migrate-array-safety.js --pattern="Inline null-safe forEach"  # Target specific pattern

Available patterns:
  - Inline null-safe forEach
  - Optional chaining forEach  
  - Inline null-safe map
  - Inline null-safe filter
`);
    process.exit(0);
  }
  
  const migrator = new ArraySafetyMigrator(options);
  migrator.migrate().catch((err) => {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  });
}

// Auto-run when called directly
main();

export { ArraySafetyMigrator };
