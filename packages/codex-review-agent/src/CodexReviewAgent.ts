import { BaseAgent, AgentConfig, AgentExecutionContext } from '@povc/agent-core';
import { withThinking } from '@povc/agent-core/ThinkingMixin';
import { watch } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';

export interface CodexReviewConfig extends AgentConfig {
  watchPaths?: string[];
  excludePatterns?: RegExp[];
  reviewOnSave?: boolean;
  mcpServerUrl?: string;
  aiProviders?: ('gemini' | 'grok' | 'openai' | 'deepseek')[];
  debounceMs?: number;
}

export interface FileChangeEvent {
  filePath: string;
  eventType: 'change' | 'rename';
  timestamp: number;
}

export interface ReviewResult {
  filePath: string;
  issues: ReviewIssue[];
  providers: string[];
  consensus?: string;
  timestamp: number;
}

export interface ReviewIssue {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  message: string;
  line?: number;
  provider: string;
  suggestion?: string;
}

/**
 * CodexReviewAgent - Real-time code review agent using MCP multi-AI
 *
 * Features:
 * - File-watch for automatic reviews on save
 * - Multi-AI consensus reviews (Gemini, Grok, OpenAI, DeepSeek)
 * - Integration with existing MCP server
 * - Smart filtering (excludes node_modules, dist, etc.)
 * - Debounced reviews to prevent spam
 */
export class CodexReviewAgent extends withThinking(BaseAgent)<FileChangeEvent, ReviewResult> {
  protected readonly reviewConfig: CodexReviewConfig;
  private watchers: Map<string, ReturnType<typeof watch>> = new Map();
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private lastReviewTimes: Map<string, number> = new Map();

  constructor(config: CodexReviewConfig) {
    super({
      ...config,
      // Enable native memory integration
      enableNativeMemory: true,
      enablePatternLearning: true,
      tenantId: config.tenantId || 'agent:codex-review',
      memoryScope: 'project', // Remember code review patterns and common issues
    });
    this.reviewConfig = {
      watchPaths: ['client/src', 'server', 'shared'],
      excludePatterns: [
        /node_modules/,
        /\.git/,
        /dist/,
        /build/,
        /\.next/,
        /coverage/,
        /\.vscode/,
        /\.idea/,
        /\.d\.ts$/,
        /\.map$/,
      ],
      reviewOnSave: true,
      aiProviders: ['gemini', 'openai', 'deepseek'], // Use 3 for consensus
      debounceMs: 1000, // Wait 1s after last change before reviewing
      ...config,
    };
  }

  /**
   * Start watching files for changes
   */
  async startWatching(): Promise<void> {
    this.logger.info('Starting Codex Review Agent file watcher', {
      watchPaths: this.reviewConfig.watchPaths,
      providers: this.reviewConfig.aiProviders,
    });

    for (const watchPath of this.reviewConfig.watchPaths || []) {
      const absolutePath = path.resolve(process.cwd(), watchPath);

      const watcher = watch(absolutePath, { recursive: true }, (eventType, filename) => {
        if (!filename) return;

        const filePath = path.join(watchPath, filename);

        // Filter out excluded paths
        if (this.shouldExclude(filePath)) {
          return;
        }

        // Only review TypeScript/JavaScript files
        if (!this.isReviewableFile(filePath)) {
          return;
        }

        this.logger.debug('File change detected', { filePath, eventType });

        // Debounce reviews
        this.debounceReview(filePath, eventType as 'change' | 'rename');
      });

      this.watchers.set(watchPath, watcher);
      this.logger.info(`Watching: ${absolutePath}`);
    }

    this.logger.info('Codex Review Agent is now watching for changes');
  }

