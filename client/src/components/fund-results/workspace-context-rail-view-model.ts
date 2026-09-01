import type { CurrentPlanVersionV1 } from '@shared/contracts/current-plan-version-v1.contract';
import type { DualForecastCurrentForecastV2 } from '@shared/contracts/dual-forecast/dual-forecast-response.contract';
import {
  buildHeldNotice,
  formatFactsFreshness,
  type HeldNotice,
} from '@/lib/dual-forecast-display';
import type {
  FinancialFactsLatestRead,
  FundWorkspaceContextValue,
  WorkspaceViewPreset,
} from '@/contexts/FundWorkspaceContext';

export interface WorkspaceContextRailHash {
  key: 'input' | 'result' | 'assumptions';
  label: string;
  fullHash: string | null;
  shortHash: string | null;
}

export interface WorkspaceContextRailEvidenceItem {
  kind: 'snapshot' | 'observation' | 'reconciliation' | 'resolved-term';
  label: string;
  detail: string;
  href: null;
  disabledReason: string;
}

export type WorkspaceContextRailBasisState = 'live' | 'held' | 'unavailable' | 'pending' | 'error';

/** Transport state of a source read feeding the rail. */
export type WorkspaceContextRailSourceStatus = 'pending' | 'error' | 'ready';

/**
 * Accepted-facts freshness state: `pending` (read in flight), `error`
 * (transport/schema failure), `absent` (genuine 404 — no accepted snapshot),
 * `ready` (freshness data present).
 */
export type WorkspaceContextRailFactsState = 'pending' | 'error' | 'absent' | 'ready';

export type WorkspaceContextRailSectionKey =
  'identity' | 'basis' | 'freshness' | 'bridge' | 'recompute' | 'evidence';

// Presets are presentation filters only (plan design basis 2): they reorder
// rail section emphasis, never queries, actions, or authorization.
const SECTION_ORDER_BY_PRESET: Record<
  WorkspaceViewPreset,
  readonly WorkspaceContextRailSectionKey[]
> = {
  gp: ['identity', 'basis', 'freshness', 'bridge', 'recompute', 'evidence'],
  analyst: ['basis', 'evidence', 'identity', 'freshness', 'bridge', 'recompute'],
  operations: ['recompute', 'freshness', 'identity', 'basis', 'bridge', 'evidence'],
};

export interface WorkspaceContextRailViewModel {
  fundId: number;
  fundLabel: string;
  vehicle: {
    id: string | null;
    label: string;
    disabledReason: string | null;
  };
  context: {
    asOfDate: string | null;
    asOfLabel: string;
    currentPlanVersionId: string | null;
    planLabel: string;
    planDetail: string | null;
  };
  basis: {
    state: WorkspaceContextRailBasisState;
    label: string;
    asOfDate: string | null;
    asOfLabel: string;
    currentPlanVersionId: string | null;
    planLabel: string;
    servedHashes: readonly WorkspaceContextRailHash[];
    unavailableReasons: readonly string[];
    errorDetail: string | null;
    heldDisclosure: HeldNotice | null;
  };
  factsState: WorkspaceContextRailFactsState;
  factsFreshness: {
    asOfDate: string;
    label: string;
    inputHash: string;
    shortHash: string;
  } | null;
  bridge: {
    disabledReason: string;
  };
  recompute: {
    enabled: boolean;
    disabledReason: string | null;
  };
  evidence: readonly WorkspaceContextRailEvidenceItem[];
  viewPreset: WorkspaceViewPreset;
  sectionOrder: readonly WorkspaceContextRailSectionKey[];
}

export interface WorkspaceContextRailViewModelInput {
  context: Pick<
    FundWorkspaceContextValue,
    'fundId' | 'vehicleId' | 'asOfDate' | 'currentPlanVersionId' | 'viewPreset'
  >;
  fundName?: string | null;
  currentForecastV2?: DualForecastCurrentForecastV2;
  /** Transport state of the dual-forecast read; defaults to `ready`. */
  forecastStatus?: WorkspaceContextRailSourceStatus;
  forecastErrorDetail?: string | null;
  factsLatest?: FinancialFactsLatestRead | null;
  /** Transport state of the facts-latest read; defaults to `ready`. */
  factsStatus?: WorkspaceContextRailSourceStatus;
  planVersions?: readonly CurrentPlanVersionV1[];
  recomputeEnabled?: boolean;
  recomputeDisabledReason?: string | null;
}

function formatAsOfDate(asOfDate: string | null): string {
  if (asOfDate === null) {
    return 'Basis unavailable';
  }

  const date = new Date(asOfDate);
  if (Number.isNaN(date.getTime())) {
    return 'Basis unavailable';
  }

  return `As of ${date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })}`;
}

