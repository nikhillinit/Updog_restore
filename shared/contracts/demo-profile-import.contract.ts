import { z } from 'zod';

export const DemoProfileImportSchemaVersion = 'demo-profile-import/v1' as const;

export const DemoProfileSectionOrder = [
  'portfolioCompanies',
  'investments',
  'investmentLots',
  'dealOpportunities',
  'fundMetrics',
  'pacingHistory',
  'fundBaselines',
  'varianceReports',
  'backtestResults',
] as const;

export const DemoProfileTargetTables = [
  'portfoliocompanies',
  'investments',
  'investment_lots',
  'deal_opportunities',
  'fund_metrics',
  'pacing_history',
  'fund_baselines',
  'variance_reports',
  'backtest_results',
] as const;

export const DemoProfileTargetPkTypes = ['integer', 'uuid'] as const;

export const DemoProfileSectionNameSchema = z.enum(DemoProfileSectionOrder);
export const DemoProfileTargetTableSchema = z.enum(DemoProfileTargetTables);
export const DemoProfileTargetPkTypeSchema = z.enum(DemoProfileTargetPkTypes);

export type DemoProfileSectionName = (typeof DemoProfileSectionOrder)[number];
export type DemoProfileTargetTable = (typeof DemoProfileTargetTables)[number];
export type DemoProfileTargetPkType = (typeof DemoProfileTargetPkTypes)[number];

export type DemoProfileJsonValue =
  | null
  | boolean
  | number
  | string
  | DemoProfileJsonValue[]
  | { [key: string]: DemoProfileJsonValue };

export const DemoProfileJsonValueSchema: z.ZodType<DemoProfileJsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(DemoProfileJsonValueSchema),
    z.record(DemoProfileJsonValueSchema),
  ])
);

const DatasetIdSchema = z
  .string()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);

const SyntheticSourceKeySchema = z
  .string()
  .min(5)
  .max(160)
  .regex(/^[a-z][a-z0-9]*(?:[-_:][a-z0-9]+)+$/i);

const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const IsoDateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/);
const DecimalStringSchema = z.string().regex(/^-?\d+(?:\.\d{1,8})?$/);
const MoneyStringSchema = z.string().regex(/^-?\d+(?:\.\d{1,2})?$/);
const PositiveIntegerStringSchema = z.string().regex(/^[1-9]\d*$/);
const OptionalPercentStringSchema = DecimalStringSchema.optional();

const SanitizedTextSchema = z.string().min(1).max(240);
const SanitizedLongTextSchema = z.string().min(1).max(2000);

export const DemoProfilePortfolioCompanyRowSchema = z
  .object({
    sourceKey: SyntheticSourceKeySchema,
    name: SanitizedTextSchema,
    sector: SanitizedTextSchema,
    stage: SanitizedTextSchema,
    currentStage: SanitizedTextSchema.optional(),
    investmentAmount: MoneyStringSchema,
    investmentDate: IsoDateSchema.optional(),
    currentValuation: MoneyStringSchema.optional(),
    foundedYear: z.number().int().min(1900).max(2200).optional(),
    status: SanitizedTextSchema.default('active'),
    description: SanitizedLongTextSchema.optional(),
    dealTags: z.array(SanitizedTextSchema).default([]),
    deployedReservesCents: z.number().int().nonnegative().optional(),
    plannedReservesCents: z.number().int().nonnegative().optional(),
    exitMoicBps: z.number().int().nonnegative().optional(),
    ownershipCurrentPct: OptionalPercentStringSchema,
    allocationCapCents: z.number().int().nonnegative().optional(),
    allocationReason: SanitizedLongTextSchema.optional(),
  })
  .strict();

export const DemoProfileInvestmentRowSchema = z
  .object({
    sourceKey: SyntheticSourceKeySchema,
    companySourceKey: SyntheticSourceKeySchema,
    investmentDate: IsoDateSchema,
    amount: MoneyStringSchema,
    round: SanitizedTextSchema,
    ownershipPercentage: OptionalPercentStringSchema,
    valuationAtInvestment: MoneyStringSchema.optional(),
    dealTags: z.array(SanitizedTextSchema).default([]),
    sharePriceCents: PositiveIntegerStringSchema.optional(),
    sharesAcquired: DecimalStringSchema.optional(),
    costBasisCents: PositiveIntegerStringSchema.optional(),
    pricingConfidence: z.enum(['calculated', 'verified']).default('calculated'),
  })
  .strict();

