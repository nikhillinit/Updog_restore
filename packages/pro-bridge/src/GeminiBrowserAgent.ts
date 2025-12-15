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
 * Configuration options for GeminiBrowserAgent
 */
export interface GeminiBrowserAgentConfig {
  /**
   * Directory for browser session data and lock files
   */
  sessionDir: string;

  /**
   * OpenAI API key for Stagehand's self-healing selectors
   */
  openaiApiKey: string;

  /**
   * Model to use in Gemini UI (default: gemini-2.0-flash)
   * Note: This is the display name in the UI, not the API model ID
   */
  model?: string;

  /**
   * Enable Deep Think / extended reasoning mode
   */
  enableDeepThink?: boolean;

  /**
   * Run browser in headless mode (default: false - needed for login)
   */
  headless?: boolean;

  /**
   * Response timeout in milliseconds (default: 120000 for Deep Think)
   */
  timeoutMs?: number;

  /**
   * Session lock timeout in milliseconds (default: 30 minutes)
   */
  lockTimeoutMs?: number;

  /**
   * Enable debug snapshots on failure
   */
  debugSnapshots?: boolean;

  /**
   * Directory for debug snapshots (default: sessionDir/snapshots)
   */
  snapshotDir?: string;
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
 */
const PageInfoSchema = z.object({
  url: z.string(),
  hasLoginButton: z.boolean(),
  isLoggedIn: z.boolean(),
});

const ModelSelectorSchema = z.object({
  currentModel: z.string().optional(),
  hasModelSelector: z.boolean(),
  availableModels: z.array(z.string()).optional(),
});

const GenerationStatusSchema = z.object({
  isGenerating: z.boolean(),
  hasStopButton: z.boolean().optional(),
});

const ExtractResponseSchema = z.object({
  response: z.string(),
  hasCodeBlocks: z.boolean().optional(),
});

type PageInfo = z.infer<typeof PageInfoSchema>;
type ModelSelector = z.infer<typeof ModelSelectorSchema>;
type GenerationStatus = z.infer<typeof GenerationStatusSchema>;
type ExtractResponse = z.infer<typeof ExtractResponseSchema>;

/**
 * Gemini Browser Agent using Stagehand v3 browser automation
 *
 * Uses @browserbasehq/stagehand to automate Gemini Advanced subscription
 * via the web UI at gemini.google.com
 */
export class GeminiBrowserAgent implements ReviewModel {
  readonly provider = 'gemini-browser';
  readonly model: string;

  private config: GeminiBrowserAgentConfig;
  private stagehand: Stagehand | null = null;
  private ready = false;
  private lockPath: string;

  constructor(config: GeminiBrowserAgentConfig) {
    this.config = config;
    this.model = config.model ?? 'Gemini Advanced';
    this.lockPath = path.join(config.sessionDir, 'gemini-browser.lock');

    // Ensure session directory exists
    if (!fs.existsSync(config.sessionDir)) {
      fs.mkdirSync(config.sessionDir, { recursive: true });
    }
  }

