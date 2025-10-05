#!/usr/bin/env tsx

/**
 * Codex Review Watch - Real-time code review agent
 *
 * Usage:
 *   npm run review:watch              # Watch default paths
 *   npm run review:watch -- --help    # Show help
 */

import { CodexReviewAgent } from '../packages/codex-review-agent/src/CodexReviewAgent';

// Parse command line arguments
const args = process.argv.slice(2);
const helpRequested = args.includes('--help') || args.includes('-h');

if (helpRequested) {
  console.log(`
📊 Codex Review Watch - Real-time Code Review Agent

Usage:
  npm run review:watch              # Watch default paths (client/src, server, shared)
  npm run review:watch -- --help    # Show this help

Features:
  ✨ Real-time file watching
  🤖 Multi-AI consensus reviews (Gemini, OpenAI, DeepSeek)
  🎯 Smart filtering (excludes node_modules, dist, etc.)
  ⚡ Debounced reviews (1s after save)
  📊 Detailed issue reporting

Configuration:
  The agent watches these directories by default:
    - client/src/     (Frontend code)
    - server/         (Backend code)
    - shared/         (Shared types)

  Only TypeScript/JavaScript files are reviewed:
    - .ts, .tsx, .js, .jsx

Exit:
  Press Ctrl+C to stop watching
  `);
  process.exit(0);
}

async function main() {
  console.log('🚀 Starting Codex Review Agent...\n');

  // Create agent instance
  const agent = new CodexReviewAgent({
    name: 'codex-review-agent',
    logLevel: 'info',
    watchPaths: ['client/src', 'server', 'shared'],
    aiProviders: ['gemini', 'openai', 'deepseek'],
    debounceMs: 1000,
  });

  // Start watching
  await agent.startWatching();

  console.log('\n✅ Codex Review Agent is running!');
  console.log('   Watching for file changes...');
  console.log('   Press Ctrl+C to stop\n');

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('\n\n🛑 Stopping Codex Review Agent...');
    await agent.stopWatching();
    console.log('✅ Stopped. Goodbye!\n');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