function shortHash(hash: string | null): string | null {
  return hash === null ? null : hash.slice(0, 8);
}

function planDisplay(
  currentPlanVersionId: string | null,
  planVersions: readonly CurrentPlanVersionV1[]
): { label: string; detail: string | null } {
  if (currentPlanVersionId === null) {
    return { label: 'Basis unavailable', detail: null };
  }

  const version = planVersions.find((candidate) => candidate.id === currentPlanVersionId);
  if (!version) {
    return { label: 'Served plan version', detail: currentPlanVersionId };
  }

  return { label: `Plan v${version.version}`, detail: currentPlanVersionId };
}

function servedHashes(block: DualForecastCurrentForecastV2): WorkspaceContextRailHash[] {
  return [
    {
      key: 'input',
      label: 'Input hash',
      fullHash: block.inputHash,
      shortHash: shortHash(block.inputHash),
    },
    {
      key: 'result',
      label: 'Result hash',
      fullHash: block.resultHash,
      shortHash: shortHash(block.resultHash),
    },
    {
      key: 'assumptions',
      label: 'Assumptions hash',
      fullHash: block.assumptionsHash,
      shortHash: shortHash(block.assumptionsHash),
    },
  ];
}

function basisModel(
  block: DualForecastCurrentForecastV2 | undefined,
  planVersions: readonly CurrentPlanVersionV1[],
  sourceStatus: WorkspaceContextRailSourceStatus,
  errorDetail: string | null
): WorkspaceContextRailViewModel['basis'] {
  // Transport states are never presented as domain unavailability: a read in
  // flight or a failed read says nothing about whether a forecast is served.
  if (sourceStatus === 'pending') {
    return {
      state: 'pending',
      label: 'Loading',
      asOfDate: null,
      asOfLabel: 'Loading',
      currentPlanVersionId: null,
      planLabel: 'Loading',
      servedHashes: [],
      unavailableReasons: [],
      errorDetail: null,
      heldDisclosure: null,
    };
  }

  if (sourceStatus === 'error') {
    return {
      state: 'error',
      label: 'Load error',
      asOfDate: null,
      asOfLabel: 'Not loaded',
      currentPlanVersionId: null,
      planLabel: 'Not loaded',
      servedHashes: [],
      unavailableReasons: [],
      errorDetail: errorDetail?.trim() || 'The served forecast could not be loaded.',
      heldDisclosure: null,
    };
  }

  if (!block) {
    return {
      state: 'unavailable',
      label: 'Basis unavailable',
      asOfDate: null,
      asOfLabel: 'Basis unavailable',
      currentPlanVersionId: null,
      planLabel: 'Basis unavailable',
      servedHashes: [],
      unavailableReasons: ['No served current forecast was returned.'],
      errorDetail: null,
      heldDisclosure: null,
    };
  }

  const isUnavailable = block.engineStatus === 'unavailable' || block.engineStatus === 'failed';
  if (isUnavailable) {
    const reasons = block.unavailableReasons.map((reason) => reason.detail);
    return {
      state: 'unavailable',
      label: 'Basis unavailable',
      asOfDate: null,
      asOfLabel: 'Basis unavailable',
      currentPlanVersionId: null,
      planLabel: 'Basis unavailable',
      servedHashes: [],
      unavailableReasons:
        reasons.length > 0 ? reasons : ['The current forecast basis is unavailable.'],
      errorDetail: null,
      heldDisclosure: null,
    };
  }

  const heldDisclosure = buildHeldNotice(block);
  const plan = planDisplay(block.currentPlanVersionId, planVersions);
  return {
    state: block.status === 'held' ? 'held' : 'live',
    label:
      block.status === 'held'
        ? 'Held reference'
        : block.engineStatus === 'indicative'
          ? 'Indicative'
          : 'Live',
    asOfDate: block.asOfDate,
    asOfLabel: formatAsOfDate(block.asOfDate),
    currentPlanVersionId: block.currentPlanVersionId,
    planLabel: plan.label,
    servedHashes: servedHashes(block),
    unavailableReasons: [],
    errorDetail: null,
    heldDisclosure,
  };
}

