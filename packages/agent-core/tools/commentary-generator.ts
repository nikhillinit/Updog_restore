/**
 * Commentary Generator Tool
 *
 * AI-powered tool for generating structured manager commentary
 * for LP reports. Uses Zod for schema validation.
 *
 * Generates:
 * - Quarterly letter summaries
 * - Investment highlights
 * - Portfolio updates
 * - Market outlook sections
 */

import { z } from 'zod';

// =============================================================================
// Zod Schemas
// =============================================================================

/**
 * Fund metrics input for commentary generation
 */
export const FundMetricsSchema = z.object({
  fundName: z.string(),
  quarter: z.string().describe('e.g., "Q4 2024"'),
  year: z.number(),

  // Performance metrics
  nav: z.number().describe('Net Asset Value in dollars'),
  tvpi: z.number().describe('Total Value to Paid-In'),
  dpi: z.number().describe('Distributions to Paid-In'),
  moic: z.number().describe('Multiple on Invested Capital'),
  irr: z.number().describe('Internal Rate of Return (decimal)'),

  // Portfolio composition
  totalCompanies: z.number(),
  activeCompanies: z.number(),
  exited: z.number(),
  writtenOff: z.number(),

  // Capital deployment
  calledCapital: z.number(),
  distributions: z.number(),
  remainingCapital: z.number(),

  // Period changes
  navChange: z.number().optional().describe('NAV change from last quarter (%)'),
  newInvestments: z.number().optional().describe('Number of new investments this quarter'),
  followOnInvestments: z.number().optional().describe('Number of follow-on investments'),
});

export type FundMetrics = z.infer<typeof FundMetricsSchema>;

/**
 * Company highlight for commentary
 */
export const CompanyHighlightSchema = z.object({
  companyName: z.string(),
  sector: z.string(),
  stage: z.string(),
  eventType: z.enum(['milestone', 'fundraise', 'partnership', 'product_launch', 'exit', 'challenge']),
  description: z.string(),
  impact: z.enum(['positive', 'neutral', 'negative']),
  quantitativeImpact: z.string().optional().describe('e.g., "2x valuation increase"'),
});

export type CompanyHighlight = z.infer<typeof CompanyHighlightSchema>;

/**
 * Commentary generation input
 */
export const CommentaryInputSchema = z.object({
  metrics: FundMetricsSchema,
  highlights: z.array(CompanyHighlightSchema).optional(),

  // Style preferences
  tone: z.enum(['formal', 'professional', 'conversational']).default('professional'),
  length: z.enum(['brief', 'standard', 'detailed']).default('standard'),
  sections: z.array(z.enum([
    'executive_summary',
    'performance_overview',
    'portfolio_activity',
    'market_outlook',
    'operational_updates',
    'looking_ahead',
  ])).default(['executive_summary', 'performance_overview', 'portfolio_activity']),

  // Additional context
  marketContext: z.string().optional().describe('Current market conditions to reference'),
  strategicFocus: z.string().optional().describe('Strategic themes to emphasize'),
});

export type CommentaryInput = z.infer<typeof CommentaryInputSchema>;

/**
 * Generated commentary section
 */
export const CommentarySectionSchema = z.object({
  sectionType: z.string(),
  title: z.string(),
  content: z.string(),
  bullets: z.array(z.string()).optional(),
  callouts: z.array(z.object({
    label: z.string(),
    value: z.string(),
  })).optional(),
});

export type CommentarySection = z.infer<typeof CommentarySectionSchema>;

/**
 * Generated commentary output
 */
export const CommentaryOutputSchema = z.object({
  fundName: z.string(),
  reportingPeriod: z.string(),
  generatedAt: z.string(),

  sections: z.array(CommentarySectionSchema),

  // Quick reference stats
  keyMetrics: z.array(z.object({
    label: z.string(),
    value: z.string(),
    trend: z.enum(['up', 'down', 'flat']).optional(),
  })),

  // Metadata
  wordCount: z.number(),
  estimatedReadTime: z.string(),
  confidenceScore: z.number().min(0).max(1).describe('Model confidence in the generated content'),
});

