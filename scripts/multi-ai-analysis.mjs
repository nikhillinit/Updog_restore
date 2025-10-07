#!/usr/bin/env node

/**
 * Multi-AI Analysis Script
 * Queries all AI providers for comprehensive codebase analysis
 */

// Load environment variables BEFORE any imports that depend on them
import { config } from 'dotenv';
config({ path: '.env.local', override: true });

// Dynamic import to ensure environment is loaded first
const { askAllAIs } = await import('../server/services/ai-orchestrator.ts');

const prompt = `Analyze this TypeScript configuration issue in a monorepo codebase:

PROBLEM:
VSCode reports two errors:
1. Cannot read file 'c:/Users/nikhi/AppData/Local/Temp/tsconfig.json'
2. No inputs found in config with include: ['client/src','shared','types','client/vite-env.d.ts'], exclude: []

TSCONFIG STRUCTURE:
- Root tsconfig.json: includes [types, client/src, shared, server, schema], baseUrl: ".", paths for @/, @shared/, @server/, @schema
- client/tsconfig.json: extends root, includes [src, vite-env.d.ts], sets baseUrl: ".", paths: @/* → src/*, @shared/* → ../shared/*
- tsconfig.client.json: extends root, includes [types, client, shared, agent-core files], composite build, tsBuildInfoFile
- tsconfig.server.json: extends root, includes [server, shared, schema, core client files], excludes UI components, strict: false

ADDITIONAL CONTEXT:
- orchestrate.js is a legacy bootstrap script that creates directories (client/src/core/reserves, client/src/core/pacing, tests/fixtures) and runs smoke tests against APIs
- Project uses sidecar architecture (tools_local/) for Windows module resolution reliability
- Multiple TypeScript projects (client, server, shared, schema, packages) with project references
- Working directory: c:\\dev\\Updog_restore
- VSCode is trying to read a tsconfig from user temp directory instead of project directory

QUESTIONS TO ADDRESS:
1. Root cause: Why is VSCode referencing c:/Users/nikhi/AppData/Local/Temp/tsconfig.json?
2. Configuration conflict: Which tsconfig is causing the "no inputs found" error and why?
3. orchestrate.js relevance: Is this script interfering with TypeScript configuration?
4. Fix recommendations: Concrete steps to resolve both errors
5. Best practices: How should this multi-project TypeScript setup be structured?

Provide detailed technical analysis with specific file paths and configuration fixes.`;

async function main() {
  console.log('🚀 Querying all AI providers (Claude, GPT, Gemini, DeepSeek)...\n');

  try {
    const results = await askAllAIs({
      prompt,
      models: ['claude', 'gpt', 'gemini', 'deepseek'],
      tags: ['typescript', 'config', 'monorepo', 'vscode']
    });

    console.log('\n' + '='.repeat(80));
    console.log('MULTI-AI ANALYSIS RESULTS');
    console.log('='.repeat(80) + '\n');

    for (const result of results) {
      console.log('\n' + '─'.repeat(80));
      console.log(`🤖 ${result.model.toUpperCase()}`);
      console.log('─'.repeat(80) + '\n');

      if (result.error) {
        console.log(`❌ ERROR: ${result.error}\n`);
      } else {
        console.log(result.text);
        console.log(`\n📊 Cost: $${result.cost_usd?.toFixed(4)} | ⏱️  Time: ${result.elapsed_ms}ms`);
        if (result.usage) {
          console.log(`📈 Tokens: ${result.usage.total_tokens} (${result.usage.prompt_tokens} in / ${result.usage.completion_tokens} out)`);
        }
      }
    }

    // Summary
    const successful = results.filter(r => !r.error);
    const failed = results.filter(r => r.error);
    const totalCost = results.reduce((sum, r) => sum + (r.cost_usd || 0), 0);
    const avgTime = results.reduce((sum, r) => sum + (r.elapsed_ms || 0), 0) / results.length;

    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`✅ Successful: ${successful.length}/${results.length}`);
    console.log(`❌ Failed: ${failed.length}/${results.length}`);
    console.log(`💰 Total Cost: $${totalCost.toFixed(4)}`);
    console.log(`⏱️  Average Time: ${avgTime.toFixed(0)}ms`);
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
    process.exit(1);
  }
}

main();
