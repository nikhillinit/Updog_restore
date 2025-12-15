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
   * Model to use (default: gemini-2.5-pro-preview)
   */
  model?: string;

  /**
   * Thinking level for Deep Think (default: 'high')
   * Only applies to models that support thinking config
   */
  thinkingLevel?: 'low' | 'medium' | 'high';

  /**
   * Thinking budget in tokens (alternative to thinkingLevel for some models)
   */
  thinkingBudget?: number;
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
    this.model = config.model ?? 'gemini-2.5-pro-preview';
    this.client = new GoogleGenAI(config.apiKey);
  }

  /**
   * Initialize the agent
   */
  async initialize(): Promise<void> {
    if (this.ready) return;

    // Verify API key works by making a minimal request
    // In production, we might want to do a health check here
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

    const parsed = this.parseResponse(response.text ?? '');

    return {
      provider: this.provider,
      model: this.model,
      issues: parsed.issues,
      summary: parsed.summary,
      timestamp: startTime,
      tokenUsage: this.extractTokenUsage(response.usageMetadata),
      raw: response.text,
    };
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
   * Get thinking config based on model
   */
  private getThinkingConfig(): { thinkingLevel?: string; thinkingBudget?: number; includeThoughts?: boolean } {
    // For gemini-2.5 models, use thinkingLevel
    if (this.model.includes('2.5')) {
      return {
        thinkingLevel: this.config.thinkingLevel ?? 'high',
        includeThoughts: true,
      };
    }

    // For gemini-3 models (future), might use thinkingBudget
    if (this.config.thinkingBudget) {
      return {
        thinkingBudget: this.config.thinkingBudget,
        includeThoughts: true,
      };
    }

    return {
      thinkingLevel: this.config.thinkingLevel ?? 'high',
      includeThoughts: true,
    };
  }

  /**
   * Parse the response text into structured format
   * Uses balanced-brace extraction to handle nested JSON
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
    const parsed = JSON.parse(json);

    if (!Array.isArray(parsed.issues)) {
      throw new Error('Response missing "issues" array');
    }

    if (typeof parsed.summary !== 'string') {
      throw new Error('Response missing "summary" string');
    }

    // Validate each issue
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
   * Extract token usage from response metadata
   */
  private extractTokenUsage(metadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  }): ReviewResult['tokenUsage'] | undefined {
    if (!metadata) return undefined;

    return {
      input: metadata.promptTokenCount ?? 0,
      output: metadata.candidatesTokenCount ?? 0,
      thinking: metadata.thoughtsTokenCount,
    };
  }
}