// Deviation 5: the facts-latest read has no correlation to the served
// (possibly held/pinned) basis, so latest-facts data appears ONLY under the
// freshness label. Basis evidence rows stay unavailable-with-reason until a
// basis-correlated read contract exists; only the snapshot row carries the
// served block's own hashes.
function evidenceModel(
  basis: WorkspaceContextRailViewModel['basis']
): WorkspaceContextRailEvidenceItem[] {
  const servedIdentity = basis.servedHashes
    .filter((hash) => hash.shortHash !== null)
    .map((hash) => `${hash.label}: ${hash.shortHash}`)
    .join(' · ');
  const snapshotDetail =
    servedIdentity ||
    (basis.state === 'pending'
      ? 'Loading served basis'
      : basis.state === 'error'
        ? 'Served basis could not be loaded'
        : 'Basis unavailable');

  return [
    {
      kind: 'snapshot',
      label: 'Result snapshot',
      detail: snapshotDetail,
      href: null,
      disabledReason: 'Snapshot viewer not yet available',
    },
    {
      kind: 'observation',
      label: 'Observation',
      detail: 'Basis-matched observations are not identifiable from this read',
      href: null,
      disabledReason: 'Basis-correlated observation read not yet available',
    },
    {
      kind: 'reconciliation',
      label: 'Reconciliation',
      detail: 'Basis-matched reconciliation is not identifiable from this read',
      href: null,
      disabledReason: 'Basis-matched reconciliation not yet identifiable',
    },
    {
      kind: 'resolved-term',
      label: 'Resolved terms',
      detail: 'Basis-matched resolved terms are not identifiable from this read',
      href: null,
      disabledReason: 'Basis-correlated resolved-terms read not yet available',
    },
  ];
}

export function buildWorkspaceContextRailViewModel(
  input: WorkspaceContextRailViewModelInput
): WorkspaceContextRailViewModel {
  const {
    context,
    factsLatest,
    planVersions = [],
    currentForecastV2,
    forecastStatus = 'ready',
    forecastErrorDetail = null,
    factsStatus = 'ready',
    recomputeEnabled = false,
    recomputeDisabledReason = 'Recompute requires an idempotency-keyed command',
  } = input;
  const plan = planDisplay(context.currentPlanVersionId, planVersions);
  const basis = basisModel(currentForecastV2, planVersions, forecastStatus, forecastErrorDetail);
  const factsState: WorkspaceContextRailFactsState =
    factsStatus === 'pending'
      ? 'pending'
      : factsStatus === 'error'
        ? 'error'
        : factsLatest
          ? 'ready'
          : 'absent';
  const factsFreshness =
    factsState === 'ready' && factsLatest
      ? {
          asOfDate: factsLatest.asOfDate,
          label: formatFactsFreshness(factsLatest.asOfDate, factsLatest.snapshotInputHash),
          inputHash: factsLatest.snapshotInputHash,
          shortHash: factsLatest.snapshotInputHash.slice(0, 8),
        }
      : null;

  // Identity slots follow their source read's transport state: unavailable
  // wording is a domain claim and only renders after a settled read proves
  // genuine absence. Vehicle identity comes from the facts read; as-of and
  // plan come from the served forecast read.
  const vehicle =
    factsStatus === 'pending'
      ? { id: null, label: 'Loading', disabledReason: null }
      : factsStatus === 'error'
        ? { id: null, label: 'Not loaded', disabledReason: 'Accepted facts could not be loaded.' }
        : {
            id: context.vehicleId,
            label:
              context.vehicleId === null ? 'Vehicle unavailable' : `Vehicle ${context.vehicleId}`,
            disabledReason:
              context.vehicleId === null
                ? 'A single main fund vehicle is required; accepted facts did not provide one.'
                : null,
          };
  const contextIdentity =
    forecastStatus === 'pending'
      ? { asOfLabel: 'Loading', planLabel: 'Loading', planDetail: null }
      : forecastStatus === 'error'
        ? { asOfLabel: 'Not loaded', planLabel: 'Not loaded', planDetail: null }
        : {
            asOfLabel: formatAsOfDate(context.asOfDate),
            planLabel: plan.label,
            planDetail: plan.detail,
          };

  return {
    fundId: context.fundId,
    fundLabel:
      input.fundName?.trim() ||
      (context.fundId > 0 ? `Fund ${context.fundId}` : 'No fund selected'),
    vehicle,
    context: {
      asOfDate: context.asOfDate,
      asOfLabel: contextIdentity.asOfLabel,
      currentPlanVersionId: context.currentPlanVersionId,
      planLabel: contextIdentity.planLabel,
      planDetail: contextIdentity.planDetail,
    },
    basis,
    factsState,
    factsFreshness,
    bridge: {
      disabledReason: 'Bridge amounts not yet exposed by an authorized read contract',
    },
    recompute: {
      enabled: recomputeEnabled,
      disabledReason: recomputeEnabled ? null : recomputeDisabledReason,
    },
    evidence: evidenceModel(basis),
    viewPreset: context.viewPreset,
    sectionOrder: SECTION_ORDER_BY_PRESET[context.viewPreset],
  };
}

export const buildWorkspaceContextRailModel = buildWorkspaceContextRailViewModel;
