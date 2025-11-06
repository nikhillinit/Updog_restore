/**
 * Complete Working Example: Agent with Extended Thinking
 *
 * Demonstrates parallel integration pattern for mass adoption.
 * Run: tsx packages/agent-core/examples/thinking-integration-example.ts
 */

import { BaseAgent } from '../src/BaseAgent';
import { withThinking } from '../src/ThinkingMixin';

// ============================================================================
// Example 1: Test Repair Agent with Thinking
// ============================================================================

interface TestFailure {
  testName: string;
  error: string;
  stackTrace: string;
  codeSnippet: string;
}

interface RepairStrategy {
  diagnosis: string;
  fixes: string[];
  reasoning: string[];
  confidence: number;
  cost: number;
}

/**
 * Before: Simple pattern matching
 * After: Extended thinking with automatic complexity assessment
 */
class TestRepairAgentWithThinking extends withThinking(BaseAgent)<TestFailure, RepairStrategy> {
  constructor() {
    super({
      name: 'test-repair-thinking',
      enableConversationMemory: false,
      logLevel: 'info'
    });
  }

  protected async run(input: TestFailure): Promise<RepairStrategy> {
    try {
      // Step 1: Assess complexity and decide thinking depth
      const taskDescription = `${input.error}\n${input.stackTrace}`;
      const depth = await this.decideThinkingDepth(taskDescription);

      if (depth === 'skip') {
        // Simple failure, use pattern matching
        return this.simpleRepair(input);
      }

      // Step 2: Use extended thinking for complex failures
      const analysis = await this.think(
        `Analyze this test failure and provide a repair strategy:

        Test Name: ${input.testName}
        Error: ${input.error}
        Stack Trace: ${input.stackTrace}
        Code Context:
        ${input.codeSnippet}

        Provide:
        1. Root cause diagnosis
        2. Specific code fixes
        3. Why each fix is necessary`,
        {
          depth,
          context: `Testing framework: Vitest
                    UI library: React Testing Library
                    Type system: TypeScript strict mode
                    Common patterns: async/await, TanStack Query, mock implementations`
        }
      );

      // Step 3: Parse thinking results
      return {
        diagnosis: this.extractDiagnosis(analysis.response),
        fixes: this.extractFixes(analysis.response),
        reasoning: analysis.thinking, // Full thinking process for explainability
        confidence: this.calculateConfidence(analysis.thinking),
        cost: analysis.cost?.total_cost_usd || 0
      };
    } catch (error: any) {
      // CRITICAL: Always have a fallback when thinking fails
      this.logger.error('Extended thinking failed, falling back to simple repair', {
        error: error.message,
        error_name: error.name
      });
      return this.simpleRepair(input);
    }
  }

  // Fallback for simple failures
  private simpleRepair(input: TestFailure): RepairStrategy {
    if (input.error.includes('timeout')) {
      return {
        diagnosis: 'Async timeout',
        fixes: ['Add waitFor() wrapper', 'Increase timeout threshold'],
        reasoning: ['Pattern match: timeout errors'],
        confidence: 0.7,
        cost: 0
      };
    }

    return {
      diagnosis: 'Unknown failure type',
      fixes: ['Manual investigation required'],
      reasoning: ['No pattern match found'],
      confidence: 0.3,
      cost: 0
    };
  }

  private extractDiagnosis(response: string): string {
    // Parse "Root cause:" section from response
    const match = response.match(/Root cause:?\s*(.+?)(?:\n\n|$)/i);
    return match ? match[1].trim() : 'See full response';
  }

  private extractFixes(response: string): string[] {
    // Parse numbered fixes from response
    const fixes: string[] = [];
    const lines = response.split('\n');

    for (const line of lines) {
      const match = line.match(/^\s*\d+\.\s*(.+)/);
      if (match) {
        fixes.push(match[1].trim());
      }
    }

    return fixes.length > 0 ? fixes : [response];
  }

  private calculateConfidence(thinking: string[]): number {
    // More thinking blocks = higher confidence
    // Presence of code examples = higher confidence
    let confidence = Math.min(thinking.length / 10, 0.7);

    const hasCodeExamples = thinking.some(block =>
      block.includes('```') || block.includes('function') || block.includes('const')
    );

    if (hasCodeExamples) confidence += 0.2;

    return Math.min(confidence, 1.0);
  }
}

// ============================================================================
// Example 2: Code Reviewer with Adaptive Thinking
// ============================================================================