export const DemoProfileInvestmentLotRowSchema = z
  .object({
    sourceKey: SyntheticSourceKeySchema,
    investmentSourceKey: SyntheticSourceKeySchema,
    lotType: z.enum(['initial', 'follow_on', 'secondary']),
    sharePriceCents: PositiveIntegerStringSchema,
    sharesAcquired: DecimalStringSchema,
    costBasisCents: PositiveIntegerStringSchema,
  })
  .strict();

export const DemoProfileDealOpportunityRowSchema = z
  .object({
    sourceKey: SyntheticSourceKeySchema,
    companyName: SanitizedTextSchema,
    sector: SanitizedTextSchema,
    stage: SanitizedTextSchema,
    sourceType: SanitizedTextSchema,
    dealSize: MoneyStringSchema.optional(),
    valuation: MoneyStringSchema.optional(),
    status: SanitizedTextSchema.default('lead'),
    priority: z.enum(['high', 'medium', 'low']).default('medium'),
    foundedYear: z.number().int().min(1900).max(2200).optional(),
    employeeCount: z.number().int().nonnegative().optional(),
    revenue: MoneyStringSchema.optional(),
    description: SanitizedLongTextSchema.optional(),
    sourceNotes: SanitizedLongTextSchema.optional(),
    nextAction: SanitizedTextSchema.optional(),
    nextActionDate: IsoDateSchema.optional(),
  })
  .strict();

export const DemoProfileFundMetricRowSchema = z
  .object({
    sourceKey: SyntheticSourceKeySchema,
    metricDate: IsoDateSchema,
    asOfDate: IsoDateSchema,
    totalValue: MoneyStringSchema,
    irr: OptionalPercentStringSchema,
    multiple: OptionalPercentStringSchema,
    dpi: OptionalPercentStringSchema,
    tvpi: OptionalPercentStringSchema,
  })
  .strict();

export const DemoProfilePacingHistoryRowSchema = z
  .object({
    sourceKey: SyntheticSourceKeySchema,
    quarter: z.string().regex(/^\d{4}Q[1-4]$/),
    deploymentAmount: MoneyStringSchema,
    marketCondition: z.string().min(1).max(16).optional(),
  })
  .strict();

export const DemoProfileFundBaselineRowSchema = z
  .object({
    sourceKey: SyntheticSourceKeySchema,
    name: SanitizedTextSchema,
    description: SanitizedLongTextSchema.optional(),
    baselineType: SanitizedTextSchema,
    periodStart: IsoDateSchema,
    periodEnd: IsoDateSchema,
    snapshotDate: IsoDateSchema,
    totalValue: MoneyStringSchema,
    deployedCapital: MoneyStringSchema,
    irr: OptionalPercentStringSchema,
    multiple: OptionalPercentStringSchema,
    dpi: OptionalPercentStringSchema,
    tvpi: OptionalPercentStringSchema,
    portfolioCount: z.number().int().nonnegative().default(0),
    averageInvestment: MoneyStringSchema.optional(),
    topPerformers: DemoProfileJsonValueSchema.optional(),
    companySnapshots: DemoProfileJsonValueSchema.optional(),
    sectorDistribution: DemoProfileJsonValueSchema.optional(),
    stageDistribution: DemoProfileJsonValueSchema.optional(),
    reserveAllocation: DemoProfileJsonValueSchema.optional(),
    pacingMetrics: DemoProfileJsonValueSchema.optional(),
    isActive: z.boolean().default(true),
    isDefault: z.boolean().default(false),
    confidence: OptionalPercentStringSchema.default('1.00'),
    version: SanitizedTextSchema.default('1.0.0'),
    tags: z.array(SanitizedTextSchema).default([]),
  })
  .strict();

