/**
 * Example: Memory-Enabled Agent with Pattern Learning
 *
 * This example demonstrates how to create an agent that leverages:
 * - Native Memory Tool integration (HybridMemoryManager)
 * - Pattern Learning Engine for cross-session learning
 * - Tool Handler for processing Claude API memory operations
 * - Tenant Context for multi-user/multi-project isolation
 *
 * Based on TestRepairAgent pattern with full memory integration.
 */

import type { AgentConfig, AgentExecutionContext } from '../src/BaseAgent';
import { BaseAgent } from '../src/BaseAgent';

/**
 * Input type for code repair operations
 */
interface CodeRepairInput {
  filePath: string;
  errorMessage: string;
  code?: string;
  testName?: string;
}

/**
 * Output type for repair results
 */
interface CodeRepairOutput {
  success: boolean;
  fixedCode?: string;
  explanation: string;
  patternsUsed: string[];
  newPatternsLearned: number;
}

/**
 * Memory-enabled code repair agent with pattern learning
 *
 * This agent:
 * 1. Checks learned patterns for similar errors
 * 2. Applies known fixes if patterns match
 * 3. Records new successful repairs as patterns
 * 4. Stores context in hybrid memory (Redis + Native)
 * 5. Uses tenant isolation for multi-project support
 */
export class MemoryEnabledCodeRepairAgent extends BaseAgent<CodeRepairInput, CodeRepairOutput> {
  constructor(config?: Partial<AgentConfig>) {
    super({
      name: 'MemoryEnabledCodeRepairAgent',
      maxRetries: 2,
      logLevel: 'info',

      // Enable native memory integration
      enableNativeMemory: true,
      enablePatternLearning: true,
      tenantId: config?.tenantId || 'example:code-repair',
      memoryScope: 'project',  // Share learnings across project sessions

      ...config,
    });

    this.logger.info('MemoryEnabledCodeRepairAgent initialized', {
      tenantId: this.config.tenantId,
      memoryScope: this.config.memoryScope,
      patternLearning: !!this.patternLearning,
      hybridMemory: !!this.memoryManager,
    });
  }

  /**
   * Main repair operation with pattern learning
   */
  protected async performOperation(
    input: CodeRepairInput,
    context: AgentExecutionContext
  ): Promise<CodeRepairOutput> {
    this.logger.info('Starting code repair with pattern learning', {
      filePath: input.filePath,
      error: input.errorMessage.substring(0, 100),
    });

    const patternsUsed: string[] = [];
    let newPatternsLearned = 0;

    // Step 1: Check for cached fixes in memory
    const cacheKey = `fix:${input.filePath}:${this.hashError(input.errorMessage)}`;
    const cachedFix = await this.getMemory<{ code: string; explanation: string }>(cacheKey);

    if (cachedFix) {
      this.logger.info('Found cached fix in hybrid memory', { cacheKey });
      return {
        success: true,
        fixedCode: cachedFix.code,
        explanation: `Applied cached fix: ${cachedFix.explanation}`,
        patternsUsed: ['cached-fix'],
        newPatternsLearned: 0,
      };
    }

    // Step 2: Get learned patterns for similar errors
    const errorContext = this.extractErrorContext(input.errorMessage);
    const learnedPatterns = await this.getLearnedPatterns(errorContext);

    if (learnedPatterns.length > 0) {
      this.logger.info('Found learned patterns for error type', {
        errorContext,
        patternCount: learnedPatterns.length,
      });
      patternsUsed.push(...learnedPatterns.map((p, i) => `pattern-${i + 1}`));
    }

    // Step 3: Apply repair logic (simulated for example)
    const repairResult = await this.applyRepair(input, learnedPatterns);

    if (repairResult.success) {
      // Step 4: Record successful pattern for future use
      await this.recordSuccessPattern(
        errorContext,
        `Fix for ${input.filePath}: ${repairResult.explanation}`,
        `Repaired successfully using: ${repairResult.strategy}`
      );
      newPatternsLearned++;

      // Step 5: Cache the fix in hybrid memory
      await this.storeMemory(
        cacheKey,
        {
          code: repairResult.fixedCode,
          explanation: repairResult.explanation,
        },
        'project'  // Share across sessions
      );

      this.logger.info('Repair successful and pattern recorded', {
        patternsUsed: patternsUsed.length,
        newPatternsLearned,
        cached: true,
      });

      return {
        success: true,
        fixedCode: repairResult.fixedCode,
        explanation: repairResult.explanation,
        patternsUsed,
        newPatternsLearned,
      };
    } else {
      // Record failure pattern to avoid repeating unsuccessful approaches
      await this.recordFailurePattern(
        errorContext,
        `Attempted fix: ${repairResult.attemptedStrategy}`,
        `Failed: ${repairResult.error}`
      );

      return {
        success: false,
        explanation: `Could not repair: ${repairResult.error}`,
        patternsUsed,
        newPatternsLearned,
      };
    }
  }

  /**
   * Extract error context for pattern matching
   */
  private extractErrorContext(errorMessage: string): string {
    // Extract error type (e.g., "TypeError", "ReferenceError")
    const errorTypeMatch = errorMessage.match(/^(\w+Error)/);
    const errorType = errorTypeMatch ? errorTypeMatch[1] : 'UnknownError';

    // Extract key phrases
    const keyPhrase = errorMessage.substring(0, 100).replace(/[^\w\s]/g, ' ').trim();

    return `${errorType}: ${keyPhrase}`;
  }