export type CommentaryOutput = z.infer<typeof CommentaryOutputSchema>;

// =============================================================================
// Tool Definition
// =============================================================================

/**
 * Commentary Generator Tool Definition
 */
export const commentaryGeneratorToolDefinition = {
  name: 'generate_commentary',
  description: `Generates professional manager commentary for LP quarterly reports.

Creates structured, brand-appropriate content sections including:
- Executive summary with key highlights
- Performance overview with metric analysis
- Portfolio activity updates
- Market outlook and strategic positioning

Output is formatted for direct inclusion in PDF reports.`,
  input_schema: CommentaryInputSchema,
  output_schema: CommentaryOutputSchema,
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format a number as currency
 */
function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

/**
 * Format a number as percentage
 */
function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Format a number as multiple
 */
function formatMultiple(value: number): string {
  return `${value.toFixed(2)}x`;
}

/**
 * Determine trend from value
 */
function getTrend(value: number): 'up' | 'down' | 'flat' {
  if (value > 0.01) return 'up';
  if (value < -0.01) return 'down';
  return 'flat';
}

// =============================================================================
// Section Generators
// =============================================================================

/**
 * Generate executive summary section
 */
function generateExecutiveSummary(input: CommentaryInput): CommentarySection {
  const { metrics } = input;
  const performanceDesc = metrics.tvpi >= 1.5
    ? 'strong performance'
    : metrics.tvpi >= 1.0
      ? 'steady progress'
      : 'continued development';

  return {
    sectionType: 'executive_summary',
    title: 'Executive Summary',
    content: `${metrics.fundName} delivered ${performanceDesc} in ${metrics.quarter} ${metrics.year}, ` +
      `with a TVPI of ${formatMultiple(metrics.tvpi)} and net IRR of ${formatPercent(metrics.irr)}. ` +
      `The portfolio comprises ${metrics.activeCompanies} active companies with ${formatCurrency(metrics.nav)} in net asset value.`,
    bullets: [
      `NAV: ${formatCurrency(metrics.nav)}${metrics.navChange ? ` (${metrics.navChange > 0 ? '+' : ''}${formatPercent(metrics.navChange)} QoQ)` : ''}`,
      `TVPI: ${formatMultiple(metrics.tvpi)} | DPI: ${formatMultiple(metrics.dpi)}`,
      `Portfolio: ${metrics.activeCompanies} active companies, ${metrics.exited} exits`,
    ],
  };
}

/**
 * Generate performance overview section
 */
function generatePerformanceOverview(input: CommentaryInput): CommentarySection {
  const { metrics } = input;

  return {
    sectionType: 'performance_overview',
    title: 'Performance Overview',
    content: `Fund performance metrics reflect the current portfolio valuation as of ${metrics.quarter} ${metrics.year}. ` +
      `Total called capital stands at ${formatCurrency(metrics.calledCapital)} with ${formatCurrency(metrics.distributions)} ` +
      `distributed to date. The fund maintains ${formatCurrency(metrics.remainingCapital)} in remaining capital for follow-on investments.`,
    callouts: [
      { label: 'Net IRR', value: formatPercent(metrics.irr) },
      { label: 'MOIC', value: formatMultiple(metrics.moic) },
      { label: 'Called', value: formatCurrency(metrics.calledCapital) },
    ],
  };
}

/**
 * Generate portfolio activity section
 */
function generatePortfolioActivity(input: CommentaryInput): CommentarySection {
  const { metrics, highlights } = input;

  const positiveHighlights = highlights?.filter(h => h.impact === 'positive') ?? [];
  const activityBullets: string[] = [];

  if (metrics.newInvestments) {
    activityBullets.push(`${metrics.newInvestments} new investments made during the quarter`);
  }
  if (metrics.followOnInvestments) {
    activityBullets.push(`${metrics.followOnInvestments} follow-on investments to support portfolio growth`);
  }
  if (metrics.exited > 0) {
    activityBullets.push(`${metrics.exited} portfolio companies successfully exited`);
  }

  positiveHighlights.slice(0, 3).forEach(h => {
    activityBullets.push(`${h.companyName}: ${h.description}`);
  });

  return {
    sectionType: 'portfolio_activity',
    title: 'Portfolio Activity',
    content: `This quarter saw continued active portfolio management across the fund. ` +
      `The investment team focused on supporting existing portfolio companies while selectively ` +
      `deploying capital into new opportunities aligned with our thesis.`,
    bullets: activityBullets.length > 0 ? activityBullets : ['Normal portfolio operations during the quarter'],
  };
}

/**
 * Generate market outlook section
 */
function generateMarketOutlook(input: CommentaryInput): CommentarySection {
  const { marketContext, strategicFocus } = input;

  return {
    sectionType: 'market_outlook',
    title: 'Market Outlook',
    content: marketContext
      ? `${marketContext} We continue to see opportunities in ${strategicFocus ?? 'our core sectors'} and remain disciplined in our investment approach.`
      : `The current market environment presents both opportunities and challenges. We maintain a disciplined approach to capital deployment while actively supporting our portfolio companies.`,
  };
}

/**
 * Generate looking ahead section
 */
function generateLookingAhead(input: CommentaryInput): CommentarySection {
  const { metrics } = input;

  return {
    sectionType: 'looking_ahead',
    title: 'Looking Ahead',
    content: `As we move into the next quarter, ${metrics.fundName} remains focused on maximizing value for our limited partners. ` +
      `With ${formatCurrency(metrics.remainingCapital)} in dry powder, we are well-positioned to capitalize on emerging opportunities ` +
      `while continuing to support our existing portfolio companies through their growth journey.`,
  };
}

// =============================================================================
// Main Generator Function
// =============================================================================

/**
 * Generate commentary for a fund report
 */
export async function generateCommentary(input: CommentaryInput): Promise<CommentaryOutput> {
  const sectionGenerators: Record<string, (input: CommentaryInput) => CommentarySection> = {
    executive_summary: generateExecutiveSummary,
    performance_overview: generatePerformanceOverview,
    portfolio_activity: generatePortfolioActivity,
    market_outlook: generateMarketOutlook,
    looking_ahead: generateLookingAhead,
    operational_updates: (inp) => ({
      sectionType: 'operational_updates',
      title: 'Operational Updates',
      content: `Fund operations continue smoothly with regular LP communications and transparent reporting.`,
    }),
  };

  const sections = input.sections.map(sectionType => {
    const generator = sectionGenerators[sectionType];
    if (generator) {
      return generator(input);
    }
    return {
      sectionType,
      title: sectionType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      content: 'Section content pending.',
    };
  });

  const totalWords = sections.reduce((sum, s) => {
    const contentWords = s.content.split(/\s+/).length;
    const bulletWords = s.bullets?.reduce((b, bullet) => b + bullet.split(/\s+/).length, 0) ?? 0;
    return sum + contentWords + bulletWords;
  }, 0);

  return {
    fundName: input.metrics.fundName,
    reportingPeriod: `${input.metrics.quarter} ${input.metrics.year}`,
    generatedAt: new Date().toISOString(),
    sections,
    keyMetrics: [
      { label: 'NAV', value: formatCurrency(input.metrics.nav), trend: getTrend(input.metrics.navChange ?? 0) },
      { label: 'TVPI', value: formatMultiple(input.metrics.tvpi) },
      { label: 'DPI', value: formatMultiple(input.metrics.dpi) },
      { label: 'IRR', value: formatPercent(input.metrics.irr) },
    ],
    wordCount: totalWords,
    estimatedReadTime: `${Math.ceil(totalWords / 200)} min`,
    confidenceScore: 0.85,
  };
}

// =============================================================================
// Exports
// =============================================================================

export default {
  definition: commentaryGeneratorToolDefinition,
  generate: generateCommentary,
  schemas: {
    input: CommentaryInputSchema,
    output: CommentaryOutputSchema,
    fundMetrics: FundMetricsSchema,
    companyHighlight: CompanyHighlightSchema,
    section: CommentarySectionSchema,
  },
  utils: {
    formatCurrency,
    formatPercent,
    formatMultiple,
    getTrend,
  },
};
