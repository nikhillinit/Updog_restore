#!/usr/bin/env node
/**
 * AI Server Fix Plan Review
 * Gets multi-AI consensus on server error fix strategy
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
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

const SERVER_FIX_PLAN = `
# Server Error Fix Plan

## Root Cause
- package-lock.json was DELETED in commit c60dead (Oct 3, 2025)
- This is RECURRENT (happened multiple times)
- Without lockfile: only 185/400+ packages installed
- Missing critical tools: concurrently, tsx, @radix-ui/* packages
- .gitignore has lockfile commented out (lines 97-99)

## Current Proposed Fix (3 Phases)

### Phase 1: Immediate Recovery (5 min)
1. Restore package-lock.json from commit a795897
2. Run \`npm ci\` for deterministic install
3. Verify dev tools: concurrently, tsx
4. Test: \`npm run dev\`

### Phase 2: Prevent Future Deletions (10 min)
1. Add pre-commit hook blocking lockfile deletion
2. Add CI lockfile verification check
3. Update Husky hooks with clear error messages
4. Document in CLAUDE.md and DECISIONS.md

### Phase 3: Root Cause Prevention (5 min)
1. Investigate if AI agents are modifying package.json
2. Add .npmrc with \`package-lock=true\`
3. Uncomment .gitignore ambiguous lines
4. Create weekly lockfile integrity audit script

## Success Criteria
- ✅ Server starts (\`npm run dev\`)
- ✅ Pre-commit hook blocks lockfile deletion
- ✅ CI fails if lockfile missing
- ✅ Documentation updated

## Project Context
- Venture capital fund modeling platform
- TypeScript/React/Node.js stack
- Uses: Express, Vite, Drizzle ORM, BullMQ
- AI-augmented development with multi-AI orchestration
- Recent work: Fixed 100+ TypeScript errors → 0
`;

const prompt = `You are a senior DevOps engineer reviewing a fix plan for npm dependency issues.

${SERVER_FIX_PLAN}

Please provide:

1. **Risk Assessment** (0-10 scale)
   - What could go wrong with this approach?
   - Any hidden gotchas?

2. **Optimization Opportunities**
   - How can this be done faster/safer?
   - Any steps that can be parallelized or automated?

3. **Alternative Approaches**
   - Are there better ways to solve this?
   - What would you do differently?

4. **Priority Ranking**
   - Should Phase order change?
   - Which steps are critical vs nice-to-have?

5. **One Key Recommendation**
   - What's THE most important thing to do first?

Be concise but specific. Focus on actionable advice.`;

console.log('🤖 Querying AI models for server fix plan review...\n');
console.log('=' .repeat(80));

// Query AIs in parallel
const results = await Promise.allSettled([
  anthropic ? anthropic.messages.create({
    model: credentials.anthropic.model,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  }).then(r => ({ model: 'Claude (Anthropic)', text: r.content[0].text })) : null,

  openai ? openai.chat.completions.create({
    model: credentials.openai.model,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  }).then(r => ({ model: 'GPT-4 (OpenAI)', text: r.choices[0].message.content })) : null,

  gemini ? gemini.generateContent(prompt)
    .then(r => ({ model: 'Gemini (Google)', text: r.response.text() })) : null,

  deepseek ? deepseek.chat.completions.create({
    model: credentials.deepseek.model,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  }).then(r => ({ model: 'DeepSeek', text: r.choices[0].message.content })) : null,
].filter(Boolean));

// Display results
console.log('\n📊 AI CONSENSUS RECOMMENDATIONS');
console.log('='.repeat(80));
console.log('');

const successfulResults = [];

results.forEach((result, i) => {
  if (result.status === 'fulfilled' && result.value) {
    const { model, text } = result.value;
    successfulResults.push({ model, text });
    console.log(`\n${'='.repeat(80)}`);
    console.log(`### ${model}`);
    console.log('='.repeat(80));
    console.log(text);
    console.log('');
  } else {
    console.log(`\n### AI ${i + 1}: ❌ Failed`);
    if (result.status === 'rejected') {
      console.log(`Error: ${result.reason.message}`);
    }
  }
});

// Consensus analysis
console.log('\n' + '='.repeat(80));
console.log('📝 CONSENSUS SUMMARY');
console.log('='.repeat(80));
console.log(`\n✅ Received ${successfulResults.length}/4 AI responses\n`);

if (successfulResults.length > 0) {
  console.log('💡 Next Steps:');
  console.log('  1. Review each AI\'s recommendations above');
  console.log('  2. Identify common themes and concerns');
  console.log('  3. Adjust the fix plan based on consensus');
  console.log('  4. Execute the optimized plan');
} else {
  console.log('❌ No successful AI responses. Check API keys and network connection.');
}

console.log('\n' + '='.repeat(80));
