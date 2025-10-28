/**
 * BaseAgent Integration with Multi-Model Prompt Caching
 *
 * Demonstrates how to integrate multi-model prompt caching with BaseAgent
 * for optimal performance across different AI providers.
 *
 * Run: npx tsx packages/agent-core/examples/demo-agent-with-multi-model-cache.ts
 */

import { BaseAgent } from '../src/BaseAgent';
import { MultiModelPromptCache, type AIProvider } from '../src/MultiModelPromptCache';
import type { AgentExecutionContext } from '../src/BaseAgent';

interface CodeAnalysisInput {
  codebase: string;
  query: string;
  provider?: AIProvider;
}

interface CodeAnalysisOutput {
  analysis: string;
  provider: AIProvider;
  cacheStats: {
    hitRate: number;
    tokensSaved: number;
    costSavings: number;
    latencyReduction: number;
  };
}

/**
 * Code Analysis Agent with Multi-Model Caching
 */
class CodeAnalysisAgent extends BaseAgent<CodeAnalysisInput, CodeAnalysisOutput> {
  private cache: MultiModelPromptCache;

  constructor() {
    super({
      name: 'code-analysis-agent',
      maxRetries: 2,
      timeout: 60000,
      enableConversationMemory: false
    });

    // Initialize with default provider
    this.cache = new MultiModelPromptCache({
      provider: 'anthropic',
      enabled: true,
      cacheSystemPrompts: true,
      cacheProjectContext: true
    });
  }

  protected async performOperation(
    input: CodeAnalysisInput,
    context: AgentExecutionContext
  ): Promise<CodeAnalysisOutput> {
    this.logger.info('Starting code analysis', {
      provider: input.provider || 'anthropic',
      queryLength: input.query.length,
      codebaseSize: input.codebase.length
    });

    // Switch provider if specified
    if (input.provider && input.provider !== this.cache.getProvider()) {
      this.logger.info('Switching provider', {
        from: this.cache.getProvider(),
        to: input.provider
      });
      this.cache.switchProvider(input.provider);
    }

    // Prepare cached prompt
    const systemPrompt = this.getSystemPrompt();
    const cachedPrompt = this.cache.prepare({
      systemPrompt,
      projectContext: input.codebase,
      userQuery: input.query
    });

    this.logger.info('Prompt prepared with caching', {
      provider: this.cache.getProvider(),
      supportsNativeCaching: this.cache.supportsNativeCaching(),
      cacheBreakpoints: cachedPrompt.metadata?.cacheBreakpoints,
      estimatedTokens: cachedPrompt.metadata?.estimatedTokens
    });

    // Simulate AI API call (in real usage, call actual API here)
    const analysis = await this.simulateAICall(cachedPrompt);

    // Record cache metrics
    if (cachedPrompt.metadata?.cacheBreakpoints && cachedPrompt.metadata.cacheBreakpoints > 0) {
      this.cache.recordCacheHit(cachedPrompt.metadata.estimatedTokens || 0);
    } else {
      this.cache.recordCacheMiss();
    }

    // Get cache statistics
    const stats = this.cache.getStats();

    return {
      analysis,
      provider: this.cache.getProvider(),
      cacheStats: {
        hitRate: stats.hitRate,
        tokensSaved: stats.tokensSaved,
        costSavings: stats.estimatedCostSavings,
        latencyReduction: stats.estimatedLatencyReduction
      }
    };
  }

  private getSystemPrompt(): string {
    return `You are an expert code analysis assistant specialized in TypeScript, React, and Node.js.

Your responsibilities:
- Analyze code structure and patterns
- Identify potential issues and improvements
- Provide clear, actionable recommendations
- Reference specific files and line numbers

Guidelines:
- Be concise but thorough
- Focus on high-impact improvements
- Consider performance, maintainability, and security
- Use examples to illustrate points`;
  }

  private async simulateAICall(cachedPrompt: any): Promise<string> {
    // In real usage, replace with actual API call:
    //
    // import Anthropic from '@anthropic-ai/sdk';
    // const client = new Anthropic();
    //
    // const response = await client.messages.create({
    //   model: 'claude-sonnet-4-5',
    //   max_tokens: 2048,
    //   system: cachedPrompt.system,
    //   messages: cachedPrompt.messages,
    //   ...cachedPrompt.headers
    // });
    //
    // return response.content[0].text;

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 100));

    return `Code analysis complete. The codebase follows a clean architecture pattern with:
- Feature-based component organization
- Proper separation of concerns
- Type-safe API layer using Zod validation
- Comprehensive test coverage

Recommendations:
1. Consider extracting repeated logic in components/Dashboard into custom hooks
2. Add error boundaries for better error handling
3. Optimize bundle size by lazy-loading heavy dependencies`;
  }

  /**
   * Get current cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Reset cache statistics
   */
  resetCacheStats() {
    this.cache.resetStats();
  }
}

