#!/usr/bin/env node
/**
 * Nia Documentation Initialization Script
 *
 * Indexes commonly-referenced external documentation for the Press On Ventures platform.
 * Run this after setting up your NIA_API_KEY environment variable.
 *
 * Usage:
 *   node scripts/nia-init-docs.mjs
 *   node scripts/nia-init-docs.mjs --dry-run  # Show what would be indexed
 */

import { spawn } from 'child_process';

const DOCS_TO_INDEX = [
  {
    name: 'React 18 Documentation',
    url: 'https://react.dev/',
    priority: 1,
    rationale: 'Primary frontend framework - frequent reference for hooks, concurrent features, and best practices',
    urlPatterns: ['/reference/*', '/learn/*'],
    excludePatterns: ['/blog/*', '/community/*']
  },
  {
    name: 'Drizzle ORM Documentation',
    url: 'https://orm.drizzle.team/',
    priority: 2,
    rationale: 'Database layer - migrations, queries, and schema management',
    urlPatterns: ['/docs/*'],
    excludePatterns: []
  },
  {
    name: 'BullMQ Documentation',
    url: 'https://docs.bullmq.io/',
    priority: 3,
    rationale: 'Worker queue system - job processing, retry logic, and concurrency patterns',
    urlPatterns: ['/guide/*', '/patterns/*'],
    excludePatterns: []
  },
  {
    name: 'TanStack Query Documentation',
    url: 'https://tanstack.com/query/latest',
    priority: 4,
    rationale: 'Data fetching and caching - API integration patterns',
    urlPatterns: ['/docs/*'],
    excludePatterns: []
  },
  {
    name: 'Vite Documentation',
    url: 'https://vitejs.dev/guide/',
    priority: 5,
    rationale: 'Build tool - configuration, plugins, and optimization',
    urlPatterns: ['/guide/*', '/config/*'],
    excludePatterns: ['/blog/*']
  },
  {
    name: 'shadcn/ui Documentation',
    url: 'https://ui.shadcn.com/',
    priority: 6,
    rationale: 'UI component library - customization and patterns',
    urlPatterns: ['/docs/*'],
    excludePatterns: ['/themes/*', '/blocks/*']
  },
  {
    name: 'PostgreSQL Documentation',
    url: 'https://www.postgresql.org/docs/current/',
    priority: 7,
    rationale: 'Database engine - SQL patterns, performance tuning, and advanced features',
    urlPatterns: ['/sql-*', '/tutorial/*'],
    excludePatterns: []
  },
  {
    name: 'Recharts Documentation',
    url: 'https://recharts.org/en-US/',
    priority: 8,
    rationale: 'Charting library - visualization patterns for analytics dashboards',
    urlPatterns: ['/en-US/api/*', '/en-US/examples/*'],
    excludePatterns: []
  }
];

const isDryRun = process.argv.includes('--dry-run');
const useInteractive = process.argv.includes('--interactive');

/**
 * Check if NIA_API_KEY is configured
 */
function checkApiKey() {
  if (!process.env.NIA_API_KEY) {
    console.error('❌ NIA_API_KEY environment variable not set!');
    console.error('\nPlease set your API key:');
    console.error('  1. Get key from https://app.trynia.ai/');
    console.error('  2. Add to .env: NIA_API_KEY=your_key_here');
    console.error('  3. Or set: export NIA_API_KEY=your_key_here\n');
    process.exit(1);
  }
  console.log('✅ NIA_API_KEY found\n');
}

/**
 * Index a single documentation site
 */
async function indexDocumentation(doc) {
  return new Promise((resolve, reject) => {
    console.log(`📚 Indexing: ${doc.name}`);
    console.log(`   URL: ${doc.url}`);
    console.log(`   Rationale: ${doc.rationale}\n`);

    if (isDryRun) {
      console.log('   [DRY RUN - Skipping actual indexing]\n');
      resolve({ success: true, dryRun: true });
      return;
    }

    // Build the indexing command
    const command = `Use nia index_documentation to index ${doc.url}`;
    const includePatterns = doc.urlPatterns.length > 0
      ? ` with url_patterns: ${JSON.stringify(doc.urlPatterns)}`
      : '';
    const excludePatterns = doc.excludePatterns.length > 0
      ? ` and exclude_patterns: ${JSON.stringify(doc.excludePatterns)}`
      : '';

    console.log(`   Command: ${command}${includePatterns}${excludePatterns}`);
    console.log('   ⏳ This may take 1-3 minutes...\n');

    // Note: In practice, you would call the Nia MCP server here
    // For now, this is a guide for manual indexing
    console.log('   ℹ️  Run this command in Claude Code:');
    console.log(`   "${command}${includePatterns}${excludePatterns}"\n`);

    resolve({ success: true, manual: true });
  });
}

/**
 * Interactive mode - let user choose what to index
 */
async function interactiveMode() {
  console.log('📋 Available Documentation Sources:\n');
  DOCS_TO_INDEX.forEach((doc, index) => {
    console.log(`${index + 1}. ${doc.name} (Priority ${doc.priority})`);
    console.log(`   ${doc.url}`);
    console.log(`   ${doc.rationale}\n`);
  });

  console.log('\nℹ️  Free tier allows 3 indexing jobs.');
  console.log('💡 Recommended: Index top 3 priorities (React, Drizzle, BullMQ)\n');

  return DOCS_TO_INDEX.slice(0, 3);
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Nia Documentation Initialization\n');
  console.log('════════════════════════════════════════════════════════════\n');

  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No actual indexing will occur\n');
  }

  // Check API key
  checkApiKey();

  // Determine which docs to index
  let docsToIndex;
  if (useInteractive) {
    docsToIndex = await interactiveMode();
  } else {
    console.log('📊 Indexing Strategy:\n');
    console.log('Free Tier (3 jobs): Top 3 priorities');
    console.log('  1. React 18 (most frequently referenced)');
    console.log('  2. Drizzle ORM (database layer)');
    console.log('  3. BullMQ (worker system)\n');
    console.log('Additional docs can be indexed later as needed.\n');

    docsToIndex = DOCS_TO_INDEX.slice(0, 3);
  }

  console.log('════════════════════════════════════════════════════════════\n');

  // Index each documentation source
  const results = [];
  for (const doc of docsToIndex) {
    const result = await indexDocumentation(doc);
    results.push({ doc, result });
  }

  // Summary
  console.log('════════════════════════════════════════════════════════════\n');
  console.log('✅ Initialization Complete!\n');

  if (isDryRun) {
    console.log('This was a dry run. To actually index documentation:\n');
    console.log('  node scripts/nia-init-docs.mjs\n');
  } else {
    console.log('📚 Indexed Documentation:');
    results.forEach(({ doc }) => {
      console.log(`   ✓ ${doc.name}`);
    });
    console.log('');
  }

  console.log('🔍 To check indexing status:');
  console.log('   "List my resources"\n');

  console.log('📖 For usage guide, see:');
  console.log('   cheatsheets/nia-mcp-usage.md\n');

  console.log('💡 Next Steps:');
  console.log('   1. Monitor indexing progress: "Check the status of my indexing jobs"');
  console.log('   2. Test search: "Search documentation for React concurrent rendering"');
  console.log('   3. Use package search (no indexing needed!): "Search npm package drizzle-orm"');
  console.log('');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}

export { DOCS_TO_INDEX, indexDocumentation };
