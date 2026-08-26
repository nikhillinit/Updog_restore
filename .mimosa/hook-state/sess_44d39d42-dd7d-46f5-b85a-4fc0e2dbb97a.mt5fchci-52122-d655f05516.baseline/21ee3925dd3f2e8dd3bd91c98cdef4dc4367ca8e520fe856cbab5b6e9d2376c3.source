/**
 * Internal waterfall template contract (PLAN_61 Task 16.0, ADR-064).
 *
 * A distinct internal vocabulary for LP-economics modeling. It carries no
 * legacy-migration semantics and must never import or round-trip the public
 * vocabulary schema in shared/types/forbidden-features (pinned by
 * tests/unit/contract/internal-economics/internal-waterfall-template.test.ts).
 *
 * ADR-068 restored the public whole-fund term and replaced that schema's
 * silent coercion with an honest two-value enum. The boundary rule is
 * unchanged: this contract stays independent, and the sanctioned public ->
 * internal bridge is the adapter built under issue #1305, not an import here.
 */
import { z } from 'zod';

export const InternalWaterfallTemplateSchema = z.enum(['whole_fund', 'deal_by_deal']);

export type InternalWaterfallTemplate = z.infer<typeof InternalWaterfallTemplateSchema>;
