import type {
  ReviewModel,
  ReviewResult,
  ReviewContext,
  ReviewIssue,
  IssueSeverity,
  ConsensusResult,
  MergedIssue,
  ConsensusConfig,
} from './types';
import { DEFAULT_CONSENSUS_CONFIG } from './types';

/**
 * Severity ranking for comparison (higher = more severe)
 */
const SEVERITY_RANK: Record<IssueSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Reverse mapping from rank to severity
 */
const RANK_TO_SEVERITY: Record<number, IssueSeverity> = {
  4: 'critical',
  3: 'high',
  2: 'medium',
  1: 'low',
};

/**
 * Internal structure for tracking issues during merge
 */
interface IssueAccumulator {
  description: string;
  line?: number;
  file?: string;
  suggestion?: string;
  reportedBy: string[];
  severities: Record<string, IssueSeverity>;
}

/**
 * ConsensusOrchestrator coordinates multiple ReviewModel providers
 * and merges their results into a unified consensus.
 */
export class ConsensusOrchestrator {
  readonly providers: ReviewModel[];
  readonly config: ConsensusConfig;

  private initialized = false;

  constructor(providers: ReviewModel[], config?: Partial<ConsensusConfig>) {
    this.providers = providers;
    this.config = { ...DEFAULT_CONSENSUS_CONFIG, ...config };
  }

  /**
   * Initialize all providers
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await Promise.all(this.providers.map(p => p.initialize()));
    this.initialized = true;
  }

  /**
   * Review code using all providers and merge results
   */
  async review(code: string, context?: ReviewContext): Promise<ConsensusResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Run all providers in parallel
    const results = await Promise.all(
      this.providers.map(p => p.review(code, context))
    );

    // Merge and deduplicate issues
    const mergedIssues = this.mergeIssues(results);

    // Filter by minimum agreement
    const filteredIssues = mergedIssues.filter(
      issue => issue.confidence >= this.config.minAgreement
    );

    // Calculate statistics
    const stats = this.calculateStats(filteredIssues, results.length);

    // Generate summary
    const summary = this.generateSummary(filteredIssues, stats);

    return {
      results,
      mergedIssues: filteredIssues,
      stats,
      summary,
      timestamp: Date.now(),
    };
  }

  /**
   * Dispose all providers
   */
  async dispose(): Promise<void> {
    await Promise.all(this.providers.map(p => p.dispose()));
    this.initialized = false;
  }

  /**
   * Merge issues from all providers, deduplicating by description
   */
  private mergeIssues(results: ReviewResult[]): MergedIssue[] {
    const issueMap = new Map<string, IssueAccumulator>();

    for (const result of results) {
      for (const issue of result.issues) {
        // Normalize description for deduplication
        const key = this.normalizeDescription(issue.description);

        const existing = issueMap.get(key);
        if (existing) {
          // Merge with existing
          existing.reportedBy.push(result.provider);
          existing.severities[result.provider] = issue.severity;

          // Keep first non-null values for optional fields
          if (!existing.line && issue.line) existing.line = issue.line;
          if (!existing.file && issue.file) existing.file = issue.file;
          if (!existing.suggestion && issue.suggestion) existing.suggestion = issue.suggestion;
        } else {
          // New issue - only include defined optional properties
          const acc: IssueAccumulator = {
            description: issue.description,
            reportedBy: [result.provider],
            severities: { [result.provider]: issue.severity },
          };
          if (issue.line !== undefined) acc.line = issue.line;
          if (issue.file !== undefined) acc.file = issue.file;
          if (issue.suggestion !== undefined) acc.suggestion = issue.suggestion;
          issueMap.set(key, acc);
        }
      }
    }

    // Convert to MergedIssue array
    const totalProviders = results.length;
    return Array.from(issueMap.values()).map(acc => {
      const merged: MergedIssue = {
        severity: this.resolveSeverity(Object.values(acc.severities)),
        description: acc.description,
        reportedBy: acc.reportedBy,
        confidence: acc.reportedBy.length / totalProviders,
        originalSeverities: acc.severities,
      };
      if (acc.line !== undefined) merged.line = acc.line;
      if (acc.file !== undefined) merged.file = acc.file;
      if (acc.suggestion !== undefined) merged.suggestion = acc.suggestion;
      return merged;
    });
  }

  /**
   * Normalize description for comparison
   * Lowercases and removes extra whitespace
   */
  private normalizeDescription(description: string): string {
    return description.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Resolve severity based on config
   */
  private resolveSeverity(severities: IssueSeverity[]): IssueSeverity {
    if (severities.length === 0) return 'low';

    const ranks = severities.map(s => SEVERITY_RANK[s]);

    // Helper to safely get severity from rank (ranks are always 1-4)
    const getSeverity = (rank: number): IssueSeverity => {
      return RANK_TO_SEVERITY[rank] ?? 'low';
    };

    switch (this.config.severityResolution) {
      case 'max':
        return getSeverity(Math.max(...ranks));
      case 'min':
        return getSeverity(Math.min(...ranks));
      case 'average': {
        const avg = Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length);
        return getSeverity(Math.min(Math.max(avg, 1), 4));
      }
      default:
        return getSeverity(Math.max(...ranks));
    }
  }

  /**
   * Calculate consensus statistics
   * CRITICAL: Initialize all counts to 0 to prevent NaN
   */
  private calculateStats(
    issues: MergedIssue[],
    totalProviders: number
  ): ConsensusResult['stats'] {
    // Initialize all severity counts to 0 (prevents NaN)
    const severityCounts: Record<IssueSeverity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    // Count each severity
    for (const issue of issues) {
      severityCounts[issue.severity]++;
    }

    // Calculate agreement rate (what percentage of issues are agreed by all)
    const fullyAgreedCount = issues.filter(i => i.confidence === 1).length;
    const agreementRate = issues.length > 0 ? fullyAgreedCount / issues.length : 0;

    return {
      totalProviders,
      agreementRate,
      severityCounts,
    };
  }

  /**
   * Generate a human-readable summary
   */
  private generateSummary(
    issues: MergedIssue[],
    stats: ConsensusResult['stats']
  ): string {
    if (issues.length === 0) {
      return 'No issues found by consensus.';
    }

    const parts: string[] = [];

    // Issue count
    parts.push(`Found ${issues.length} issue${issues.length === 1 ? '' : 's'} by consensus.`);

    // Severity breakdown
    const severityParts: string[] = [];
    if (stats.severityCounts.critical > 0) {
      severityParts.push(`${stats.severityCounts.critical} critical`);
    }
    if (stats.severityCounts.high > 0) {
      severityParts.push(`${stats.severityCounts.high} high`);
    }
    if (stats.severityCounts.medium > 0) {
      severityParts.push(`${stats.severityCounts.medium} medium`);
    }
    if (stats.severityCounts.low > 0) {
      severityParts.push(`${stats.severityCounts.low} low`);
    }

    if (severityParts.length > 0) {
      parts.push(`Severity breakdown: ${severityParts.join(', ')}.`);
    }

    // Agreement info
    const agreementPct = Math.round(stats.agreementRate * 100);
    parts.push(`${agreementPct}% full agreement across ${stats.totalProviders} providers.`);

    return parts.join(' ');
  }
}
