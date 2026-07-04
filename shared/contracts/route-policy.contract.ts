import { z } from 'zod';

export const FinancialSurfaceSchema = z.enum([
  'none',
  'fund_modeling',
  'portfolio_management',
  'moic_reserves',
  'lp_reporting',
  'export_artifact',
]);

export const ApiAuthBoundarySchema = z.enum([
  'none_public',
  'signed_public_share',
  'require_auth',
  'require_auth_and_fund_access',
  'require_auth_fund_access_and_role',
  'require_auth_and_lp_access',
  'admin_only',
  'dev_only',
]);

export const FundScopeModeSchema = z.enum([
  'none',
  'route_param_fund_id',
  'query_param_fund_id',
  'parent_entity_lookup',
  'lp_claim_scope',
  'share_token_scope',
  'not_applicable',
]);

export const ExportPolicySchema = z.enum([
  'not_exportable',
  'preview_only',
  'admin_only_watermarked',
  'qualified_exportable',
]);

export const RouteLifecycleSchema = z.enum(['durable_crud', 'prototype_501', 'static_template']);

export const RoutePolicyEntrySchema = z
  .object({
    id: z.string().min(1),
    method: z.string().min(1).optional(),
    path: z.string().min(1),
    lifecycle: RouteLifecycleSchema,
    governanceRef: z.string().min(1),
    surface: z.string().min(1),
    owner: z.string().min(1),
    telemetryKey: z.string().min(1),
    financialSurface: FinancialSurfaceSchema,
    apiAuthBoundary: ApiAuthBoundarySchema,
    fundScopeMode: FundScopeModeSchema,
    workflowRequirement: z.string().min(1).nullable(),
    exportPolicy: ExportPolicySchema,
    provenanceRequired: z.boolean(),
    staleBlocksExport: z.boolean(),
    staleBlocksRender: z.boolean(),
    humanReviewRequired: z.boolean(),
    performanceBudgetMs: z.number().nullable(),
    notes: z.string().min(1).optional(),
  })
  .strict();

export type FinancialSurface = z.infer<typeof FinancialSurfaceSchema>;
export type ApiAuthBoundary = z.infer<typeof ApiAuthBoundarySchema>;
export type FundScopeMode = z.infer<typeof FundScopeModeSchema>;
export type ExportPolicy = z.infer<typeof ExportPolicySchema>;
export type RouteLifecycle = z.infer<typeof RouteLifecycleSchema>;
export type RoutePolicyEntry = z.infer<typeof RoutePolicyEntrySchema>;
