import { z } from 'zod';

import {
  CurrentForecastV2InputSchema,
  type CurrentForecastV2Input,
} from '@shared/contracts/current-forecast-v2.contract';
import {
  CurrentPlanVersionV1Schema,
  type CurrentPlanVersionV1,
} from '@shared/contracts/current-plan-version-v1.contract';
import {
  FinancialFactsSnapshotV1Schema,
  type FinancialFactsSnapshotV1,
} from '@shared/contracts/financial-facts-snapshot-v1.contract';
import { CURRENT_FORECAST_SHADOW_MISMATCH_REASONS } from '../../../server/services/current-forecast-shadow-service';

import caseBlocked from './case-blocked.json';
import emptyFacts from './empty-facts.json';
import fullFacts from './full-facts.json';
import held from './held.json';
import indicative from './indicative.json';
import partialFacts from './partial-facts.json';

/**
 * Committed deterministic replay corpus for the current-forecast shadow plane
 * (PLAN_61 Task 13.1-svc). Bases are derived from the CF truth cases
 * (`docs/current-forecast.truth-cases.json`) and span empty/partial/full
 * facts, a case-blocked basis mismatch, and a held serving base. The pinned
 * `expected.inputHash`/`expected.resultHash` values are the exact-basis replay
 * contract: any engine drift fails the replay-reproduction test.
 */

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

const ExpectationSchema = z
  .object({
    status: z.enum(['available', 'indicative', 'unavailable', 'failed']),
    inputHash: Sha256Schema.nullable(),
    resultHash: Sha256Schema.nullable(),
    methodologyVersion: z.string().min(1),
    mismatchReasons: z.array(z.enum(CURRENT_FORECAST_SHADOW_MISMATCH_REASONS)),
  })
  .strict();

const ReferenceBasisSchema = z
  .object({
    fundSnapshotId: z.number().int().positive(),
    currentPlanVersionId: z.number().int().positive(),
    financialFactsSnapshotId: z.number().int().positive(),
  })
  .strict();

const CorpusFileSchema = z
  .object({
    name: z.string().min(1),
    kind: z.enum(['evaluate', 'held']),
    sourceTruthCase: z.string().regex(/^CF-00[1-8]$/),
    input: z.unknown(),
    plan: z.unknown(),
    facts: z.unknown(),
    referenceBasis: ReferenceBasisSchema,
    expected: ExpectationSchema,
  })
  .strict();

const FactsEnvelopeSchema = z
  .object({
    id: z.number().int().positive(),
  })
  .passthrough();

export interface CurrentForecastReplayCorpusEntry {
  name: string;
  kind: 'evaluate' | 'held';
  sourceTruthCase: string;
  input: CurrentForecastV2Input;
  plan: CurrentPlanVersionV1;
  facts: FinancialFactsSnapshotV1 & { readonly id: number };
  referenceBasis: z.infer<typeof ReferenceBasisSchema>;
  expected: z.infer<typeof ExpectationSchema>;
}

function loadEntry(raw: unknown): CurrentForecastReplayCorpusEntry {
  const file = CorpusFileSchema.parse(raw);
  const input = CurrentForecastV2InputSchema.parse(file.input);
  const plan = CurrentPlanVersionV1Schema.parse(file.plan);
  const factsEnvelope = FactsEnvelopeSchema.parse(file.facts);
  const { id, ...factsWithoutId } = factsEnvelope;
  const facts = { ...FinancialFactsSnapshotV1Schema.parse(factsWithoutId), id };

  return {
    name: file.name,
    kind: file.kind,
    sourceTruthCase: file.sourceTruthCase,
    input,
    plan,
    facts,
    referenceBasis: file.referenceBasis,
    expected: file.expected,
  };
}

export const CURRENT_FORECAST_REPLAY_CORPUS: CurrentForecastReplayCorpusEntry[] = [
  fullFacts,
  indicative,
  partialFacts,
  emptyFacts,
  caseBlocked,
  held,
].map(loadEntry);
