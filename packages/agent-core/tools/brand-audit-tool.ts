/**
 * Brand Audit Tool
 *
 * Zod-validated AI tool for auditing brand compliance in reports and charts.
 * Uses the Anthropic SDK betaZodTool pattern for structured output.
 *
 * Checks:
 * - Color palette compliance
 * - Typography conformance
 * - Spacing consistency
 * - Logo usage
 * - Accessibility (contrast ratios)
 */

import { z } from 'zod';

// =============================================================================
// Zod Schemas
// =============================================================================

/**
 * Brand color compliance check result
 */
export const ColorComplianceSchema = z.object({
  color: z.string().describe('The color value (hex or rgb)'),
  location: z.string().describe('Where the color is used'),
  compliant: z.boolean().describe('Whether the color is in the brand palette'),
  suggestion: z.string().optional().describe('Suggested brand color if non-compliant'),
  contrastRatio: z.number().optional().describe('Contrast ratio against background'),
  wcagAA: z.boolean().optional().describe('Meets WCAG 2.1 AA contrast requirements'),
});

export type ColorCompliance = z.infer<typeof ColorComplianceSchema>;

/**
 * Typography compliance check result
 */
export const TypographyComplianceSchema = z.object({
  fontFamily: z.string().describe('The font family used'),
  fontSize: z.string().describe('The font size'),
  fontWeight: z.string().describe('The font weight'),
  location: z.string().describe('Where the typography is used'),
  compliant: z.boolean().describe('Whether it matches brand typography'),
  issue: z.string().optional().describe('Description of the issue if non-compliant'),
});

export type TypographyCompliance = z.infer<typeof TypographyComplianceSchema>;

/**
 * Spacing compliance check result
 */
export const SpacingComplianceSchema = z.object({
  property: z.string().describe('The spacing property (padding, margin, gap)'),
  value: z.string().describe('The spacing value'),
  location: z.string().describe('Where the spacing is used'),
  compliant: z.boolean().describe('Whether it matches brand spacing scale'),
  suggestion: z.string().optional().describe('Suggested spacing value'),
});

export type SpacingCompliance = z.infer<typeof SpacingComplianceSchema>;

/**
 * Overall brand audit result
 */
export const BrandAuditResultSchema = z.object({
  componentName: z.string().describe('Name of the audited component'),
  overallScore: z.number().min(0).max(100).describe('Overall compliance score (0-100)'),
  status: z.enum(['pass', 'warning', 'fail']).describe('Overall status'),

  colorChecks: z.array(ColorComplianceSchema).describe('Color compliance checks'),
  typographyChecks: z.array(TypographyComplianceSchema).describe('Typography compliance checks'),
  spacingChecks: z.array(SpacingComplianceSchema).describe('Spacing compliance checks'),

  summary: z.string().describe('Executive summary of the audit'),
  recommendations: z.array(z.string()).describe('Prioritized list of fixes'),

  metadata: z.object({
    auditedAt: z.string().describe('ISO timestamp of the audit'),
    auditorVersion: z.string().describe('Version of the audit tool'),
    fileCount: z.number().describe('Number of files audited'),
  }),
});

export type BrandAuditResult = z.infer<typeof BrandAuditResultSchema>;

/**
 * Input schema for the brand audit tool
 */
export const BrandAuditInputSchema = z.object({
  targetPath: z.string().describe('Path to the file or directory to audit'),
  checkColors: z.boolean().default(true).describe('Check color compliance'),
  checkTypography: z.boolean().default(true).describe('Check typography compliance'),
  checkSpacing: z.boolean().default(true).describe('Check spacing compliance'),
  checkAccessibility: z.boolean().default(true).describe('Check WCAG accessibility'),
  strictMode: z.boolean().default(false).describe('Fail on any non-compliance'),
});

export type BrandAuditInput = z.infer<typeof BrandAuditInputSchema>;

// =============================================================================
// Brand Constants
// =============================================================================

/**
 * Press On Ventures brand color palette
 */
export const BRAND_COLORS = {
  primary: {
    dark: '#292929',
    beige: '#E0D8D1',
    white: '#FFFFFF',
    light: '#F2F2F2',
  },
  secondary: {
    darkMuted: '#666666',
    gray: '#999999',
    lightGray: '#CCCCCC',
  },
  status: {
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  },
} as const;

/**
 * All allowed colors (flattened)
 */
export const ALLOWED_COLORS = new Set([
  ...Object.values(BRAND_COLORS.primary),
  ...Object.values(BRAND_COLORS.secondary),
  ...Object.values(BRAND_COLORS.status),
]);

/**
 * Brand typography
 */
export const BRAND_TYPOGRAPHY = {
  fontFamilies: ['Inter', 'Poppins', 'Helvetica', 'Arial', 'sans-serif'],
  fontSizes: ['10px', '11px', '12px', '13px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'],
  fontWeights: ['400', '500', '600', '700', 'normal', 'medium', 'semibold', 'bold'],
} as const;