// Demo: Analyze codebase with different providers
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║     BaseAgent + Multi-Model Cache Demo                   ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  const agent = new CodeAnalysisAgent();

  // Sample codebase content
  const codebase = `
// src/components/Dashboard/DashboardCard.tsx
import React from 'react';

export const DashboardCard: React.FC<Props> = ({ title, value }) => {
  return (
    <div className="card">
      <h3>{title}</h3>
      <p>{value}</p>
    </div>
  );
};

// src/api/funds.ts
import { z } from 'zod';

export const FundSchema = z.object({
  id: z.string(),
  name: z.string(),
  size: z.number()
});

// ... more code ...
  `.repeat(20); // Simulate large codebase

  // Test 1: Analyze with Anthropic (native caching)
  console.log('=== Test 1: Anthropic (Claude) ===\n');
  const result1 = await agent.execute({
    codebase,
    query: 'What is the overall code quality?',
    provider: 'anthropic'
  });

  if (result1.success && result1.data) {
    console.log('Provider:', result1.data.provider);
    console.log('Analysis:', result1.data.analysis.substring(0, 200) + '...');
    console.log('\nCache Stats:');
    console.log(`  Hit rate: ${(result1.data.cacheStats.hitRate * 100).toFixed(1)}%`);
    console.log(`  Tokens saved: ${result1.data.cacheStats.tokensSaved.toLocaleString()}`);
    console.log(`  Cost savings: $${result1.data.cacheStats.costSavings.toFixed(2)}`);
    console.log(`  Latency reduction: ${result1.data.cacheStats.latencyReduction}%`);
  }

  // Test 2: Analyze again with same provider (cache hit!)
  console.log('\n\n=== Test 2: Anthropic (Cache Hit) ===\n');
  const result2 = await agent.execute({
    codebase, // Same codebase!
    query: 'What are the main components?',
    provider: 'anthropic'
  });

  if (result2.success && result2.data) {
    console.log('Provider:', result2.data.provider);
    console.log('Analysis:', result2.data.analysis.substring(0, 200) + '...');
    console.log('\nCache Stats (Cumulative):');
    console.log(`  Hit rate: ${(result2.data.cacheStats.hitRate * 100).toFixed(1)}%`);
    console.log(`  Tokens saved: ${result2.data.cacheStats.tokensSaved.toLocaleString()}`);
    console.log(`  Cost savings: $${result2.data.cacheStats.costSavings.toFixed(2)}`);
    console.log(`  Latency reduction: ${result2.data.cacheStats.latencyReduction}%`);
  }

  // Test 3: Switch to Gemini
  console.log('\n\n=== Test 3: Gemini ===\n');
  const result3 = await agent.execute({
    codebase,
    query: 'Analyze performance bottlenecks.',
    provider: 'google'
  });

  if (result3.success && result3.data) {
    console.log('Provider:', result3.data.provider);
    console.log('Analysis:', result3.data.analysis.substring(0, 200) + '...');
  }

  // Test 4: Switch to OpenAI (no native caching)
  console.log('\n\n=== Test 4: OpenAI ===\n');
  agent.resetCacheStats(); // Reset for clean comparison
  const result4 = await agent.execute({
    codebase,
    query: 'What React patterns are used?',
    provider: 'openai'
  });

  if (result4.success && result4.data) {
    console.log('Provider:', result4.data.provider);
    console.log('Analysis:', result4.data.analysis.substring(0, 200) + '...');
    console.log('\nNote: OpenAI does not support native caching');
  }

  // Final stats
  console.log('\n\n=== Final Statistics ===\n');
  const finalStats = agent.getCacheStats();
  console.log(`Provider: ${finalStats.provider}`);
  console.log(`Supports native caching: ${finalStats.supportsNativeCaching}`);
  console.log(`Total operations: ${finalStats.totalHits + finalStats.totalMisses}`);
  console.log(`Cache hit rate: ${(finalStats.hitRate * 100).toFixed(1)}%`);

  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║     Integration Complete                                  ║');
  console.log('╠═══════════════════════════════════════════════════════════╣');
  console.log('║  ✓ Multi-model caching integrated with BaseAgent         ║');
  console.log('║  ✓ Automatic provider switching                           ║');
  console.log('║  ✓ Cache statistics tracked per operation                ║');
  console.log('║  ✓ Significant cost and latency savings                   ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
}

main().catch(console.error);