  /**
   * Hash error message for cache keys
   */
  private hashError(errorMessage: string): string {
    // Simple hash for example purposes
    let hash = 0;
    for (let i = 0; i < errorMessage.length; i++) {
      const char = errorMessage.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Apply repair logic with learned patterns
   * (Simulated for example - replace with actual repair logic)
   */
  private async applyRepair(
    input: CodeRepairInput,
    learnedPatterns: string[]
  ): Promise<{
    success: boolean;
    fixedCode?: string;
    explanation?: string;
    strategy?: string;
    attemptedStrategy?: string;
    error?: string;
  }> {
    // Simulate checking different repair strategies
    const strategies = [
      'type-annotation-fix',
      'import-statement-fix',
      'variable-declaration-fix',
      ...learnedPatterns,
    ];

    for (const strategy of strategies) {
      this.logger.debug('Trying repair strategy', { strategy });

      // Simulate repair attempt (replace with actual logic)
      if (this.simulateRepairAttempt(input.errorMessage, strategy)) {
        return {
          success: true,
          fixedCode: input.code ? this.applyFix(input.code, strategy) : 'FIXED_CODE',
          explanation: `Fixed using ${strategy}`,
          strategy,
        };
      }
    }

    return {
      success: false,
      attemptedStrategy: strategies.join(', '),
      error: 'No successful repair strategy found',
    };
  }

  /**
   * Simulate repair attempt (replace with actual logic)
   */
  private simulateRepairAttempt(errorMessage: string, strategy: string): boolean {
    // Simulate: type annotation fixes work for type errors
    if (errorMessage.includes('Type') && strategy === 'type-annotation-fix') {
      return true;
    }

    // Simulate: import fixes work for import errors
    if (errorMessage.includes('import') && strategy === 'import-statement-fix') {
      return true;
    }

    // Learned patterns have 70% success rate
    if (strategy.startsWith('pattern-')) {
      return Math.random() > 0.3;
    }

    return false;
  }

  /**
   * Apply fix to code (simulated)
   */
  private applyFix(code: string, strategy: string): string {
    return `${code}\n// Fixed using ${strategy}`;
  }

  /**
   * Validate input before execution
   */
  protected async validateInput(input: CodeRepairInput): Promise<void> {
    if (!input.filePath) {
      throw new Error('filePath is required');
    }
    if (!input.errorMessage) {
      throw new Error('errorMessage is required');
    }
  }
}

/**
 * Example Usage
 */
async function exampleUsage() {
  // Create agent with tenant isolation
  const agent = new MemoryEnabledCodeRepairAgent({
    tenantId: 'user123:project-alpha',  // Isolate learnings per user/project
  });

  // Example 1: First repair (no patterns yet)
  console.log('\n--- Example 1: First Type Error ---');
  const result1 = await agent.execute({
    filePath: 'src/utils.ts',
    errorMessage: 'TypeError: Cannot read property "name" of undefined',
    code: 'function greet(user) { return user.name; }',
    testName: 'utils.test.ts',
  });

  console.log('Result 1:', {
    success: result1.success,
    patternsUsed: result1.data?.patternsUsed,
    newPatternsLearned: result1.data?.newPatternsLearned,
  });

  // Example 2: Similar error (should use cached pattern)
  console.log('\n--- Example 2: Similar Type Error (should use learned pattern) ---');
  const result2 = await agent.execute({
    filePath: 'src/auth.ts',
    errorMessage: 'TypeError: Cannot read property "email" of undefined',
    code: 'function sendEmail(user) { return user.email; }',
  });

  console.log('Result 2:', {
    success: result2.success,
    patternsUsed: result2.data?.patternsUsed,
    newPatternsLearned: result2.data?.newPatternsLearned,
    explanation: result2.data?.explanation,
  });

  // Example 3: Different error type
  console.log('\n--- Example 3: Import Error ---');
  const result3 = await agent.execute({
    filePath: 'src/database.ts',
    errorMessage: 'ReferenceError: Cannot find module "pg"',
    code: 'import { Client } from "pg";',
  });

  console.log('Result 3:', {
    success: result3.success,
    patternsUsed: result3.data?.patternsUsed,
    newPatternsLearned: result3.data?.newPatternsLearned,
  });

  // Example 4: Using continuation (same session)
  console.log('\n--- Example 4: Continuation in Same Session ---');
  const result4 = await agent.execute(
    {
      filePath: 'src/utils.ts',
      errorMessage: 'TypeError: Cannot read property "name" of undefined',
      code: 'function greet(user) { return user.name; }',
    },
    'repair',
    {
      continuationId: result1.continuationId,  // Continue from result1
    }
  );

  console.log('Result 4:', {
    success: result4.success,
    cached: result4.data?.patternsUsed.includes('cached-fix'),
  });

  // Get agent status
  console.log('\n--- Agent Status ---');
  const status = agent.getStatus();
  console.log('Status:', {
    name: status.name,
    cacheStats: status.cacheStats,
    memoryEnabled: !!agent['memoryManager'],
    patternLearningEnabled: !!agent['patternLearning'],
  });
}

// Run examples if executed directly
if (require.main === module) {
  exampleUsage()
    .then(() => console.log('\nExamples completed successfully'))
    .catch((error) => console.error('\nExample failed:', error));
}

export { exampleUsage };