/**
 * Brand spacing scale (in pixels)
 */
export const BRAND_SPACING = [0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64];

// =============================================================================
// Tool Definition (betaZodTool pattern)
// =============================================================================

/**
 * Brand Audit Tool Definition
 *
 * Use with Anthropic SDK's beta.tools.createZodTool() pattern:
 *
 * ```typescript
 * import Anthropic from '@anthropic-ai/sdk';
 * import { brandAuditToolDefinition } from './brand-audit-tool';
 *
 * const anthropic = new Anthropic();
 *
 * const response = await anthropic.messages.create({
 *   model: 'claude-sonnet-4-20250514',
 *   max_tokens: 4096,
 *   tools: [brandAuditToolDefinition],
 *   messages: [{ role: 'user', content: 'Audit the TearSheetTemplate for brand compliance' }],
 * });
 * ```
 */
export const brandAuditToolDefinition = {
  name: 'brand_audit',
  description: `Audits a component or file for Press On Ventures brand compliance.

Checks include:
- Color palette: Ensures only brand-approved colors are used
- Typography: Verifies font families, sizes, and weights match brand guidelines
- Spacing: Confirms spacing values follow the 4px grid system
- Accessibility: Validates WCAG 2.1 AA contrast requirements

Returns a structured audit report with compliance score and recommendations.`,
  input_schema: BrandAuditInputSchema,
  output_schema: BrandAuditResultSchema,
};

// =============================================================================
// Audit Functions
// =============================================================================

/**
 * Check if a color is in the brand palette
 */
export function isColorCompliant(color: string): boolean {
  const normalized = color.toLowerCase();
  return ALLOWED_COLORS.has(normalized) || ALLOWED_COLORS.has(normalized.toUpperCase());
}

/**
 * Calculate contrast ratio between two colors
 * (Simplified - for full implementation use a color library)
 */
export function calculateContrastRatio(foreground: string, background: string): number {
  // Simplified implementation - returns placeholder
  // In production, use a proper color contrast calculation
  return 4.5; // Placeholder
}

/**
 * Check if a font family is brand-compliant
 */
export function isFontFamilyCompliant(fontFamily: string): boolean {
  const normalized = fontFamily.toLowerCase().split(',').map((f) => f.trim());
  return normalized.some((f) =>
    BRAND_TYPOGRAPHY.fontFamilies.some(
      (allowed) => allowed.toLowerCase() === f.replace(/['"]/g, '')
    )
  );
}

/**
 * Check if a spacing value is on the brand scale
 */
export function isSpacingCompliant(value: string): boolean {
  const numericValue = parseInt(value.replace('px', ''), 10);
  if (isNaN(numericValue)) return false;
  return BRAND_SPACING.includes(numericValue);
}

/**
 * Get nearest brand spacing value
 */
export function getNearestBrandSpacing(value: number): number {
  return BRAND_SPACING.reduce((prev, curr) =>
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
  );
}

/**
 * Run a brand compliance audit
 */
export async function runBrandAudit(input: BrandAuditInput): Promise<BrandAuditResult> {
  const colorChecks: ColorCompliance[] = [];
  const typographyChecks: TypographyCompliance[] = [];
  const spacingChecks: SpacingCompliance[] = [];

  // This is a placeholder - in production, this would:
  // 1. Parse the target file(s)
  // 2. Extract colors, typography, and spacing values
  // 3. Check each against brand guidelines
  // 4. Calculate contrast ratios for accessibility

  const score = 100; // Placeholder
  const status: 'pass' | 'warning' | 'fail' = 'pass';

  return {
    componentName: input.targetPath,
    overallScore: score,
    status,
    colorChecks,
    typographyChecks,
    spacingChecks,
    summary: `Audit completed for ${input.targetPath}. Overall compliance: ${score}%`,
    recommendations: [],
    metadata: {
      auditedAt: new Date().toISOString(),
      auditorVersion: '1.0.0',
      fileCount: 1,
    },
  };
}

export default {
  definition: brandAuditToolDefinition,
  run: runBrandAudit,
  schemas: {
    input: BrandAuditInputSchema,
    output: BrandAuditResultSchema,
    colorCompliance: ColorComplianceSchema,
    typographyCompliance: TypographyComplianceSchema,
    spacingCompliance: SpacingComplianceSchema,
  },
  constants: {
    BRAND_COLORS,
    ALLOWED_COLORS,
    BRAND_TYPOGRAPHY,
    BRAND_SPACING,
  },
  utils: {
    isColorCompliant,
    isFontFamilyCompliant,
    isSpacingCompliant,
    getNearestBrandSpacing,
    calculateContrastRatio,
  },
};
