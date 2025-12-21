/**
 * Demo: Conversation Memory for Multi-Agent Workflows
 *
 * This demo shows how conversation memory enables cross-tool collaboration:
 * 1. Analyzer agent starts conversation and analyzes code
 * 2. Fixer agent continues the conversation and applies fixes
 * 3. Validator agent verifies the fixes using full conversation context
 *
 * Run: npx tsx demo-conversation-memory.ts
 */

import type {
  AgentExecutionContext} from './src/index';
import {
  BaseAgent,
  getThread,
  buildConversationHistory,
  clearAllThreads,
} from './src/index';

// ============================================================================
// Demo Agents
// ============================================================================

interface AnalyzerInput {
  files: string[];
}

interface AnalyzerOutput {
  issues: Array<{
    file: string;
    line: number;
    severity: 'error' | 'warning';
    message: string;
  }>;
}

class AnalyzerAgent extends BaseAgent<AnalyzerInput, AnalyzerOutput> {
  constructor() {
    super({
      name: 'analyzer',
      enableConversationMemory: true,
    });
  }

  protected async performOperation(
    input: AnalyzerInput,
    context: AgentExecutionContext
  ): Promise<AnalyzerOutput> {
    this.logger.info('Analyzing files...', {
      files: input.files,
      hasHistory: !!context.conversationHistory,
    });

    // Simulate analysis
    return {
      issues: [
        {
          file: input.files[0],
          line: 42,
          severity: 'error',
          message: 'Type mismatch: expected string, got number',
        },
        {
          file: input.files[0],
          line: 55,
          severity: 'warning',
          message: 'Unused variable "oldData"',
        },
      ],
    };
  }
}

interface FixerInput {
  issues: AnalyzerOutput['issues'];
}

interface FixerOutput {
  fixedFiles: string[];
  changes: Array<{
    file: string;
    description: string;
  }>;
}

class FixerAgent extends BaseAgent<FixerInput, FixerOutput> {
  constructor() {
    super({
      name: 'fixer',
      enableConversationMemory: true,
    });
  }

  protected async performOperation(
    input: FixerInput,
    context: AgentExecutionContext
  ): Promise<FixerOutput> {
    this.logger.info('Applying fixes...', {
      issueCount: input.issues.length,
      hasHistory: !!context.conversationHistory,
    });

    if (context.conversationHistory) {
      this.logger.info('Fixer has access to analyzer context', {
        historyLength: context.conversationHistory.length,
      });
    }

    // Simulate fixes
    return {
      fixedFiles: Array.from(new Set(input.issues.map((i) => i.file))),
      changes: [
        {
          file: 'test.ts',
          description: 'Fixed type mismatch on line 42',
        },
        {
          file: 'test.ts',
          description: 'Removed unused variable on line 55',
        },
      ],
    };
  }
}

interface ValidatorInput {
  files: string[];
}

interface ValidatorOutput {
  status: 'pass' | 'fail';
  newIssues: number;
  message: string;
}

class ValidatorAgent extends BaseAgent<ValidatorInput, ValidatorOutput> {
  constructor() {
    super({
      name: 'validator',
      enableConversationMemory: true,
    });
  }

  protected async performOperation(
    input: ValidatorInput,
    context: AgentExecutionContext
  ): Promise<ValidatorOutput> {
    this.logger.info('Validating fixes...', {
      files: input.files,
      hasHistory: !!context.conversationHistory,
    });

    if (context.conversationHistory) {
      this.logger.info('Validator has access to full conversation', {
        historyLength: context.conversationHistory.length,
      });
    }

    // Simulate validation (all issues fixed)
    return {
      status: 'pass',
      newIssues: 0,
      message: 'All issues resolved. Code is clean!',
    };
  }
}

// ============================================================================
// Demo Workflow
// ============================================================================

async function runMultiAgentWorkflow() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  Multi-Agent Workflow with Conversation Memory       ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  // Clear any previous conversations
  await clearAllThreads();

  // Create agents
  const analyzer = new AnalyzerAgent();
  const fixer = new FixerAgent();
  const validator = new ValidatorAgent();

  // Step 1: Analyzer starts conversation
  console.log('📊 Step 1: Analyzer agent analyzes code\n');

  const analyzerResult = await analyzer.execute(
    { files: ['test.ts'] },
    'analyze',
    {
      files: ['test.ts'],
    }
  );

  console.log('✅ Analyzer found issues:');
  console.log(JSON.stringify(analyzerResult.data, null, 2));
  console.log(`\n🔗 Created thread: ${analyzerResult.continuationId}\n`);

  if (!analyzerResult.continuationId) {
    console.error('❌ No continuation ID - conversation memory not enabled');
    return;
  }

  // Step 2: Fixer continues the conversation
  console.log('🔧 Step 2: Fixer agent applies fixes (using analyzer context)\n');

  const fixerResult = await fixer.execute(
    { issues: analyzerResult.data?.issues || [] },
    'fix',
    {
      continuationId: analyzerResult.continuationId,
      files: ['test.ts'],
    }
  );

  console.log('✅ Fixer applied changes:');
  console.log(JSON.stringify(fixerResult.data, null, 2));
  console.log(`\n🔗 Continuing thread: ${fixerResult.continuationId}\n`);

  // Step 3: Validator verifies using FULL conversation context
  console.log(
    '✓ Step 3: Validator verifies fixes (with analyzer + fixer context)\n'
  );

  const validatorResult = await validator.execute(
    { files: ['test.ts'] },
    'validate',
    {
      continuationId: fixerResult.continuationId,
      files: ['test.ts'],
    }
  );

  console.log('✅ Validation result:');
  console.log(JSON.stringify(validatorResult.data, null, 2));

  // Show the full conversation thread
  console.log('\n📜 Full Conversation History:');
  console.log('═'.repeat(60));

  const thread = await getThread(validatorResult.continuationId!);
  if (thread) {
    console.log(`\nThread ID: ${thread.threadId}`);
    console.log(`Tool: ${thread.toolName}`);
    console.log(`Total Turns: ${thread.turns.length}`);
    console.log(`Created: ${thread.createdAt}`);

    console.log('\nTurns:');
    thread.turns.forEach((turn, idx) => {
      console.log(`\n  Turn ${idx + 1} (${turn.role}):`);
      console.log(`    Tool: ${turn.toolName}`);
      console.log(`    Model: ${turn.modelName || 'N/A'}`);
      console.log(
        `    Content: ${turn.content.substring(0, 100)}...`
      );
      if (turn.files && turn.files.length > 0) {
        console.log(`    Files: ${turn.files.join(', ')}`);
      }
    });

    // Show the formatted conversation history that would be passed to next agent
    console.log('\n\n📋 Formatted History (as seen by next agent):');
    console.log('═'.repeat(60));

    const history = await buildConversationHistory(thread, {
      includeFiles: false, // Don't actually read files in demo
      maxHistoryTokens: 2000,
    });

    console.log(`${history.history.substring(0, 1000)  }...`);
    console.log(`\nTotal tokens: ${history.tokens}`);
  }

  console.log('\n\n✨ Demo complete!');
  console.log('═'.repeat(60));
  console.log('Key Takeaways:');
  console.log('  • Each agent sees the full conversation history');
  console.log('  • Files are preserved across agent handoffs');
  console.log('  • Newest file references take priority');
  console.log('  • Token budgets prevent context window overflow');
  console.log('  • Cross-tool collaboration works seamlessly');
}

// ============================================================================
// Run Demo
// ============================================================================

runMultiAgentWorkflow().catch((error) => {
  console.error('Demo failed:', error);
  process.exit(1);
});
