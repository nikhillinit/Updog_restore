#!/usr/bin/env node
/**
 * AI Debate: Fresh Install vs Restore Lockfile
 * Two AIs debate the best approach based on expert feedback
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { readFileSync } from 'fs';

const credentials = JSON.parse(readFileSync('claude_code-multi-AI-MCP/credentials.json', 'utf-8'));

const anthropic = new Anthropic({ apiKey: credentials.anthropic.api_key });
const openai = new OpenAI({ apiKey: credentials.openai.api_key });

const DEBATE_CONTEXT = `
# Debate Topic: Fresh Install vs Restore Lockfile

## Initial AI Consensus (4/4 AIs)
Recommended: Delete package-lock.json and run fresh \`npm install\`
Reasoning: Avoids stale dependencies, ensures lockfile matches current package.json

## Expert Pushback
"Fresh install throws away determinism and can silently bump transitive deps.
Prefer restore + \`npm ci\` over regenerate. Only regenerate when no good lockfile exists."

## The Question
Which approach is ACTUALLY better for this scenario?

## Project Context
- Venture capital fund modeling platform (production system)
- package-lock.json was DELETED in commit c60dead (Oct 3, 2025)
- Last known-good lockfile: commit a795897 (before Oct 3)
- Unknown if package.json changed between a795897 and c60dead
- RECURRENT problem (happened multiple times)

## Two Approaches

### Approach A: Fresh Install (AI Consensus)
\`\`\`bash
rm package-lock.json
npm install  # Generates new lockfile
\`\`\`
Pros: No version conflicts, matches current package.json
Cons: Loses determinism, transitive deps may change silently

### Approach B: Restore + npm ci (Expert Recommendation)
\`\`\`bash
git restore a795897 -- package-lock.json
npm ci  # Fails if lockfile/package.json mismatch
\`\`\`
Pros: Preserves determinism, reproducible builds
Cons: Fails if package.json changed since a795897

## Your Task
Debate which approach is better for THIS specific scenario.
Consider: production stability, risk tolerance, reproducibility needs.
Be specific about edge cases and failure modes.
`;

console.log('🎭 Starting AI Debate: Fresh Install vs Restore Lockfile\n');
console.log('='.repeat(80));

// Position A: Fresh Install (Claude argues FOR AI consensus)
const positionA = await anthropic.messages.create({
  model: credentials.anthropic.model,
  max_tokens: 1500,
  messages: [{
    role: 'user',
    content: `${DEBATE_CONTEXT}

You are arguing FOR Approach A (Fresh Install).
Defend why fresh \`npm install\` is BETTER than restore+\`npm ci\` for this scenario.
Address the "lost determinism" criticism directly.
Be persuasive but honest about trade-offs.`
  }]
});

console.log('\n📍 POSITION A: Fresh Install (Defended by Claude)');
console.log('='.repeat(80));
console.log(positionA.content[0].text);
console.log('');

// Position B: Restore + npm ci (GPT argues FOR expert recommendation)
const positionB = await openai.chat.completions.create({
  model: credentials.openai.model,
  max_tokens: 1500,
  messages: [{
    role: 'user',
    content: `${DEBATE_CONTEXT}

You are arguing FOR Approach B (Restore + npm ci).
Defend why restoring the known-good lockfile is BETTER than fresh install.
Address why "matching current package.json" isn't always the right goal.
Be persuasive but honest about trade-offs.`
  }]
});

console.log('\n📍 POSITION B: Restore + npm ci (Defended by GPT-4)');
console.log('='.repeat(80));
console.log(positionB.choices[0].message.content);
console.log('');

// Judge: Gemini decides winner
const gemini = new GoogleGenerativeAI(credentials.gemini.api_key).getGenerativeModel({
  model: credentials.gemini.model
});

const judgment = await gemini.generateContent(`${DEBATE_CONTEXT}

You are the judge. You've heard both arguments:

**POSITION A (Fresh Install):**
${positionA.content[0].text}

**POSITION B (Restore + npm ci):**
${positionB.choices[0].message.content}

Your task:
1. Identify the strongest points from each side
2. Determine which approach is BETTER for this specific scenario
3. Provide a HYBRID solution if appropriate
4. Give specific implementation steps

Be decisive but fair. Consider production risk vs development velocity.`);

console.log('\n⚖️  JUDGMENT (Gemini as Judge)');
console.log('='.repeat(80));
console.log(judgment.response.text());
console.log('');

console.log('='.repeat(80));
console.log('📝 DEBATE CONCLUSION');
console.log('='.repeat(80));
console.log('\nReview the judgment above for the final recommended approach.\n');