export const DemoProfileVarianceReportRowSchema = z
  .object({
    sourceKey: SyntheticSourceKeySchema,
    baselineSourceKey: SyntheticSourceKeySchema,
    reportName: SanitizedTextSchema,
    reportType: SanitizedTextSchema,
    reportPeriod: SanitizedTextSchema.optional(),
    analysisStart: IsoDateSchema,
    analysisEnd: IsoDateSchema,
    asOfDate: IsoDateSchema,
    currentMetrics: DemoProfileJsonValueSchema,
    baselineMetrics: DemoProfileJsonValueSchema,
    totalValueVariance: MoneyStringSchema.optional(),
    totalValueVariancePct: OptionalPercentStringSchema,
    irrVariance: OptionalPercentStringSchema,
    multipleVariance: OptionalPercentStringSchema,
    dpiVariance: OptionalPercentStringSchema,
    tvpiVariance: OptionalPercentStringSchema,
    portfolioVariances: DemoProfileJsonValueSchema.optional(),
    sectorVariances: DemoProfileJsonValueSchema.optional(),
    stageVariances: DemoProfileJsonValueSchema.optional(),
    reserveVariances: DemoProfileJsonValueSchema.optional(),
    pacingVariances: DemoProfileJsonValueSchema.optional(),
    overallVarianceScore: OptionalPercentStringSchema,
    significantVariances: DemoProfileJsonValueSchema.optional(),
    varianceFactors: DemoProfileJsonValueSchema.optional(),
    alertsTriggered: DemoProfileJsonValueSchema.optional(),
    thresholdBreaches: DemoProfileJsonValueSchema.optional(),
    riskLevel: SanitizedTextSchema.default('low'),
    calculationEngine: SanitizedTextSchema.default('variance-v1'),
    calculationDurationMs: z.number().int().nonnegative().optional(),
    dataQualityScore: OptionalPercentStringSchema,
    status: SanitizedTextSchema.default('draft'),
    isPublic: z.boolean().default(false),
    sharedWith: z.array(SanitizedTextSchema).default([]),
  })
  .strict();

export const DemoProfileBacktestResultRowSchema = z
  .object({
    sourceKey: SyntheticSourceKeySchema,
    baselineSourceKey: SyntheticSourceKeySchema.optional(),
    snapshotId: z.string().uuid().optional(),
    config: DemoProfileJsonValueSchema,
    simulationSummary: DemoProfileJsonValueSchema,
    actualPerformance: DemoProfileJsonValueSchema,
    validationMetrics: DemoProfileJsonValueSchema,
    dataQuality: DemoProfileJsonValueSchema,
    scenarioComparisons: DemoProfileJsonValueSchema.optional(),
    scenarioComparisonSummary: DemoProfileJsonValueSchema.optional(),
    recommendations: z.array(SanitizedLongTextSchema).default([]),
    executionTimeMs: z.number().int().nonnegative(),
    status: SanitizedTextSchema.default('completed'),
    errorMessage: SanitizedLongTextSchema.optional(),
    tags: z.array(SanitizedTextSchema).default([]),
    expiresAt: IsoDateTimeSchema.optional(),
  })
  .strict();

export const DemoProfileSectionsSchema = z
  .object({
    portfolioCompanies: z.array(DemoProfilePortfolioCompanyRowSchema).default([]),
    investments: z.array(DemoProfileInvestmentRowSchema).default([]),
    investmentLots: z.array(DemoProfileInvestmentLotRowSchema).default([]),
    dealOpportunities: z.array(DemoProfileDealOpportunityRowSchema).default([]),
    fundMetrics: z.array(DemoProfileFundMetricRowSchema).default([]),
    pacingHistory: z.array(DemoProfilePacingHistoryRowSchema).default([]),
    fundBaselines: z.array(DemoProfileFundBaselineRowSchema).default([]),
    varianceReports: z.array(DemoProfileVarianceReportRowSchema).default([]),
    backtestResults: z.array(DemoProfileBacktestResultRowSchema).default([]),
  })
  .strict();

const SENSITIVE_KEY_TERMS = new Set([
  'raw',
  'original',
  'external',
  'private',
  'confidential',
  'email',
  'phone',
  'website',
  'domain',
  'address',
  'wire',
  'routing',
  'account',
  'bank',
  'tax',
  'ein',
  'ssn',
]);
const SENSITIVE_VALUE_REGEX =
  /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|https?:\/\/|[A-Z]:\\|\/Users\/|\/home\/|\\Users\\|\b\d{3}-\d{2}-\d{4}\b|\b\d{2}-\d{7}\b|(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]\d{4}\b|\b(secret|confidential|private|wire|routing|iban|swift|ssn|tax id|ein)\b)/i;

export interface DemoProfileSensitiveLeak {
  path: string;
  code: 'SENSITIVE_KEY' | 'SENSITIVE_VALUE';
}

