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
   * Model to use (default: gpt-4o)
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
 * Zod schemas for Stagehand extract responses
 * Defined at module level to avoid deep type instantiation issues
 */
const PageInfoSchema = z.object({
  url: z.string(),
  hasLoginButton: z.boolean(),
});

const GenerationStatusSchema = z.object({
  isGenerating: z.boolean(),
});

const ExtractResponseSchema = z.object({
  response: z.string(),
  hasCode: z.boolean().optional(),
});

type PageInfo = z.infer<typeof PageInfoSchema>;
type GenerationStatus = z.infer<typeof GenerationStatusSchema>;
type ExtractResponse = z.infer<typeof ExtractResponseSchema>;

/**
 * ChatGPT Pro Agent using Stagehand v3 browser automation
 *
 * Uses @browserbasehq/stagehand for resilient browser automation
 * with self-healing selectors.
 */
export class ChatGPTProAgent implements ReviewModel {
  readonly provider = 'chatgpt';
  readonly model: string;

  private config: ChatGPTProAgentConfig;
  private stagehand: Stagehand | null = null;
  private ready = false;

  constructor(config: ChatGPTProAgentConfig) {
    this.config = config;
    this.model = config.model ?? 'gpt-4o';
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
      // Initialize Stagehand with local browser
      this.stagehand = new Stagehand({
        env: 'LOCAL',
        localBrowserLaunchOptions: {
          headless: this.config.headless ?? false,
          userDataDir: path.join(this.config.sessionDir, 'chrome-profile'),
        },
        verbose: 0,
      });

      await this.stagehand.init();

      // Navigate to ChatGPT
      await this.stagehand.act('navigate to https://chatgpt.com/');

      // Check if we need to login
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pageInfo = await this.stagehand.extract(
        'Extract the current page URL and whether there is a login button visible',
        PageInfoSchema as any
      ) as PageInfo;

      if (pageInfo.hasLoginButton || pageInfo.url.includes('auth')) {
        console.log('ChatGPT requires login. Please log in manually in the browser window.');
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

    // Type the prompt into ChatGPT
    await this.stagehand.act(`type the following text into the message input field: ${this.escapeForAct(prompt)}`);

    // Send the message
    await this.stagehand.act('click the send message button');

    // Wait for response to complete
    await this.waitForResponse();

    // Extract the response
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const extracted = await this.stagehand.extract(
      'Extract the complete text content of the last assistant message in the chat',
      ExtractResponseSchema as any
    ) as ExtractResponse;

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
        // Close is not available in V3 - just null out the reference
        this.stagehand = null;
      } catch {
        // Ignore close errors
      }
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
    const timeout = this.config.timeoutMs ?? 60000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        // Check if still generating by looking for stop button
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const status = await this.stagehand!.extract(
          'Check if there is a stop generation button visible (indicating the AI is still responding)',
          GenerationStatusSchema as any
        ) as GenerationStatus;

        if (!status.isGenerating) {
          // Give a small buffer for final render
          await this.sleep(500);
          return;
        }
      } catch {
        // Extraction failed, wait and retry
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
    if (codeBlockMatch && codeBlockMatch[1]) {
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
    const parsed = JSON.parse(json) as Record<string, unknown>;

    if (!Array.isArray(parsed['issues'])) {
      throw new Error('Response missing "issues" array');
    }

    if (typeof parsed['summary'] !== 'string') {
      throw new Error('Response missing "summary" string');
    }

    const issues: ReviewIssue[] = (parsed['issues'] as Record<string, unknown>[]).map((issue) => {
      const severity = issue['severity'] as string;
      if (!['critical', 'high', 'medium', 'low'].includes(severity)) {
        throw new Error(`Invalid severity: ${severity}`);
      }

      const description = issue['description'] as string;
      if (typeof description !== 'string' || !description) {
        throw new Error('Issue missing description');
      }

      const result: ReviewIssue = {
        severity: severity as ReviewIssue['severity'],
        description,
      };

      const line = issue['line'];
      if (typeof line === 'number') {
        result.line = line;
      }

      const file = issue['file'];
      if (typeof file === 'string') {
        result.file = file;
      }

      const suggestion = issue['suggestion'];
      if (typeof suggestion === 'string') {
        result.suggestion = suggestion;
      }

      return result;
    });

    return {
      issues,
      summary: parsed['summary'] as string,
    };
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
