import {
  ProvenanceEnvelopeSchema,
  type ProvenanceEnvelope,
  type StructuredWarning,
} from '../../shared/contracts/provenance-envelope.contract';
import { canonicalSha256 } from '../../shared/lib/canonical-hash';

type HashParams = {
  fundId: number;
  baseCurrency: string;
  activeRounds: unknown[];
  activeOverrides: unknown[];
  parentInvestments: unknown[];
  companies: unknown[];
};

type FactoryParams = {
  now: Date;
  hashParams: HashParams;
  structuredWarnings: StructuredWarning[];
  sourceAsOf?: string;
  staleAfterSeconds?: number;
};

export function buildRoundsInputHashInput(params: HashParams): HashParams {
  return {
    fundId: params.fundId,
    baseCurrency: params.baseCurrency,
    activeRounds: params.activeRounds,
    activeOverrides: params.activeOverrides,
    parentInvestments: params.parentInvestments,
    companies: params.companies,
  };
}

export function buildRoundsAssumptionsHashInput(): Record<string, string | number> {
  return {
    rulesVersion: 'rounds-to-model-v1',
    amountTolerancePct: '0.01',
    minRoundReconciliationToleranceUsd: '25000',
    dateToleranceDays: 14,
    unsupportedSecurityTypePolicy: 'amount_only_or_unavailable',
    currencyPolicy: 'post_override_fund_base_currency',
    roleClassificationPolicy: 'override_before_currency_decimal_initial_vs_followon',
  };
}

function hashes(
  hashParams: HashParams
): Pick<ProvenanceEnvelope['core'], 'inputHash' | 'assumptionsHash'> {
  return {
    inputHash: canonicalSha256(buildRoundsInputHashInput(hashParams)),
    assumptionsHash: canonicalSha256(buildRoundsAssumptionsHashInput()),
  };
}

export function makeLiveRoundsProvenance(params: FactoryParams): ProvenanceEnvelope {
  return ProvenanceEnvelopeSchema.parse({
    trustState: 'LIVE',
    core: {
      sourceKind: 'computed',
      actionability: 'actionable',
      sourceEngine: 'rounds-to-model',
      engineVersion: 'rounds-to-model-v1',
      ...hashes(params.hashParams),
      generatedAt: params.now.toISOString(),
      isFinanciallyActionable: true,
      warnings: [],
    },
    structuredWarnings: params.structuredWarnings,
    sourceAsOf: params.sourceAsOf,
    staleAfterSeconds: params.staleAfterSeconds,
  });
}

export function makePartialRoundsProvenance(params: FactoryParams): ProvenanceEnvelope {
  return ProvenanceEnvelopeSchema.parse({
    trustState: 'PARTIAL',
    core: {
      sourceKind: 'computed',
      actionability: 'input_only',
      sourceEngine: 'rounds-to-model',
      engineVersion: 'rounds-to-model-v1',
      ...hashes(params.hashParams),
      generatedAt: params.now.toISOString(),
      isFinanciallyActionable: false,
      warnings: [],
    },
    structuredWarnings: params.structuredWarnings,
    sourceAsOf: params.sourceAsOf,
    staleAfterSeconds: params.staleAfterSeconds,
  });
}

export function makeCurrencyBlockedProvenance(params: FactoryParams): ProvenanceEnvelope {
  return ProvenanceEnvelopeSchema.parse({
    trustState: 'UNAVAILABLE',
    core: {
      sourceKind: 'computed',
      actionability: 'quarantined',
      sourceEngine: 'rounds-to-model',
      engineVersion: 'rounds-to-model-v1',
      ...hashes(params.hashParams),
      generatedAt: params.now.toISOString(),
      isFinanciallyActionable: false,
      quarantineReason: 'currency_mismatch',
      warnings: [],
    },
    structuredWarnings: params.structuredWarnings,
    sourceAsOf: params.sourceAsOf,
    staleAfterSeconds: params.staleAfterSeconds,
  });
}

export function makeAdapterFailedProvenance(params: {
  now: Date;
  message: string;
}): ProvenanceEnvelope {
  return ProvenanceEnvelopeSchema.parse({
    trustState: 'FAILED',
    core: {
      sourceKind: 'prototype_blocked',
      actionability: 'non_actionable',
      generatedAt: params.now.toISOString(),
      isFinanciallyActionable: false,
      quarantineReason: 'round_adapter_failed',
      warnings: [params.message],
    },
    structuredWarnings: [
      {
        code: 'ROUND_ADAPTER_FAILED',
        severity: 'blocking',
        message: params.message,
      },
    ],
  });
}