export function findDemoProfileSensitiveLeaks(
  value: unknown,
  path = '$',
  leaks: DemoProfileSensitiveLeak[] = []
): DemoProfileSensitiveLeak[] {
  if (leaks.length >= 20) {
    return leaks;
  }

  if (typeof value === 'string') {
    if (SENSITIVE_VALUE_REGEX.test(value)) {
      leaks.push({ path, code: 'SENSITIVE_VALUE' });
    }
    return leaks;
  }

  if (value === null || typeof value !== 'object') {
    return leaks;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      findDemoProfileSensitiveLeaks(item, `${path}[${index}]`, leaks);
    });
    return leaks;
  }

  for (const [key, child] of Object.entries(value)) {
    if (isSensitiveKey(key) && key !== 'sourceKey' && key !== 'sourceSystemLabel') {
      leaks.push({ path: `${path}.${key}`, code: 'SENSITIVE_KEY' });
      if (leaks.length >= 20) {
        return leaks;
      }
    }
    findDemoProfileSensitiveLeaks(child, `${path}.${key}`, leaks);
  }
  return leaks;
}

function isSensitiveKey(key: string): boolean {
  const normalized = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
  return normalized.split(/[_-]+/).some((part) => SENSITIVE_KEY_TERMS.has(part));
}

export const DemoProfileImportBundleSchema = z
  .object({
    schemaVersion: z.literal(DemoProfileImportSchemaVersion),
    datasetId: DatasetIdSchema,
    sanitized: z.literal(true),
    generatedAt: IsoDateTimeSchema,
    sourceSystemLabel: SanitizedTextSchema,
    targetProfile: z
      .object({
        profileKey: SyntheticSourceKeySchema,
        displayName: SanitizedTextSchema,
      })
      .strict(),
    sections: DemoProfileSectionsSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const leaks = findDemoProfileSensitiveLeaks(value);
    for (const leak of leaks) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${leak.code} at ${leak.path}`,
        path: ['sections'],
      });
    }
  });

export const DemoProfileImportPreviewRowSchema = z
  .object({
    section: DemoProfileSectionNameSchema,
    targetTable: DemoProfileTargetTableSchema,
    sourceKey: SyntheticSourceKeySchema,
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    action: z.enum(['insert', 'skip', 'error']),
    errorCode: z.string().optional(),
  })
  .strict();

export const DemoProfileImportPreviewSchema = z
  .object({
    datasetId: DatasetIdSchema,
    previewHash: z.string().regex(/^[a-f0-9]{64}$/),
    counts: z.record(DemoProfileSectionNameSchema, z.number().int().nonnegative()),
    rows: z.array(DemoProfileImportPreviewRowSchema),
  })
  .strict();

export const DemoProfileImportCommitSummarySchema = z
  .object({
    datasetId: DatasetIdSchema,
    previewHash: z.string().regex(/^[a-f0-9]{64}$/),
    inserted: z.record(DemoProfileTargetTableSchema, z.number().int().nonnegative()),
    skipped: z.record(DemoProfileTargetTableSchema, z.number().int().nonnegative()),
  })
  .strict();

export type DemoProfileImportBundle = z.infer<typeof DemoProfileImportBundleSchema>;
export type DemoProfileSections = z.infer<typeof DemoProfileSectionsSchema>;
export type DemoProfilePortfolioCompanyRow = z.infer<typeof DemoProfilePortfolioCompanyRowSchema>;
export type DemoProfileInvestmentRow = z.infer<typeof DemoProfileInvestmentRowSchema>;
export type DemoProfileInvestmentLotRow = z.infer<typeof DemoProfileInvestmentLotRowSchema>;
export type DemoProfileDealOpportunityRow = z.infer<typeof DemoProfileDealOpportunityRowSchema>;
export type DemoProfileFundMetricRow = z.infer<typeof DemoProfileFundMetricRowSchema>;
export type DemoProfilePacingHistoryRow = z.infer<typeof DemoProfilePacingHistoryRowSchema>;
export type DemoProfileFundBaselineRow = z.infer<typeof DemoProfileFundBaselineRowSchema>;
export type DemoProfileVarianceReportRow = z.infer<typeof DemoProfileVarianceReportRowSchema>;
export type DemoProfileBacktestResultRow = z.infer<typeof DemoProfileBacktestResultRowSchema>;
export type DemoProfileImportPreview = z.infer<typeof DemoProfileImportPreviewSchema>;
export type DemoProfileImportPreviewRow = z.infer<typeof DemoProfileImportPreviewRowSchema>;
export type DemoProfileImportCommitSummary = z.infer<typeof DemoProfileImportCommitSummarySchema>;
