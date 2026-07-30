/**
 * Internal waterfall template contract (PLAN_61 Task 16.0, ADR-064).
 *
 * A distinct internal vocabulary for LP-economics modeling. It carries no
 * legacy-migration semantics and must never import or round-trip the
 * coercing public schema in shared/types/forbidden-features (pinned by
 * tests/unit/contract/internal-economics/internal-waterfall-template.test.ts).
 */
import { z } from 'zod';

export const InternalWaterfallTemplateSchema = z.enum(['whole_fund', 'deal_by_deal']);

export type InternalWaterfallTemplate = z.infer<typeof InternalWaterfallTemplateSchema>;