  /**
   * Initialize the browser and establish session
   */
  async initialize(): Promise<void> {
    if (this.ready) return;

    // Acquire session lock
    await this.acquireSessionLock();

    try {
      // Initialize Stagehand with persistent Chrome profile
      this.stagehand = new Stagehand({
        env: 'LOCAL',
        localBrowserLaunchOptions: {
          headless: this.config.headless ?? false,
          userDataDir: path.join(this.config.sessionDir, 'gemini-chrome-profile'),
        },
        verbose: 0,
      });

      await this.stagehand.init();

      // Navigate to Gemini
      await this.stagehand.act('navigate to https://gemini.google.com/');

      // Check login state
      await this.ensureLoggedIn();

      // Select model and mode if configured
      if (this.config.enableDeepThink) {
        await this.selectModelAndMode();
      }

      this.ready = true;
    } catch (error) {
      await this.takeDebugSnapshot('initialize-failure');
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
   * Ensure user is logged in to Gemini
   */
  private async ensureLoggedIn(): Promise<void> {
    if (!this.stagehand) throw new Error('Stagehand not initialized');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pageInfo = await this.stagehand.extract(
      'Extract the current page URL, whether there is a sign-in or login button visible, and whether the user appears to be logged in (look for profile picture or account menu)',
      PageInfoSchema as any
    ) as PageInfo;

    if (!pageInfo.isLoggedIn || pageInfo.hasLoginButton) {
      console.log('Gemini requires login. Please log in manually in the browser window.');
      console.log('Waiting for login... (check the browser)');

      // Wait for login with timeout
      const loginTimeout = 5 * 60 * 1000; // 5 minutes
      const startTime = Date.now();

      while (Date.now() - startTime < loginTimeout) {
        await this.sleep(3000);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const status = await this.stagehand.extract(
          'Check if the user is now logged in (look for profile picture, chat input, or no login button)',
          PageInfoSchema as any
        ) as PageInfo;

        if (status.isLoggedIn && !status.hasLoginButton) {
          console.log('Login detected. Continuing...');
          return;
        }
      }

      throw new Error('Login timeout - please restart and log in faster');
    }
  }

  /**
   * Select model and enable Deep Think mode
   */
  private async selectModelAndMode(): Promise<void> {
    if (!this.stagehand) throw new Error('Stagehand not initialized');

    try {
      // Check for model selector
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const modelInfo = await this.stagehand.extract(
        'Look for a model selector, dropdown, or toggle. Extract the current model name if visible and list available model options',
        ModelSelectorSchema as any
      ) as ModelSelector;

      if (modelInfo.hasModelSelector) {
        // Try to select Advanced/Deep Think model
        await this.stagehand.act('click on the model selector or dropdown to open model options');
        await this.sleep(500);

        // Look for Advanced, Deep Think, or similar options
        await this.stagehand.act(
          'select the most advanced model option available, such as "Advanced", "Gemini Advanced", "Deep Think", or "2.0 Flash Thinking"'
        );
        await this.sleep(500);

        console.log('Model/mode selection attempted. Current model:', modelInfo.currentModel);
      }
    } catch (error) {
      // Model selection is optional - don't fail initialization
      console.log('Note: Could not find or select model option. Using default.');
      await this.takeDebugSnapshot('model-selection-failed');
    }
  }

  /**
   * Review code using Gemini browser automation
   */
  async review(code: string, context?: ReviewContext): Promise<ReviewResult> {
    if (!this.ready || !this.stagehand) {
      throw new Error('GeminiBrowserAgent not initialized. Call initialize() first.');
    }

    const prompt = this.buildPrompt(code, context);
    const startTime = Date.now();

    try {
      // Type the prompt into Gemini
      await this.stagehand.act(`type the following text into the message input field: ${this.escapeForAct(prompt)}`);

      // Send the message
      await this.stagehand.act('click the send message button or press Enter to submit the prompt');

      // Wait for response to complete
      await this.waitForResponse();

      // Extract the response
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const extracted = await this.stagehand.extract(
        'Extract the complete text content of the last assistant/Gemini response in the conversation',
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
    } catch (error) {
      await this.takeDebugSnapshot('review-failure');
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    if (this.stagehand) {
      try {
        // Stagehand V3 doesn't have close() - just null out
        this.stagehand = null;
      } catch {
        // Ignore errors during cleanup
      }
    }
    this.ready = false;
    await this.releaseSessionLock();
  }

  /**
   * Build the review prompt
   */
  private buildPrompt(code: string, context?: ReviewContext): string {
    const parts: string[] = [
      'You are a senior code reviewer. Analyze the following code for security vulnerabilities, bugs, performance issues, and best practice violations.',
      '',
      'Respond ONLY with valid JSON in this exact format:',
      '{',
      '  "issues": [',
      '    {',
      '      "severity": "critical|high|medium|low",',
      '      "description": "Clear description of the issue",',
      '      "line": <optional line number>,',
      '      "suggestion": "<optional fix suggestion>"',
      '    }',
      '  ],',
      '  "summary": "Brief overall assessment"',
      '}',
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

    parts.push('');
    parts.push('Code to review:');
    parts.push('```');
    parts.push(code);
    parts.push('```');

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
   * Wait for Gemini to finish generating response
   */
  private async waitForResponse(): Promise<void> {
    // Longer timeout for Deep Think mode
    const timeout = this.config.timeoutMs ?? (this.config.enableDeepThink ? 120000 : 60000);
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        // Check if still generating
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const status = await this.stagehand!.extract(
          'Check if Gemini is still generating a response (look for stop button, loading indicator, or typing animation)',
          GenerationStatusSchema as any
        ) as GenerationStatus;

        if (!status.isGenerating) {
          // Give buffer for final render
          await this.sleep(1000);
          return;
        }
      } catch {
        // Extraction failed, wait and retry
      }

      await this.sleep(2000);
    }

    await this.takeDebugSnapshot('response-timeout');
    throw new Error('Timeout waiting for Gemini response');
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

      if (typeof issue['line'] === 'number') {
        result.line = issue['line'];
      }
      if (typeof issue['file'] === 'string') {
        result.file = issue['file'];
      }
      if (typeof issue['suggestion'] === 'string') {
        result.suggestion = issue['suggestion'];
      }

      return result;
    });

    return {
      issues,
      summary: parsed['summary'] as string,
    };
  }

  /**
   * Take debug snapshot on failure
   */
  private async takeDebugSnapshot(context: string): Promise<void> {
    if (!this.config.debugSnapshots || !this.stagehand) return;

    const snapshotDir = this.config.snapshotDir ?? path.join(this.config.sessionDir, 'snapshots');
    if (!fs.existsSync(snapshotDir)) {
      fs.mkdirSync(snapshotDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `gemini-${context}-${timestamp}`;

    try {
      // Extract page HTML for debugging
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pageState = await this.stagehand.extract(
        'Extract the current page URL and any visible error messages',
        z.object({
          url: z.string(),
          errorMessage: z.string().optional(),
          visibleText: z.string().optional(),
        }) as any
      );

      fs.writeFileSync(
        path.join(snapshotDir, `${filename}.json`),
        JSON.stringify({
          context,
          timestamp: new Date().toISOString(),
          ...pageState,
        }, null, 2)
      );

      console.log(`Debug snapshot saved: ${filename}.json`);
    } catch (error) {
      console.log('Failed to take debug snapshot:', error);
    }
  }

  /**
   * Acquire session lock to prevent concurrent sessions
   */
  private async acquireSessionLock(): Promise<void> {
    const lockTimeout = this.config.lockTimeoutMs ?? 30 * 60 * 1000;

    if (fs.existsSync(this.lockPath)) {
      try {
        const lockData: LockData = JSON.parse(fs.readFileSync(this.lockPath, 'utf-8'));

        // Check if lock is stale (process-based)
        const isStale = Date.now() - lockData.createdAt > lockTimeout || !this.isProcessRunning(lockData.pid);

        if (!isStale) {
          throw new Error(`Gemini browser session already running (PID: ${lockData.pid})`);
        }

        // Remove stale lock
        fs.unlinkSync(this.lockPath);
      } catch (error) {
        if ((error as Error).message.includes('already running')) {
          throw error;
        }
        // Lock file corrupted, remove it
        fs.unlinkSync(this.lockPath);
      }
    }

    // Create new lock
    const lockData: LockData = {
      pid: process.pid,
      createdAt: Date.now(),
    };
    fs.writeFileSync(this.lockPath, JSON.stringify(lockData));
  }

  /**
   * Release session lock
   */
  private async releaseSessionLock(): Promise<void> {
    if (fs.existsSync(this.lockPath)) {
      try {
        const lockData: LockData = JSON.parse(fs.readFileSync(this.lockPath, 'utf-8'));
        if (lockData.pid === process.pid) {
          fs.unlinkSync(this.lockPath);
        }
      } catch {
        // Ignore errors during cleanup
      }
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
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
