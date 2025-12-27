import { z } from 'zod';

/**
 * Severity levels for code review issues
 */
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Individual code review issue
 */
export interface ReviewIssue {
  severity: IssueSeverity;
  description: string;
  line?: number;
  file?: string;
  suggestion?: string;
}

/**
 * Zod schema for ReviewIssue validation
 */
export const ReviewIssueSchema = z.object({
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  description: z.string().min(1),
  line: z.number().int().positive().optional(),
  file: z.string().optional(),
  suggestion: z.string().optional(),
});

/**
 * Standardized review result from any provider
 */
export interface ReviewResult {
  provider: string;
  model: string;
  issues: ReviewIssue[];
  summary: string;
  timestamp: number;
  tokenUsage?: {
    input: number;
    output: number;
    thinking?: number;
  };
  raw?: string;
}

/**
 * Zod schema for ReviewResult validation
 */
export const ReviewResultSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  issues: z.array(ReviewIssueSchema),
  summary: z.string(),
  timestamp: z.number(),
  tokenUsage: z.object({
    input: z.number(),
    output: z.number(),
    thinking: z.number().optional(),
  }).optional(),
  raw: z.string().optional(),
});

/**
 * Provider abstraction interface
 * All providers (Gemini, ChatGPT) implement this interface
 */
export interface ReviewModel {
  /**
   * Unique provider identifier
   */
  readonly provider: string;

  /**
   * Model name/version being used
   */
  readonly model: string;

  /**
   * Initialize the provider (login, setup session, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Submit code for review
   * @param code - The code to review
   * @param context - Optional context (file path, language, focus areas)
   * @returns Standardized review result
   */
  review(code: string, context?: ReviewContext): Promise<ReviewResult>;

  /**
   * Check if the provider is ready for requests
   */
  isReady(): boolean;

  /**
   * Clean up resources (close browser, etc.)
   */
  dispose(): Promise<void>;
}

/**
 * Context for code review requests
 */
export interface ReviewContext {
  filePath?: string;
  language?: string;
  focusAreas?: ('security' | 'performance' | 'readability' | 'bugs' | 'architecture')[];
  maxIssues?: number;
}

/**
 * Quota configuration for rate-limited features
 */
export interface QuotaConfig {
  /**
   * Unique identifier for this quota type
   */
  id: string;

  /**
   * Maximum uses per period
   */
  limit: number;

  /**
   * Period in milliseconds (e.g., 24 * 60 * 60 * 1000 for daily)
   */
  periodMs: number;

  /**
   * Human-readable description
   */
  description?: string;
}

/**
 * Quota status for a specific feature
 */
export interface QuotaStatus {
  config: QuotaConfig;
  used: number;
  remaining: number;
  resetsAt: number;
  isExhausted: boolean;
}

/**
 * Quota reservation for atomic operations
 */
export interface QuotaReservation {
  id: string;
  quotaId: string;
  amount: number;
  createdAt: number;
  expiresAt: number;
}

/**
 * Session configuration for browser-based providers
 */
export interface SessionConfig {
  /**
   * Path to browser user data directory
   */
  userDataDir: string;

  /**
   * Run browser in headless mode
   */
  headless: boolean;

  /**
   * Session timeout in milliseconds
   */
  timeoutMs: number;
}

/**
 * Consensus result from multiple providers
 */
export interface ConsensusResult {
  /**
   * Individual results from each provider
   */
  results: ReviewResult[];

  /**
   * Merged and deduplicated issues
   */
  mergedIssues: MergedIssue[];

  /**
   * Summary statistics
   */
  stats: {
    totalProviders: number;
    agreementRate: number;
    severityCounts: Record<IssueSeverity, number>;
  };

  /**
   * Overall consensus summary
   */
  summary: string;

  /**
   * Timestamp of consensus generation
   */
  timestamp: number;
}

/**
 * Issue that appears in multiple provider results
 */
export interface MergedIssue extends ReviewIssue {
  /**
   * Providers that reported this issue
   */
  reportedBy: string[];

  /**
   * Agreement score (0-1) based on how many providers reported
   */
  confidence: number;

  /**
   * Original severity from each provider (may differ)
   */
  originalSeverities: Record<string, IssueSeverity>;
}

/**
 * Configuration for the consensus orchestrator
 */
export interface ConsensusConfig {
  /**
   * Minimum agreement rate to include an issue (0-1)
   */
  minAgreement: number;

  /**
   * How to resolve severity conflicts
   */
  severityResolution: 'max' | 'min' | 'average';

  /**
   * Maximum time to wait for all providers (ms)
   */
  timeoutMs: number;
}

/**
 * Default consensus configuration
 */
export const DEFAULT_CONSENSUS_CONFIG: ConsensusConfig = {
  minAgreement: 0.5,
  severityResolution: 'max',
  timeoutMs: 120000,
};
