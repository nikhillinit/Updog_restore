#!/usr/bin/env node
/**
 * AI Review: Node Version Mismatch Strategy
 * Expert says we must upgrade Node before proceeding
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFileSync } from 'fs';

const credentials = JSON.parse(readFileSync('claude_code-multi-AI-MCP/credentials.json', 'utf-8'));

const anthropic = new Anthropic({ apiKey: credentials.anthropic.api_key });
const openai = new OpenAI({ apiKey: credentials.openai.api_key });
const gemini = new GoogleGenerativeAI(credentials.gemini.api_key).getGenerativeModel({
  model: credentials.gemini.model
});

const EXPERT_FEEDBACK = `
# Expert Critique: Node Version Mismatch

## Current State
- Node.js v20.17.0 (installed)
- Dependencies require: v20.19.0+ (@faker-js/faker, @redocly/*)
- Workaround used: Disabled engine-strict=true
- Result: 921 packages installed, but with warnings
- Tests failing: cross-env, husky not in PATH

## Expert Assessment
"The installation completed, but only because you disabled engine-strict.
The logs are full of warnings that your Node version is incorrect.
Test failures are symptoms of incomplete/improperly configured installation.

This is a SHAKY FOUNDATION. Continuing will only lead to more errors."

## Expert Recommendation
MANDATORY steps before proceeding:
1. Install and use Node.js v20.19.0+
2. Re-enable engine-strict=true in .npmrc
3. Delete node_modules and package-lock.json
4. Run npm install in correct environment
5. This produces truly clean, correct, deterministic state

## The Question
Is the expert right? Should we:
A) Follow expert advice (upgrade Node first, clean slate)
B) Continue with current state (v20.17.0 + engine-strict=false)
C) Hybrid approach (something else)

## Project Context
- Production VC fund modeling platform
- Critical: Stability, reproducibility, determinism
- Currently: TypeScript errors fixed (100+ → 0)
- Goal: Get server running with solid foundation
`;

const prompt = `${EXPERT_FEEDBACK}

You are a senior DevOps engineer reviewing this situation.

Provide:
1. **Risk Analysis** - What are the actual risks of continuing with v20.17.0?
2. **Expert Validation** - Is the expert's critique correct?
3. **Practical Assessment** - How critical is this version mismatch?
4. **Recommendation** - A/B/C with specific rationale
5. **Mitigation** - If we can't upgrade Node immediately, what's the safest path?

Be honest about trade-offs. Consider:
- Production stability requirements
- Time constraints
- Risk vs pragmatism
- What MUST be fixed vs what CAN wait

Specific, actionable advice only.`;

console.log('🤖 Consulting AI Agents on Node Version Strategy\n');
console.log('='.repeat(80));

// Get all AI opinions in parallel
const results = await Promise.allSettled([
  anthropic.messages.create({
    model: credentials.anthropic.model,
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  }).then(r => ({ model: 'Claude', text: r.content[0].text })),

  openai.chat.completions.create({
    model: credentials.openai.model,
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  }).then(r => ({ model: 'GPT-4', text: r.choices[0].message.content })),

  gemini.generateContent(prompt)
    .then(r => ({ model: 'Gemini', text: r.response.text() })),
]);

console.log('\n📊 AI CONSENSUS ON NODE VERSION STRATEGY');
console.log('='.repeat(80));

results.forEach((result, i) => {
  if (result.status === 'fulfilled' && result.value) {
    const { model, text } = result.value;
    console.log(`\n${'='.repeat(80)}`);
    console.log(`### ${model} Analysis`);
    console.log('='.repeat(80));
    console.log(text);
  } else {
    console.log(`\n### AI ${i + 1}: ❌ Failed`);
  }
});

console.log('\n' + '='.repeat(80));
console.log('📝 RECOMMENDATION SUMMARY');
console.log('='.repeat(80));
console.log('\nReview AI consensus above and decide:');
console.log('  A) Upgrade Node immediately (expert recommendation)');
console.log('  B) Continue with current state (pragmatic short-term)');
console.log('  C) Hybrid approach (based on AI suggestions)');
console.log('');
