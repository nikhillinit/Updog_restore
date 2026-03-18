#!/usr/bin/env node
/**
 * AI TypeScript Error Fixer
 * Uses AI Orchestrator consensus to analyze and fix TypeScript errors
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

// Load credentials
const credentials = JSON.parse(readFileSync('claude_code-multi-AI-MCP/credentials.json', 'utf-8'));

// Initialize AI clients
const anthropic = credentials.anthropic.enabled
  ? new Anthropic({ apiKey: credentials.anthropic.api_key })
  : null;

const openai = credentials.openai.enabled
  ? new OpenAI({ apiKey: credentials.openai.api_key })
  : null;

const gemini = credentials.gemini.enabled
  ? new GoogleGenerativeAI(credentials.gemini.api_key).getGenerativeModel({ model: credentials.gemini.model })
  : null;

const deepseek = credentials.deepseek.enabled
  ? new OpenAI({
      apiKey: credentials.deepseek.api_key,
      baseURL: 'https://api.deepseek.com',
    })
  : null;

// Get TypeScript errors
console.log('📊 Collecting TypeScript errors...\n');
const tsErrors = execSync('npm run check:client 2>&1 || true', { encoding: 'utf-8' });
const errorLines = tsErrors.split('\n').filter(line => line.includes('error TS'));
const errorCount = errorLines.length;

console.log(`Found ${errorCount} TypeScript errors\n`);

// Categorize errors
const categories = {
  chartTypes: errorLines.filter(e => e.includes('ChartDataInput')),
  overrideModifiers: errorLines.filter(e => e.includes('override')),
  waterfallTypes: errorLines.filter(e => e.includes('hurdle') || e.includes('catchUp')),
  featureFlags: errorLines.filter(e => e.includes('VITE_FEATURE')),
  xlsxModule: errorLines.filter(e => e.includes('xlsx')),
  misc: errorLines.filter(e =>
    !e.includes('ChartDataInput') &&
    !e.includes('override') &&
    !e.includes('hurdle') &&
    !e.includes('catchUp') &&
    !e.includes('VITE_FEATURE') &&
    !e.includes('xlsx')
  ),
};

console.log('📋 Error Categories:');
console.log(`  - Chart Type Mismatches: ${categories.chartTypes.length}`);
console.log(`  - Missing Override Modifiers: ${categories.overrideModifiers.length}`);
console.log(`  - Waterfall Type Issues: ${categories.waterfallTypes.length}`);
console.log(`  - Feature Flag Types: ${categories.featureFlags.length}`);
console.log(`  - Missing xlsx Module: ${categories.xlsxModule.length}`);
console.log(`  - Misc Type Issues: ${categories.misc.length}`);
console.log('');

// Prepare prompt for AI consensus
const prompt = `Analyze these TypeScript errors and provide specific, actionable fixes:

## Error Categories:

### 1. Chart Type Mismatches (${categories.chartTypes.length} errors)
${categories.chartTypes.slice(0, 3).join('\n')}

### 2. Missing Override Modifiers (${categories.overrideModifiers.length} errors)
${categories.overrideModifiers.join('\n')}

### 3. Waterfall Type Issues (${categories.waterfallTypes.length} errors)
${categories.waterfallTypes.slice(0, 3).join('\n')}

### 4. Feature Flag Types (${categories.featureFlags.length} errors)
${categories.featureFlags.join('\n')}

### 5. Missing xlsx Module (${categories.xlsxModule.length} errors)
${categories.xlsxModule.join('\n')}

### 6. Misc Type Issues (${categories.misc.length} errors)
${categories.misc.slice(0, 5).join('\n')}

Please provide:
1. Priority order for fixing (which category first?)
2. Specific code fixes for top 3 priority categories
3. One-line shell commands to apply fixes where possible

Be concise and actionable.`;

// Query AIs in parallel
console.log('🤖 Querying AI models for consensus...\n');

const results = await Promise.allSettled([
  anthropic ? anthropic.messages.create({
    model: credentials.anthropic.model,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  }).then(r => ({ model: 'Claude', text: r.content[0].text })) : null,

  openai ? openai.chat.completions.create({
    model: credentials.openai.model,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  }).then(r => ({ model: 'GPT', text: r.choices[0].message.content })) : null,

  gemini ? gemini.generateContent(prompt)
    .then(r => ({ model: 'Gemini', text: r.response.text() })) : null,

  deepseek ? deepseek.chat.completions.create({
    model: credentials.deepseek.model,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  }).then(r => ({ model: 'DeepSeek', text: r.choices[0].message.content })) : null,
].filter(Boolean));

// Display results
console.log('=' .repeat(80));
console.log('AI CONSENSUS RECOMMENDATIONS');
console.log('='.repeat(80));
console.log('');

results.forEach((result, i) => {
  if (result.status === 'fulfilled' && result.value) {
    const { model, text } = result.value;
    console.log(`\n### ${model} Recommendation:\n`);
    console.log(text);
    console.log('\n' + '-'.repeat(80));
  } else {
    console.log(`\n### AI ${i + 1}: ❌ Failed\n`);
  }
});

console.log('\n\n📝 Summary: Review the recommendations above and apply fixes manually.');
console.log('💡 Tip: Start with the highest priority category that all AIs agree on.\n');
