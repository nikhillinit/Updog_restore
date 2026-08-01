/**
 * Internal economics policy contract (`internal-economics-policy/1.0.0`).
 *
 * WP-L3 P-D6: policy rows persist AUTHORED configuration only. The
 * `policy_body` JSONB column carries exactly the contract-versioned
 * assumptions modeled by `EconomicsPolicyBodyV1Schema`:
 *
 *  - waterfall template pinned to the `deal_by_deal` literal (whole_fund is
 *    a V2 publish, never silent V1 widening — D9);
 *  - `carryPct` as a finite number in [0, 1], matching the frozen period
 *    loop's own input contract;
 *  - hurdle `{ basis: 'none' }` — schema V1 admits no pref-bearing basis
 *    (`HURDLE_BASIS_UNSUPPORTED` refuses pref-bearing source configs);
 *  - explicit zero fees / empty expenses (Brief 2 zero-fee bridge posture;
 *    the call-sizing seam separately throws
 *    `NONZERO_FEE_EXPENSE_UNSUPPORTED_V1` on any nonzero schedule);
 *  - `cashBufferQuarters` as a nonnegative integer;
 *  - terminal mode plus the term anchor inputs (`termStartDate`,
 *    `fundLifeYears`) that feed `resolveTerminalPeriodEndV1`. The terminal
 *    pair itself is persisted in dedicated columns written exclusively via
 *    the exported terminal-policy projection helpers (G11/ADR-065 item 8);
 *    this module performs no date arithmetic of its own.
 *
 * Also here:
 *  - `EconomicsPolicyCreateRequestV1Schema` — source-config ref + pinned
 *    capital-envelope version + authored body (section 5 service surface);
 *  - the policy-seed refusal registry (HTTP 422, no policy created;
 *    scoping-design lines 774-797, section 5 list verbatim);
 *  - `EconomicsPolicyNormalizationWarningV1Schema` — the persisted
 *    provenance shape for dormant-but-disabled parameter normalization.
 *    Warnings persist in `normalization_warnings` JSONB and participate in
 *    `assumptions_hash` (D4 review-added requirement; G14's explicit
 *    clawback active/dormant determination records `provenance:
 *    'explicit' | 'defaulted'` per resolved parameter).
 *
 * Schema-only module: no hashing, no Node crypto.
 *
 * Governing plan: docs/superpowers/plans/
 * 2026-07-31-task163-wp-l3-service-persistence-plan.md (P-D6, section 5,
 * section 11 T-B2).
 *
 * @module shared/contracts/internal-economics/economics-policy-v1.contract
 */
import { z } from 'zod';

import { TerminalModeV1Schema } from './terminal-policy-v1.contract';

export const ECONOMICS_POLICY_CONTRACT_VERSION = 'internal-economics-policy/1.0.0' as const;

/**
 * Policy-seed refusal registry (HTTP 422, nothing persisted). Order and
 * literals are the ratified registry's policy-seed phase verbatim
 * (scoping-design lines 774-797). `CREDIT_FACILITY_UNSUPPORTED` is
 * issue-mandated and reserved (structurally unreachable in V1 seeds).
 */
export const ECONOMICS_POLICY_SEED_REFUSAL_CODES_V1 = [
  'CATCH_UP_UNSUPPORTED',
  'CLAWBACK_UNSUPPORTED',
  'ESCROW_UNSUPPORTED',
  'RECYCLING_UNSUPPORTED',
  'HURDLE_BASIS_UNSUPPORTED',
  'FUND_LIFE_ABSENT',
  'FUND_LIFE_GRID_UNREPRESENTABLE',
  'FUND_TERM_START_ABSENT',
  'EVERGREEN_STATUS_ABSENT',
  'EVERGREEN_UNSUPPORTED',
  'CREDIT_FACILITY_UNSUPPORTED',
] as const;

export const EconomicsPolicySeedRefusalCodeV1Schema = z.enum(
  ECONOMICS_POLICY_SEED_REFUSAL_CODES_V1
);
export type EconomicsPolicySeedRefusalCodeV1 = z.infer<
  typeof EconomicsPolicySeedRefusalCodeV1Schema
>;

const ZERO_MONEY_LITERAL = '0.000000' as const;

/**
 * Positive decimal-string years (e.g. '10', '10.25'). Grid representability
 * (`fundLifeYears * 4` must be a positive integer quarter count) is enforced
 * by the terminal-policy helpers at seed time, not by this shape.
 */
const PositiveDecimalStringSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/)
  // Canonical unsigned decimal strings are positive exactly when they carry a
  // nonzero digit (pure string check; zod string checks are non-fatal, so a
  // numeric-parse refinement here could run on non-matching input).
  .refine((value) => /[1-9]/.test(value), 'fundLifeYears must be positive.');

/** Authored V1 policy assumptions persisted verbatim in `policy_body`. */
export const EconomicsPolicyBodyV1Schema = z
  .object({
    waterfallTemplate: z.literal('deal_by_deal'),
    carryPct: z.number().finite().min(0).max(1),
    hurdle: z.object({ basis: z.literal('none') }).strict(),
    managementFeesUsd: z.literal(ZERO_MONEY_LITERAL),
    fundExpenses: z.tuple([]),
    cashBufferQuarters: z.number().int().nonnegative(),
    terminalMode: TerminalModeV1Schema,
    termStartDate: z.string().date(),
    fundLifeYears: PositiveDecimalStringSchema,
  })
  .strict();
export type EconomicsPolicyBodyV1 = Readonly<z.infer<typeof EconomicsPolicyBodyV1Schema>>;

/**
 * Policy creation request: the pinned capital-envelope version (P-D6 — the
 * policy pins the envelope; runs never re-select it), the seed source-config
 * lineage, and the authored body. Version allocation is the service's
 * advisory-lock protocol (P-D11) and never travels in the request.
 */
export const EconomicsPolicyCreateRequestV1Schema = z
  .object({
    capitalEnvelopeVersionId: z.number().int().positive(),
    sourceConfigId: z.number().int().positive(),
    sourceConfigVersion: z.number().int().positive(),
    body: EconomicsPolicyBodyV1Schema,
  })
  .strict();
export type EconomicsPolicyCreateRequestV1 = Readonly<
  z.infer<typeof EconomicsPolicyCreateRequestV1Schema>
>;

export const ECONOMICS_POLICY_NORMALIZATION_PROVENANCE_V1 = ['explicit', 'defaulted'] as const;

/**
 * Persisted normalization-warning provenance (dormant-but-disabled
 * parameters normalize with warnings, never silently). Rows persist in
 * `normalization_warnings` and participate in `assumptions_hash`, so two
 * policies differing only in dormant parameters hash differently.
 */
export const EconomicsPolicyNormalizationWarningV1Schema = z
  .object({
    /** Normalized parameter name, e.g. 'clawbackEnabled'. */
    parameter: z.string().min(1),
    /** Whether the resolved value came from the source config or a default. */
    provenance: z.enum(ECONOMICS_POLICY_NORMALIZATION_PROVENANCE_V1),
    /** Resolved value, string-encoded for deterministic JSONB/hash content. */
    resolvedValue: z.string(),
    /** Human-readable normalization outcome. */
    detail: z.string().min(1),
  })
  .strict();
export type EconomicsPolicyNormalizationWarningV1 = Readonly<
  z.infer<typeof EconomicsPolicyNormalizationWarningV1Schema>
>;
