import {
  CAPITAL_SOURCE_INTERPRETATION_VERSION,
  type CapitalIssueV1,
  type CapitalPlanningResultV1,
} from '@shared/contracts/capital-planning-v1.contract';
import {
  CreateFundScenarioSetV3Schema,
  FundScenarioCapitalSourceResponseV1Schema,
  type CreateFundScenarioSetV3,
} from '@shared/contracts/fund-scenario-sets-v1.contract';
import { canonicalJson } from '@shared/lib/canonical-json-serialization';
import {
  CapitalPlanningCalculationError,
  parseCalculation,
  refuseCalculation,
} from '@shared/lib/capital-planning/calculation-support';
import { calculateCapitalPlanningV1 } from '@shared/lib/capital-planning/capital-planning-v1';
import {
  materializeCapitalProjectionPreview,
  type CapitalMaterializationResult,
} from '@shared/lib/capital-planning/source-materialization-core';
import { sha256Bytes } from './hash';

export type CapitalPlanReviewResult =
  | {
      ok: true;
      request: CreateFundScenarioSetV3;
      materialization: Extract<CapitalMaterializationResult, { ok: true }>;
      results: CapitalPlanningResultV1[];
    }
  | { ok: false; issues: CapitalIssueV1[] };

/** Local review only. The caller invalidates stale generations and owns the Save request. */
export async function reviewCapitalPlanDraft(args: {
  fundId: number;
  source: unknown;
  request: unknown;
}): Promise<CapitalPlanReviewResult> {
  try {
    // Zod returns private parsed copies before the asynchronous digest starts.
    const source = parseCalculation(
      FundScenarioCapitalSourceResponseV1Schema,
      args.source,
      'source'
    );
    const request = parseCalculation(CreateFundScenarioSetV3Schema, args.request, 'request');
    const pins = [
      ['fundId', source.projection.fundId, args.fundId],
      ['expectedSourceConfigId', source.projection.sourceConfigId, request.expectedSourceConfigId],
      [
        'expectedSourceConfigVersion',
        source.projection.sourceConfigVersion,
        request.expectedSourceConfigVersion,
      ],
      ['expectedSourceBundleHash', source.sourceBundleHash, request.expectedSourceBundleHash],
    ] as const;
    for (const [path, actual, expected] of pins) {
      if (actual !== expected)
        refuseCalculation(
          'SOURCE_BUNDLE_INCONSISTENT',
          path,
          'The draft and captured source identity disagree'
        );
    }
    if (
      source.interpretationVersion !== CAPITAL_SOURCE_INTERPRETATION_VERSION ||
      request.expectedInterpretationVersion !== CAPITAL_SOURCE_INTERPRETATION_VERSION ||
      source.interpretationCompatibility.state !== 'CURRENT' ||
      source.interpretationCompatibility.savedVersion !== source.interpretationVersion ||
      source.interpretationCompatibility.currentVersion !== CAPITAL_SOURCE_INTERPRETATION_VERSION
    )
      refuseCalculation(
        'INTERPRETATION_VERSION_UNSUPPORTED',
        'expectedInterpretationVersion',
        'Fresh review requires the current source interpretation',
        'unsupported'
      );
    let serializedProjection: string;
    try {
      serializedProjection = canonicalJson((args.source as { projection: unknown }).projection);
    } catch {
      refuseCalculation(
        'INVALID_INPUT',
        'source.projection',
        'Expected a strict JSON source projection'
      );
    }
    if (serializedProjection !== canonicalJson(source.projection))
      refuseCalculation(
        'SOURCE_BUNDLE_INCONSISTENT',
        'source.projection',
        'Parsing changed the source projection'
      );
    const digest = await sha256Bytes(new TextEncoder().encode(serializedProjection));
    if (digest !== source.sourceBundleHash)
      refuseCalculation(
        'SOURCE_BUNDLE_INCONSISTENT',
        'sourceBundleHash',
        'The source projection digest does not match its captured hash'
      );
    const materialization = materializeCapitalProjectionPreview({
      source,
      inputs: request.variants.map((variant) => variant.override.payload),
      unitDeclarations: request.unitDeclarations,
      expectedInterpretationVersion: request.expectedInterpretationVersion,
    });
    if (!materialization.ok) return { ok: false, issues: materialization.issues };
    const results = request.variants.map((variant, index) => {
      const payload = variant.override.payload;
      return calculateCapitalPlanningV1({
        input:
          materialization.resolvedInputs?.[index] ?? ('input' in payload ? payload.input : payload),
        sourceBundle: materialization.sourceBundle,
        ...(materialization.benchmarkSnapshotsByInput === undefined
          ? {}
          : { benchmarkSnapshots: materialization.benchmarkSnapshotsByInput[index]! }),
      });
    });
    return { ok: true, request, materialization, results };
  } catch (error) {
    if (error instanceof CapitalPlanningCalculationError)
      return { ok: false, issues: error.issues };
    throw error;
  }
}
