import { Stagehand } from '@browserbasehq/stagehand';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import type {
  ReviewModel,
  ReviewResult,
  ReviewContext,
  ReviewIssue,
} from './types';

/**
 * Configuration options for ChatGPTProAgent
 */
export interface ChatGPTProAgentConfig {
  /**
   * Directory for browser session data and lock files
   */
  sessionDir: string;

  /**
   * OpenAI API key for Stagehand's self-healing selectors
   */
  openaiApiKey: string;

  /**
   * Model to use (default: gpt-5.2)
   */
  model?: string;

  /**
   * Run browser in headless mode (default: false for debugging)
   */
  headless?: boolean;

  /**
   * Navigation timeout in milliseconds (default: 30000)
   */
  timeoutMs?: number;

  /**
   * Session lock timeout in milliseconds (default: 30 minutes)
   */
  lockTimeoutMs?: number;
}

/**
 * Parsed response structure
 */
interface ParsedResponse {
  issues: ReviewIssue[];
  summary: string;
}

/**
 * Session lock data
 */
interface LockData {
  pid: number;
  createdAt: number;
}

/**
 * Zod schema for Stagehand extract response
 */
const ExtractResponseSchema = z.object({
  response: z.string(),
  hasCode: z.boolean().optional(),
});

/**
 * ChatGPT Pro Agent using Stagehand v3 browser automation
 *
 * Uses @browserbasehq/stagehand for resilient browser automation
 * with self-healing selectors powered by GPT-4o.
 */
export class ChatGPTProAgent implements ReviewModel {
  readonly provider = 'chatgpt';
  readonly model: string;

  private config: ChatGPTProAgentConfig;
  private stagehand: Stagehand | null = null;
  private ready = false;

  constructor(config: ChatGPTProAgentConfig) {
    this.config = config;
    this.model = config.model ?? 'gpt-5.2';
    this.ensureSessionDir();
  }

  /**
   * Initialize the agent (acquire lock, start browser, check auth)
   */
  async initialize(): Promise<void> {
    if (this.ready) return;

    // Acquire session lock
    await this.acquireSessionLock();

    try {
      // Initialize Stagehand
      this.stagehand = new Stagehand({
        env: 'LOCAL',
        localBrowserLaunchOptions: {
          headless: this.config.headless ?? false,
          userDataDir: path.join(this.config.sessionDir, 'chrome-profile'),
        },
        modelName: 'gpt-4o',
        modelApiKey: this.config.openaiApiKey,
      });

      await this.stagehand.init();

      // Navigate to ChatGPT and check auth status
      await this.stagehand.page.goto('https://chatgpt.com/', {
        waitUntil: 'networkidle',
        timeout: this.config.timeoutMs ?? 30000,
      });

      // Check if we're logged in
      const currentUrl = this.stagehand.page.url();
      if (currentUrl.includes('auth0.openai.com') || currentUrl.includes('/auth/')) {
        console.log('ChatGPT requires login. Please log in manually in the browser window.');
        // In a real implementation, we'd wait for user to complete login
        // For now, we still mark as ready and let review() handle auth checks
      }

      this.ready = true;
    } catch (error) {
      // Release lock on failure
      await this.releaseSessionLock();
      throw error;
    }
  }

  /**
   * Check if agent is ready
   */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * Review code using ChatGPT Pro
   */
  async review(code: string, context?: ReviewContext): Promise<ReviewResult> {
    if (!this.ready || !this.stagehand) {
      throw new Error('ChatGPTProAgent not initialized. Call initialize() first.');
    }

    const prompt = this.buildPrompt(code, context);
    const startTime = Date.now();

    // Navigate to ChatGPT if not already there
    const currentUrl = this.stagehand.page.url();
    if (!currentUrl.includes('chatgpt.com')) {
      await this.stagehand.page.goto('https://chatgpt.com/', {
        waitUntil: 'networkidle',
        timeout: this.config.timeoutMs ?? 30000,
      });
    }

    // Type the prompt using Stagehand's act() with natural language
    await this.stagehand.act(`type "${this.escapeForAct(prompt)}" into the message input field`);

    // Send the message
    await this.stagehand.act('click the send message button');

    // Wait for response to complete
    await this.waitForResponse();

    // Extract the response using Stagehand's extract()
    const extracted = await this.stagehand.extract(
      'Extract the complete assistant response text from the last message',
      ExtractResponseSchema
    );

    const parsed = this.parseResponse(extracted.response);

    return {
      provider: this.provider,
      model: this.model,
      issues: parsed.issues,
      summary: parsed.summary,
      timestamp: startTime,
      raw: extracted.response,
    };
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    if (this.stagehand) {
      try {
        await this.stagehand.close();
      } catch {
        // Ignore close errors
      }
      this.stagehand = null;
    }

    await this.releaseSessionLock();
    this.ready = false;
  }

  /**
   * Ensure session directory exists
   */
  private ensureSessionDir(): void {
    if (!fs.existsSync(this.config.sessionDir)) {
      fs.mkdirSync(this.config.sessionDir, { recursive: true });
    }
  }

  /**
   * Get lock file path
   */
  private getLockPath(): string {
    return path.join(this.config.sessionDir, 'bridge.lock');
  }

