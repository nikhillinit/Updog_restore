#!/usr/bin/env node
import 'dotenv/config';
import { askAllAIs } from './server/services/ai-orchestrator.ts';

// Test the AI orchestrator directly
console.log('🧪 Testing AI Orchestrator...\n');
console.log('Loaded API keys:');
console.log('  ANTHROPIC:', process.env.ANTHROPIC_API_KEY ? '✅ Set' : '❌ Missing');
console.log('  OPENAI:', process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Missing');
console.log('  GOOGLE:', process.env.GOOGLE_API_KEY ? '✅ Set' : '❌ Missing');
console.log();

try {
  const results = await askAllAIs({
    prompt: 'What is 2+2? Answer in one word.',
    models: ['claude', 'gpt', 'gemini'],
    tags: ['test'],
  });

  console.log('✅ Results:\n');
  results.forEach((result) => {
    console.log(`${result.model.toUpperCase()}:`);
    console.log(`  Text: ${result.text || 'N/A'}`);
    console.log(`  Error: ${result.error || 'None'}`);
    console.log(`  Cost: $${result.cost_usd?.toFixed(6) || '0'}`);
    console.log(`  Time: ${result.elapsed_ms}ms\n`);
  });

  console.log('📊 Check logs/ai-budget.json and logs/multi-ai.jsonl for details');
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
