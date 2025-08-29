#!/usr/bin/env node
/**
 * Type Safety Scanner - Find and suggest fixes for type issues
 */

import { readFileSync } from 'fs';
import { glob } from 'glob';
import path from 'path';

const MAX_SUGGESTIONS = 10;

async function scanForTypeIssues() {
  console.log('🔍 Scanning for type safety issues...\n');
  
  const files = await glob('**/*.{ts,tsx}', {
    ignore: [
      'node_modules/**',
      'dist/**',
      '*.test.ts',
      '*.spec.ts',
      '*.d.ts',
      'repo/**',
      'packages/**'
    ]
  });
  
  const issues = [];
  
  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        // Check for explicit 'any'
        if (line.match(/:\s*any\b/)) {
          issues.push({
            file,
            line: index + 1,
            type: 'explicit-any',
            code: line.trim(),
            suggestion: line.replace(/:\s*any\b/, ': unknown')
          });
        }
        
        // Check for 'as any'
        if (line.match(/as\s+any\b/)) {
          issues.push({
            file,
            line: index + 1,
            type: 'as-any',
            code: line.trim(),
            suggestion: line.replace(/as\s+any\b/, 'as unknown')
          });
        }
        
        // Check for common patterns that could be improved
        if (line.includes('(req: any') || line.includes('(request: any')) {
          issues.push({
            file,
            line: index + 1,
            type: 'untyped-request',
            code: line.trim(),
            suggestion: 'Consider using: (req: Request) with proper Express/Fastify types'
          });
        }
        
        if (line.includes('(res: any') || line.includes('(response: any')) {
          issues.push({
            file,
            line: index + 1,
            type: 'untyped-response',
            code: line.trim(),
            suggestion: 'Consider using: (res: Response) with proper Express/Fastify types'
          });
        }
      });
    } catch (e) {
      // Skip files that can't be read
    }
  }
  
  return issues;
}

function categorizeIssues(issues) {
  const byType = {};
  
  issues.forEach(issue => {
    if (!byType[issue.type]) {
      byType[issue.type] = [];
    }
    byType[issue.type].push(issue);
  });
  
  return byType;
}

function displayResults(issues) {
  const categorized = categorizeIssues(issues);
  
  console.log('=' * 60);
  console.log('           TYPE SAFETY SCAN RESULTS');
  console.log('=' * 60);
  console.log(`\nTotal issues found: ${issues.length}\n`);
  
  // Show summary by type
  Object.entries(categorized).forEach(([type, items]) => {
    console.log(`${type}: ${items.length} occurrences`);
  });
  
  console.log('\n🔧 Top Suggestions (High Confidence):\n');
  
  // Show top suggestions
  const suggestions = issues
    .filter(i => i.type === 'explicit-any' || i.type === 'as-any')
    .slice(0, MAX_SUGGESTIONS);
  
  suggestions.forEach((issue, idx) => {
    console.log(`${idx + 1}. ${issue.file}:${issue.line}`);
    console.log(`   Type: ${issue.type}`);
    console.log(`   Current: ${issue.code.substring(0, 80)}${issue.code.length > 80 ? '...' : ''}`);
    console.log(`   Fix: ${issue.suggestion.substring(0, 80)}${issue.suggestion.length > 80 ? '...' : ''}`);
    console.log('');
  });
  
  // Provide actionable recommendations
  console.log('📋 Recommended Actions:\n');
  
  if (categorized['explicit-any']?.length > 0) {
    console.log('1. Replace explicit "any" with "unknown" for safer type checking');
    console.log('   - This forces proper type guards at usage sites');
    console.log('   - Start with high-traffic code paths\n');
  }
  
  if (categorized['as-any']?.length > 0) {
    console.log('2. Replace "as any" with "as unknown" as intermediate step');
    console.log('   - Then add proper type assertions');
    console.log('   - Focus on API boundaries first\n');
  }
  
  if (categorized['untyped-request']?.length > 0) {
    console.log('3. Add proper Request/Response types for handlers');
    console.log('   - Import from express or fastify');
    console.log('   - Use AuthenticatedRequest for routes with auth\n');
  }
  
  console.log('🚀 Next Steps:');
  console.log('   - Review suggestions above');
  console.log('   - Apply fixes with: npm run ai:type-safety --max-fixes=10');
  console.log('   - Run ESLint to see warnings: npm run lint');
  console.log('   - Check TypeScript errors: npm run check\n');
}

// Main execution
async function main() {
  try {
    const issues = await scanForTypeIssues();
    displayResults(issues);
    
    // If in dry-run mode, show what would be fixed
    if (process.argv.includes('--dry-run')) {
      console.log('ℹ️  Dry-run mode - no changes made');
      console.log(`   Would fix ${Math.min(MAX_SUGGESTIONS, issues.length)} issues\n`);
    }
    
  } catch (error) {
    console.error('Error during scan:', error);
    process.exit(1);
  }
}

main();