interface CodeSubmission {
  diff: string;
  description: string;
  files: string[];
}

interface CodeReview {
  approved: boolean;
  concerns: string[];
  suggestions: string[];
  architecturalIssues: string[];
  reasoning: string[];
  thinkingCost: number;
}

class CodeReviewerWithThinking extends withThinking(BaseAgent)<CodeSubmission, CodeReview> {
  constructor() {
    super({
      name: 'code-reviewer-thinking',
      logLevel: 'info'
    });
  }

  protected async run(input: CodeSubmission): Promise<CodeReview> {
    try {
      // Check if thinking is available
      const available = await this.isThinkingAvailable();
      if (!available) {
        this.logger.warn('Thinking API unavailable, using simple review');
        return this.simpleReview(input);
      }

      // Use analyze() for automatic depth selection
      const review = await this.analyze(
        `Review this code submission for architectural consistency:

        ${input.description}

        Changes:
        ${input.diff}

        Files modified: ${input.files.join(', ')}

        Check for:
        1. Adherence to CLAUDE.md conventions
        2. Proper use of waterfall helpers (applyWaterfallChange, changeWaterfallType)
        3. Fail-closed validation patterns (ADR-010)
        4. Stage normalization compliance (ADR-011)
        5. TypeScript strict mode compliance`,
        `Architecture: Express + React + PostgreSQL
         Patterns: Discriminated unions, immutable updates, explicit error handling
         Testing: Vitest with React Testing Library`
      );

      const budget = this.getThinkingBudget();
      this.logger.info('Code review completed', {
        thinking_blocks: review.thinking.length,
        cost: review.cost?.total_cost_usd,
        budget_remaining: budget.remaining
      });

      return {
        approved: this.shouldApprove(review.response),
        concerns: this.extractConcerns(review.thinking),
        suggestions: this.extractSuggestions(review.response),
        architecturalIssues: this.extractArchitecturalIssues(review.thinking),
        reasoning: review.thinking,
        thinkingCost: review.cost?.total_cost_usd || 0
      };
    } catch (error: any) {
      // CRITICAL: Always have a fallback for production resilience
      this.logger.error('Code review with thinking failed, using simple review', {
        error: error.message,
        error_name: error.name
      });
      return this.simpleReview(input);
    }
  }

  private simpleReview(input: CodeSubmission): CodeReview {
    // Fallback: basic linting checks
    const hasTests = input.files.some(f => f.includes('.test.'));

    return {
      approved: hasTests,
      concerns: hasTests ? [] : ['No test files included'],
      suggestions: ['Add comprehensive tests'],
      architecturalIssues: [],
      reasoning: ['Simple heuristic review (thinking unavailable)'],
      thinkingCost: 0
    };
  }

  private shouldApprove(response: string): boolean {
    // Look for explicit approval/rejection in response
    const lower = response.toLowerCase();
    if (lower.includes('approved') || lower.includes('looks good')) return true;
    if (lower.includes('rejected') || lower.includes('critical issue')) return false;
    return true; // Default approve with concerns
  }

  private extractConcerns(thinking: string[]): string[] {
    const concerns: string[] = [];
    for (const block of thinking) {
      if (block.toLowerCase().includes('concern') || block.toLowerCase().includes('issue')) {
        const lines = block.split('\n');
        concerns.push(...lines.filter(l => l.includes('concern') || l.includes('issue')));
      }
    }
    return concerns;
  }

  private extractSuggestions(response: string): string[] {
    const suggestions: string[] = [];
    const lines = response.split('\n');

    for (const line of lines) {
      if (line.toLowerCase().includes('suggest') || line.toLowerCase().includes('recommend')) {
        suggestions.push(line.trim());
      }
    }

    return suggestions;
  }

  private extractArchitecturalIssues(thinking: string[]): string[] {
    const issues: string[] = [];
    const keywords = ['architecture', 'pattern', 'design', 'structure'];

    for (const block of thinking) {
      const lower = block.toLowerCase();
      if (keywords.some(kw => lower.includes(kw)) && lower.includes('issue')) {
        issues.push(block);
      }
    }

    return issues;
  }
}

// ============================================================================
// Demo Runner
// ============================================================================

