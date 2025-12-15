import { GoogleGenAI } from '@google/genai';
import type {
  ReviewModel,
  ReviewResult,
  ReviewContext,
  ReviewIssue,
} from './types';

/**
 * Configuration options for GeminiProAgent
 */
export interface GeminiProAgentConfig {
  /**
   * Gemini API key
   */
  apiKey: string;

  /**
   * Model to use (default: gemini-2.0-flash)
   */
  model?: string;

  /**
   * Thinking budget in tokens (for models that support thinking)
   */
  thinkingBudget?: number;

  /**
   * Include thought process in response
   */
  includeThoughts?: boolean;
}

/**
 * Parsed response structure from Gemini
 */
interface ParsedResponse {
  issues: ReviewIssue[];
  summary: string;
}

/**
 * Gemini Pro Agent using official @google/genai SDK
 *
 * Uses the official SDK for API access with thinking config
 * for Deep Think capabilities.
 */
export class GeminiProAgent implements ReviewModel {
  readonly provider = 'gemini';
  readonly model: string;

  private client: GoogleGenAI;
  private config: GeminiProAgentConfig;
  private ready = false;

  constructor(config: GeminiProAgentConfig) {
    this.config = config;
    this.model = config.model ?? 'gemini-2.0-flash';
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
  }

  /**
   * Initialize the agent
   */
  async initialize(): Promise<void> {
    if (this.ready) return;
    this.ready = true;
  }

  /**
   * Check if agent is ready
   */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * Review code and return structured issues
   */
  async review(code: string, context?: ReviewContext): Promise<ReviewResult> {
    if (!this.ready) {
      throw new Error('GeminiProAgent not initialized. Call initialize() first.');
    }

    const prompt = this.buildPrompt(code, context);
    const startTime = Date.now();

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: prompt,
      config: {
        thinkingConfig: this.getThinkingConfig(),
      },
    });

    const text = response.text ?? '';
    const parsed = this.parseResponse(text);

    const result: ReviewResult = {
      provider: this.provider,
      model: this.model,
      issues: parsed.issues,
      summary: parsed.summary,
      timestamp: startTime,
      raw: text,
    };

    // Add token usage if available
    const usage = this.extractTokenUsage(response);
    if (usage) {
      result.tokenUsage = usage;
    }

    return result;
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    this.ready = false;
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
   * Get thinking config based on model and settings
   */
  private getThinkingConfig(): { thinkingBudget?: number; includeThoughts?: boolean } {
    const config: { thinkingBudget?: number; includeThoughts?: boolean } = {};

    if (this.config.thinkingBudget !== undefined) {
      config.thinkingBudget = this.config.thinkingBudget;
    }

    if (this.config.includeThoughts !== undefined) {
      config.includeThoughts = this.config.includeThoughts;
    }

    return config;
  }

  /**
   * Parse the response text into structured format
   * Uses balanced-brace extraction to handle nested JSON
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
   * Handles nested objects correctly
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

    // Validate each issue
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
   * Extract token usage from response
   */
  private extractTokenUsage(response: { usageMetadata?: unknown }): ReviewResult['tokenUsage'] | undefined {
    const metadata = response.usageMetadata as Record<string, unknown> | undefined;
    if (!metadata) return undefined;

    const result: { input: number; output: number; thinking?: number } = {
      input: (metadata['promptTokenCount'] as number) ?? 0,
      output: (metadata['candidatesTokenCount'] as number) ?? 0,
    };

    const thinking = metadata['thoughtsTokenCount'] as number | undefined;
    if (thinking !== undefined) {
      result.thinking = thinking;
    }

    return result;
  }
}
