#!/usr/bin/env node
/**
 * AI Debate: Expert's Vite/Concurrently Remediation Plan
 * Context: Solo developer, internal SaaS tool, Windows environment
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

const CONTEXT = `
# Context: Solo Developer + Internal SaaS Tool

**Project:** Venture capital fund modeling platform (internal tool)
**Developer:** Solo developer building for own team
**Environment:** Windows, Node 20.19.0, npm 10.9.2
**Current State:**
- ✅ Node upgraded to 20.19.0, 0 EBADENGINE warnings
- ✅ 926 packages installed, 0 vulnerabilities
- ❌ vite package missing from node_modules (npm says "changed 1 package" but folder empty)
- ❌ concurrently not recognized in npm scripts
- ❌ Server won't start: "Cannot find package 'vite'"

# Expert's Proposed Remediation Plan

## Section B: Single-Pass Fix (PowerShell)

**Step 0:** Verify environment
**Step 1:** Ensure dev deps won't be omitted (unset NODE_ENV, npm_config_production)
**Step 2:** Clean slate (npm cache clean --force, remove node_modules, package-lock.json)
**Step 3:** Pin devDeps explicitly:
\`\`\`powershell
npm install --save-dev --save-exact vite@5.4.11 concurrently@9.2.1 tsx@4.19.2
\`\`\`

**Step 4:** Regenerate lockfile with \`npm install\`
**Step 5:** Fix package.json scripts to use local bins (not npx)
**Step 6:** Start app with \`npm run dev\`

## Alternative Approaches Expert Mentions

**Section C:** If monorepo/workspaces - install deps in specific workspaces
**Section E:** If vite still missing - workspace targeting, cache poisoning, antivirus interference
**Section H:** Workaround - run dev:client and dev:api in separate terminals

# The Question

For a **solo developer** building an **internal tool** (not production SaaS for customers):

1. Is the expert's full remediation overkill?
2. Which approach is fastest/most pragmatic?
3. Should we use a simpler workaround?
`;

console.log('🎭 AI Debate: Expert Remediation Plan Review\n');
console.log('Context: Solo dev, internal tool, Windows environment');
console.log('='.repeat(80));

// Position A: Follow Expert Plan (Full Remediation)
const positionA = await anthropic.messages.create({
  model: credentials.anthropic.model,
  max_tokens: 1500,
  messages: [{
    role: 'user',
    content: `${CONTEXT}

You argue FOR following the expert's full remediation plan (Section B).
Why is the full clean slate approach better than quick workarounds for a solo dev?
Be pragmatic - consider time investment vs long-term maintenance.`
  }]
});

console.log('\n📍 POSITION A: Full Remediation (Claude)');
console.log('='.repeat(80));
console.log(positionA.content[0].text);

// Position B: Use Simpler Workaround
const positionB = await openai.chat.completions.create({
  model: credentials.openai.model,
  max_tokens: 1500,
  messages: [{
    role: 'user',
    content: `${CONTEXT}

You argue FOR using the simpler workaround (Section H).
For a solo dev with an internal tool, why waste time on full remediation?
Suggest the fastest path to "server working" even if not perfect.`
  }]
});

console.log('\n📍 POSITION B: Quick Workaround (GPT-4)');
console.log('='.repeat(80));
console.log(positionB.choices[0].message.content);

// Judge: Decide winner and create implementation plan
const judgment = await gemini.generateContent(`${CONTEXT}

**POSITION A (Full Remediation):**
${positionA.content[0].text}

**POSITION B (Quick Workaround):**
${positionB.choices[0].message.content}

You are the judge deciding the best approach for a solo developer's internal tool.

Provide:
1. **Winner:** Which approach is better for THIS specific context?
2. **Rationale:** Why (be specific about solo dev + internal tool factors)
3. **Implementation Plan:** Step-by-step commands (PowerShell) to execute winning approach
4. **Time Estimate:** How long this will take
5. **Risk Assessment:** What could still go wrong

Be decisive and practical. This is a solo dev who needs to ship, not enterprise infrastructure.`);

console.log('\n⚖️  JUDGMENT & IMPLEMENTATION PLAN (Gemini)');
console.log('='.repeat(80));
console.log(judgment.response.text());

console.log('\n' + '='.repeat(80));
console.log('📝 NEXT STEPS');
console.log('='.repeat(80));
console.log('\nReview the winning approach above and execute the implementation plan.\n');