  /**
   * Stop watching files
   */
  async stopWatching(): Promise<void> {
    this.logger.info('Stopping Codex Review Agent');

    for (const [path, watcher] of this.watchers.entries()) {
      watcher.close();
      this.logger.info(`Stopped watching: ${path}`);
    }

    this.watchers.clear();

    // Clear any pending debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  /**
   * Perform code review using multi-AI consensus
   */
  protected override async performOperation(
    input: FileChangeEvent,
    context: AgentExecutionContext
  ): Promise<ReviewResult> {
    const { filePath } = input;

    this.logger.info('Starting code review', { filePath, context });

    // Read file content
    const content = await this.readFileContent(filePath);

    // Get reviews from all configured AI providers
    const reviews = await this.getMultiAIReviews(filePath, content);

    // Aggregate issues
    const allIssues = reviews.flatMap(r => r.issues);

    // Generate consensus
    const consensus = this.generateConsensus(reviews);

    const result: ReviewResult = {
      filePath,
      issues: allIssues,
      providers: this.reviewConfig.aiProviders || [],
      consensus,
      timestamp: Date.now(),
    };

    // Display results
    this.displayReviewResults(result);

    return result;
  }

  /**
   * Get reviews from multiple AI providers via MCP
   */
  private async getMultiAIReviews(
    filePath: string,
    content: string
  ): Promise<Array<{ provider: string; issues: ReviewIssue[] }>> {
    const reviews: Array<{ provider: string; issues: ReviewIssue[] }> = [];

    for (const provider of this.reviewConfig.aiProviders || []) {
      try {
        this.logger.debug(`Requesting review from ${provider}`, { filePath });

        // Call MCP code review function
        const issues = await this.callMCPCodeReview(provider, filePath, content);

        reviews.push({ provider, issues });
      } catch (error) {
        this.logger.warn(`Failed to get review from ${provider}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return reviews;
  }

  /**
   * Call AI code review using in-repo orchestrator
   * Uses the new AI orchestrator API instead of external MCP server
   */
  private async callMCPCodeReview(
    provider: string,
    filePath: string,
    content: string
  ): Promise<ReviewIssue[]> {
    this.logger.debug(`Requesting ${provider} code review via in-repo orchestrator`, { filePath });

    try {
      // Call our in-repo AI orchestrator API
      const response = await fetch('http://localhost:5000/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Review this code for security issues, bugs, and code quality. Provide specific, actionable feedback.

File: ${filePath}

\`\`\`
${content}
\`\`\`

Focus on:
- Security vulnerabilities
- Performance issues
- Code quality and maintainability
- TypeScript best practices

Format each issue as: [SEVERITY] Message`,
          models: [provider as 'claude' | 'gpt' | 'gemini' | 'deepseek'],
          tags: ['code-review', 'codex-agent'],
        }),
      });

      if (!response.ok) {
        throw new Error(`AI orchestrator returned ${response.status}`);
      }

      const data = await response.json();
      const result = data.results?.[0];

      if (result?.error) {
        this.logger.warn(`${provider} returned error: ${result.error}`);
        return [];
      }

      if (!result?.text) {
        return [];
      }

      // Parse AI response into structured issues
      return this.parseAIResponse(result.text, provider);
    } catch (error) {
      this.logger.error(`Failed to get ${provider} review`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Parse AI response text into structured review issues
   */
  private parseAIResponse(text: string, provider: string): ReviewIssue[] {
    const issues: ReviewIssue[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Parse format: [SEVERITY] Message or SEVERITY: Message
      const severityMatch = trimmed.match(/^\[?(CRITICAL|HIGH|MEDIUM|LOW|INFO)\]?:?\s*(.+)/i);
      if (severityMatch) {
        const [, severityStr, message] = severityMatch;
        const severity = severityStr.toLowerCase() as ReviewIssue['severity'];

        issues.push({
          severity,
          message: message.trim(),
          provider,
        });
      } else if (trimmed.startsWith('-') || trimmed.startsWith('•') || /^\d+\./.test(trimmed)) {
        // Bullet points or numbered lists - treat as medium severity
        const message = trimmed.replace(/^[-•]\s*|\d+\.\s*/, '').trim();
        if (message) {
          issues.push({
            severity: 'medium',
            message,
            provider,
          });
        }
      }
    }

    return issues;
  }

  /**
   * Generate consensus from multiple AI reviews
   */
  private generateConsensus(
    reviews: Array<{ provider: string; issues: ReviewIssue[] }>
  ): string {
    const totalIssues = reviews.reduce((sum, r) => sum + r.issues.length, 0);
    const avgIssues = totalIssues / reviews.length;

    const criticalCount = reviews.flatMap(r => r.issues).filter(i => i.severity === 'critical').length;
    const highCount = reviews.flatMap(r => r.issues).filter(i => i.severity === 'high').length;

    if (criticalCount > 0) {
      return `⛔ CRITICAL: Found ${criticalCount} critical issue(s) - immediate action required`;
    }

    if (highCount > 0) {
      return `⚠️  HIGH: Found ${highCount} high-priority issue(s) - review recommended`;
    }

    if (avgIssues > 3) {
      return `📝 MODERATE: Found ${totalIssues} issues across ${reviews.length} reviews`;
    }

    return `✅ GOOD: Code looks good with minimal issues`;
  }

  /**
   * Display review results in console
   */
  private displayReviewResults(result: ReviewResult): void {
    console.log('\n' + '='.repeat(80));
    console.log(`📊 Codex Review: ${result.filePath}`);
    console.log('='.repeat(80));

    if (result.consensus) {
      console.log(`\n${result.consensus}\n`);
    }

    if (result.issues.length === 0) {
      console.log('✅ No issues found\n');
      return;
    }

    // Group by severity
    const critical = result.issues.filter(i => i.severity === 'critical');
    const high = result.issues.filter(i => i.severity === 'high');
    const medium = result.issues.filter(i => i.severity === 'medium');
    const low = result.issues.filter(i => i.severity === 'low');
    const info = result.issues.filter(i => i.severity === 'info');

    const printIssues = (issues: ReviewIssue[], title: string, icon: string) => {
      if (issues.length === 0) return;

      console.log(`\n${icon} ${title} (${issues.length}):`);
      issues.forEach((issue, idx) => {
        console.log(`  ${idx + 1}. [${issue.provider}] ${issue.message}`);
        if (issue.suggestion) {
          console.log(`     💡 ${issue.suggestion}`);
        }
      });
    };

    printIssues(critical, 'CRITICAL', '🔴');
    printIssues(high, 'HIGH', '🟠');
    printIssues(medium, 'MEDIUM', '🟡');
    printIssues(low, 'LOW', '🔵');
    printIssues(info, 'INFO', 'ℹ️');

    console.log('\n' + '='.repeat(80) + '\n');
  }

  /**
   * Read file content
   */
  private async readFileContent(filePath: string): Promise<string> {
    try {
      const absolutePath = path.resolve(process.cwd(), filePath);
      return await readFile(absolutePath, 'utf-8');
    } catch (error) {
      this.logger.error('Failed to read file', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Failed to read file: ${filePath}`);
    }
  }

  /**
   * Debounce review to avoid spamming on rapid changes
   */
  private debounceReview(filePath: string, eventType: 'change' | 'rename'): void {
    // Clear existing timer
    const existingTimer = this.debounceTimers.get(filePath);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
      this.triggerReview(filePath, eventType);
      this.debounceTimers.delete(filePath);
    }, this.reviewConfig.debounceMs || 1000);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Trigger review for a file
   */
  private async triggerReview(filePath: string, eventType: 'change' | 'rename'): Promise<void> {
    const event: FileChangeEvent = {
      filePath,
      eventType,
      timestamp: Date.now(),
    };

    try {
      await this.execute(event, 'file-review');
    } catch (error) {
      this.logger.error('Review failed', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check if file should be excluded from reviews
   */
  private shouldExclude(filePath: string): boolean {
    for (const pattern of this.reviewConfig.excludePatterns || []) {
      if (pattern.test(filePath)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if file is reviewable (TS/JS files)
   */
  private isReviewableFile(filePath: string): boolean {
    const ext = path.extname(filePath);
    return ['.ts', '.tsx', '.js', '.jsx'].includes(ext);
  }

  /**
   * Get execution metadata
   */
  protected override getExecutionMetadata(input: FileChangeEvent): Record<string, unknown> {
    return {
      filePath: input.filePath,
      eventType: input.eventType,
      timestamp: input.timestamp,
      providers: this.reviewConfig.aiProviders,
    };
  }
}