async function runThinkingIntegrationDemo() {
  // Environment validation
  if (!process.env['ANTHROPIC_API_KEY']) {
    console.error('❌ Error: ANTHROPIC_API_KEY environment variable not set');
    console.error('   Set it with: export ANTHROPIC_API_KEY=your-key-here');
    process.exit(1);
  }

  console.log('\n🧠 Extended Thinking Integration Demo\n');
  console.log('=' .repeat(60));

  // Example 1: Test Repair Agent
  console.log('\n📝 Example 1: Test Repair Agent with Thinking\n');

  const testRepairAgent = new TestRepairAgentWithThinking();

  const testFailure: TestFailure = {
    testName: 'should render dashboard with portfolio data',
    error: 'TypeError: Cannot read properties of undefined (reading \'map\')',
    stackTrace: `
      at DashboardCard.tsx:45:23
      at renderWithHooks (react-dom)
      at updateFunctionComponent (react-dom)
    `,
    codeSnippet: `
      function DashboardCard({ portfolio }) {
        return (
          <div>
            {portfolio.companies.map(company => (
              <CompanyCard key={company.id} company={company} />
            ))}
          </div>
        );
      }
    `
  };

  try {
    const result = await testRepairAgent.execute(testFailure);

    if (result.success && result.data) {
      console.log('✅ Test repair analysis completed');
      console.log(`   Diagnosis: ${result.data.diagnosis}`);
      console.log(`   Fixes (${result.data.fixes.length}):`);
      result.data.fixes.forEach((fix, i) => {
        console.log(`     ${i + 1}. ${fix}`);
      });
      console.log(`   Confidence: ${(result.data.confidence * 100).toFixed(0)}%`);
      console.log(`   Cost: $${result.data.cost.toFixed(4)}`);
      console.log(`   Thinking blocks: ${result.data.reasoning.length}`);
    }
  } catch (error: any) {
    console.error('❌ Test repair failed:', error.message);
  }

  // Example 2: Code Reviewer
  console.log('\n\n📋 Example 2: Code Reviewer with Adaptive Thinking\n');

  const codeReviewer = new CodeReviewerWithThinking();

  const codeSubmission: CodeSubmission = {
    description: 'Add new waterfall type for tiered carry structures',
    diff: `
      +export type WaterfallType = 'AMERICAN' | 'EUROPEAN' | 'TIERED';
      +
      +export interface TieredWaterfall {
      +  type: 'TIERED';
      +  tiers: Array<{ threshold: number; carryPercent: number }>;
      +}
    `,
    files: ['client/src/lib/waterfall.ts', 'shared/schemas/waterfall.ts']
  };

  try {
    const result = await codeReviewer.execute(codeSubmission);

    if (result.success && result.data) {
      console.log(`${result.data.approved ? '✅' : '⚠️'} Code review completed`);
      console.log(`   Approved: ${result.data.approved}`);
      console.log(`   Concerns (${result.data.concerns.length}):`);
      result.data.concerns.slice(0, 3).forEach(concern => {
        console.log(`     - ${concern}`);
      });
      console.log(`   Architectural issues: ${result.data.architecturalIssues.length}`);
      console.log(`   Thinking cost: $${result.data.thinkingCost.toFixed(4)}`);
      console.log(`   Reasoning depth: ${result.data.reasoning.length} thinking blocks`);
    }
  } catch (error: any) {
    console.error('❌ Code review failed:', error.message);
  }

  // Budget summary
  console.log('\n\n💰 Budget Summary\n');
  const testRepairBudget = testRepairAgent.getThinkingBudget();
  const reviewerBudget = codeReviewer.getThinkingBudget();

  console.log(`Test Repair Agent:`);
  console.log(`  Total budget: $${testRepairBudget.total.toFixed(2)}`);
  console.log(`  Spent: $${testRepairBudget.spent.toFixed(4)}`);
  console.log(`  Remaining: $${testRepairBudget.remaining.toFixed(4)}`);

  console.log(`\nCode Reviewer Agent:`);
  console.log(`  Total budget: $${reviewerBudget.total.toFixed(2)}`);
  console.log(`  Spent: $${reviewerBudget.spent.toFixed(4)}`);
  console.log(`  Remaining: $${reviewerBudget.remaining.toFixed(4)}`);

  console.log(`\n${  '='.repeat(60)}`);
  console.log('✨ Demo complete! Both agents integrated with zero breaking changes.\n');
}

// Run demo if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runThinkingIntegrationDemo().catch(console.error);
}

export {
  TestRepairAgentWithThinking,
  CodeReviewerWithThinking,
  runThinkingIntegrationDemo
};