  /**
   * Acquire session lock to prevent concurrent browser sessions
   */
  private async acquireSessionLock(): Promise<void> {
    const lockPath = this.getLockPath();
    const lockTimeout = this.config.lockTimeoutMs ?? 30 * 60 * 1000; // 30 minutes

    if (fs.existsSync(lockPath)) {
      try {
        const lockData: LockData = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
        const isStale = Date.now() - lockData.createdAt > lockTimeout;
        const processExists = this.isProcessRunning(lockData.pid);

        if (!isStale && processExists) {
          throw new Error('Pro Bridge session already running. Close the other instance first.');
        }

        // Lock is stale or process doesn't exist - remove it
        fs.unlinkSync(lockPath);
      } catch (error) {
        if ((error as Error).message.includes('session already running')) {
          throw error;
        }
        // Lock file is corrupted - remove it
        try {
          fs.unlinkSync(lockPath);
        } catch {
          // Ignore
        }
      }
    }

    // Create new lock
    const lockData: LockData = {
      pid: process.pid,
      createdAt: Date.now(),
    };
    fs.writeFileSync(lockPath, JSON.stringify(lockData));
  }

  /**
   * Release session lock
   */
  private async releaseSessionLock(): Promise<void> {
    const lockPath = this.getLockPath();
    try {
      if (fs.existsSync(lockPath)) {
        const lockData: LockData = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
        // Only remove if it's our lock
        if (lockData.pid === process.pid) {
          fs.unlinkSync(lockPath);
        }
      }
    } catch {
      // Ignore errors
    }
  }

  /**
   * Check if a process is running
   */
  private isProcessRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build the review prompt with context
   */
  private buildPrompt(code: string, context?: ReviewContext): string {
    const parts: string[] = [
      'You are a senior code reviewer. Analyze the following code and identify issues.',
      '',
      'Respond with a JSON object containing:',
      '- "issues": array of objects with severity (critical/high/medium/low), description, line (optional), suggestion (optional)',
      '- "summary": brief summary of findings',
      '',
    ];

    if (context?.filePath) {
      parts.push(`File: ${context.filePath}`);
    }

    if (context?.language) {
      parts.push(`Language: ${context.language}`);
    }

    if (context?.focusAreas?.length) {
      parts.push(`Focus areas: ${context.focusAreas.join(', ')}`);
    }

    if (context?.maxIssues) {
      parts.push(`Maximum issues to report: ${context.maxIssues}`);
    }

    parts.push('', 'Code:', '```', code, '```');

    return parts.join('\n');
  }

  /**
   * Escape text for use in Stagehand act() instructions
   */
  private escapeForAct(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');
  }

  /**
   * Wait for ChatGPT to finish generating response
   */
  private async waitForResponse(): Promise<void> {
    // Wait for the streaming indicator to disappear
    // This is a simplified version - in production, use more robust detection
    const timeout = this.config.timeoutMs ?? 60000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        // Check if still generating
        const isGenerating = await this.stagehand!.page.evaluate(() => {
          const stopButton = document.querySelector('[data-testid="stop-button"]');
          return stopButton !== null;
        });

        if (!isGenerating) {
          // Give a small buffer for final render
          await this.sleep(500);
          return;
        }
      } catch {
        // Page changed, wait and retry
      }

      await this.sleep(1000);
    }

    throw new Error('Timeout waiting for ChatGPT response');
  }

  /**
   * Parse the response text into structured format
   */
  private parseResponse(text: string): ParsedResponse {
    // Try to extract JSON from markdown code blocks first
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      return this.validateAndParse(codeBlockMatch[1].trim());
    }

    // Use balanced-brace extraction for raw JSON
    const json = this.extractBalancedJson(text);
    if (json) {
      return this.validateAndParse(json);
    }

    throw new Error('Failed to extract JSON from response');
  }

  /**
   * Extract JSON using balanced brace matching
   */
  private extractBalancedJson(text: string): string | null {
    const start = text.indexOf('{');
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = start; i < text.length; i++) {
      const char = text[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === '\\' && inString) {
        escape = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') depth++;
        if (char === '}') {
          depth--;
          if (depth === 0) {
            return text.slice(start, i + 1);
          }
        }
      }
    }

    return null;
  }

  /**
   * Validate and parse JSON response
   */
  private validateAndParse(json: string): ParsedResponse {
    const parsed = JSON.parse(json);

    if (!Array.isArray(parsed.issues)) {
      throw new Error('Response missing "issues" array');
    }

    if (typeof parsed.summary !== 'string') {
      throw new Error('Response missing "summary" string');
    }

    const issues: ReviewIssue[] = parsed.issues.map((issue: Record<string, unknown>) => {
      if (!['critical', 'high', 'medium', 'low'].includes(issue.severity as string)) {
        throw new Error(`Invalid severity: ${issue.severity}`);
      }

      if (typeof issue.description !== 'string' || !issue.description) {
        throw new Error('Issue missing description');
      }

      return {
        severity: issue.severity as ReviewIssue['severity'],
        description: issue.description as string,
        line: typeof issue.line === 'number' ? issue.line : undefined,
        file: typeof issue.file === 'string' ? issue.file : undefined,
        suggestion: typeof issue.suggestion === 'string' ? issue.suggestion : undefined,
      };
    });

    return {
      issues,
      summary: parsed.summary,
    };
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
