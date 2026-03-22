/**
 * Unit tests for deriveReadState() -- pure function, no DB mock needed.
 *
 * Covers all 8 derivation rules plus legacy fallback and edge cases.
 */

import { describe, it, expect } from 'vitest';
import { deriveReadState } from '../../../server/services/fund-state-derivation';
import type { DerivationInput } from '../../../server/services/fund-state-derivation';
import { EXPECTED_SNAPSHOT_TYPES } from '@shared/contracts/fund-state-read-v1.contract';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseInput(overrides: Partial<DerivationInput> = {}): DerivationInput {
  return {
    fundId: 1,
    draftConfig: null,
    publishedConfig: null,
    latestVersion: null,
    latestRun: null,
    attributedSnapshots: [],
    engineResultsPresent: false,
    ...overrides,
  };
}

const NOW = new Date('2026-03-20T12:00:00.000Z');
const EARLIER = new Date('2026-03-20T11:00:00.000Z');

describe('deriveReadState', () => {
  // Case 1: No published config -> not_requested, hasPublished === false
  it('returns not_requested when no published config exists', () => {
    const result = deriveReadState(baseInput({ draftConfig: { version: 1, updatedAt: NOW } }));

    expect(result.calculationState.status).toBe('not_requested');
    expect(result.configState.hasPublished).toBe(false);
    expect(result.configState.hasDraft).toBe(true);
    expect(result.configState.draftVersion).toBe(1);
  });

  // Case 2: Published, no calcRun -> not_requested, hasPublished === true
  it('returns not_requested when published but no calcRun exists', () => {
    const result = deriveReadState(
      baseInput({
        publishedConfig: { version: 1, publishedAt: NOW, updatedAt: NOW },
        latestVersion: 1,
      })
    );

    expect(result.calculationState.status).toBe('not_requested');
    expect(result.calculationState.configVersion).toBeNull();
    expect(result.configState.hasPublished).toBe(true);
    expect(result.configState.publishedVersion).toBe(1);
  });

  // Case 3: Pending run -> submitted, runId/correlationId populated
  it('returns submitted when run is pending', () => {
    const result = deriveReadState(
      baseInput({
        publishedConfig: { version: 2, publishedAt: NOW, updatedAt: NOW },
        latestVersion: 2,
        latestRun: {
          id: 10,
          configVersion: 2,
          correlationId: 'corr-abc',
          dispatchState: 'pending',
          lastError: null,
        },
      })
    );

    expect(result.calculationState.status).toBe('submitted');
    expect(result.calculationState.runId).toBe(10);
    expect(result.calculationState.correlationId).toBe('corr-abc');
  });

  // Case 4: Dispatched, no snapshots -> calculating, availableSnapshotTypes === []
  it('returns calculating when dispatched with no snapshots', () => {
    const result = deriveReadState(
      baseInput({
        publishedConfig: { version: 1, publishedAt: NOW, updatedAt: NOW },
        latestVersion: 1,
        latestRun: {
          id: 5,
          configVersion: 1,
          correlationId: 'corr-1',
          dispatchState: 'dispatched',
          lastError: null,
        },
      })
    );

    expect(result.calculationState.status).toBe('calculating');
    expect(result.calculationState.availableSnapshotTypes).toEqual([]);
  });

  // Case 5: Dispatched, RESERVE+PACING snapshots matching configVersion -> ready
  it('returns ready when all expected snapshots are attributed', () => {
    const snapshotTime = new Date('2026-03-20T11:30:00.000Z');
    const result = deriveReadState(
      baseInput({
        publishedConfig: { version: 3, publishedAt: EARLIER, updatedAt: EARLIER },
        latestVersion: 3,
        latestRun: {
          id: 20,
          configVersion: 3,
          correlationId: 'corr-ready',
          dispatchState: 'dispatched',
          lastError: null,
        },
        attributedSnapshots: [
          { type: 'RESERVE', configVersion: 3, snapshotTime, createdAt: snapshotTime },
          { type: 'PACING', configVersion: 3, snapshotTime: NOW, createdAt: NOW },
        ],
      })
    );

    expect(result.calculationState.status).toBe('ready');
    expect(result.calculationState.availableSnapshotTypes).toContain('RESERVE');
    expect(result.calculationState.availableSnapshotTypes).toContain('PACING');
    expect(result.calculationState.lastCalculatedAt).toBe(NOW.toISOString());
    expect(result.calculationState.legacyEvidence).toBe(false);
  });

  // Case 6: Failed run, no snapshots -> failed, lastError populated
  it('returns failed when run failed and no prior snapshots', () => {
    const result = deriveReadState(
      baseInput({
        publishedConfig: { version: 1, publishedAt: NOW, updatedAt: NOW },
        latestVersion: 1,
        latestRun: {
          id: 7,
          configVersion: 1,
          correlationId: 'corr-fail',
          dispatchState: 'failed',
          lastError: 'Redis connection timeout',
        },
      })
    );

    expect(result.calculationState.status).toBe('failed');
    expect(result.calculationState.lastError).toBe('Redis connection timeout');
  });

  // Case 7: Dispatched, only RESERVE snapshot -> calculating (partial coverage)
  it('returns calculating when only partial snapshots exist', () => {
    const result = deriveReadState(
      baseInput({
        publishedConfig: { version: 2, publishedAt: NOW, updatedAt: NOW },
        latestVersion: 2,
        latestRun: {
          id: 15,
          configVersion: 2,
          correlationId: 'corr-partial',
          dispatchState: 'dispatched',
          lastError: null,
        },
        attributedSnapshots: [
          { type: 'RESERVE', configVersion: 2, snapshotTime: NOW, createdAt: NOW },
        ],
      })
    );

    expect(result.calculationState.status).toBe('calculating');
    expect(result.calculationState.availableSnapshotTypes).toEqual(['RESERVE']);
  });

  // Case 8: Legacy fallback -- unattributed snapshots satisfy expected -> ready with legacyEvidence
  it('returns ready with legacyEvidence when only unattributed snapshots exist', () => {
    const result = deriveReadState(
      baseInput({
        publishedConfig: { version: 1, publishedAt: EARLIER, updatedAt: EARLIER },
        latestVersion: 1,
        latestRun: {
          id: 3,
          configVersion: 1,
          correlationId: 'corr-legacy',
          dispatchState: 'dispatched',
          lastError: null,
        },
        attributedSnapshots: [
          { type: 'RESERVE', configVersion: null, snapshotTime: EARLIER, createdAt: EARLIER },
          { type: 'PACING', configVersion: null, snapshotTime: NOW, createdAt: NOW },
        ],
      })
    );

    expect(result.calculationState.status).toBe('ready');
    expect(result.calculationState.legacyEvidence).toBe(true);
    expect(result.calculationState.lastCalculatedAt).toBe(NOW.toISOString());
  });

  // Case 9: Attributed snapshots win over unattributed when both exist
  it('uses attributed snapshots over unattributed when both present', () => {
    const result = deriveReadState(
      baseInput({
        publishedConfig: { version: 2, publishedAt: EARLIER, updatedAt: EARLIER },
        latestVersion: 2,
        latestRun: {
          id: 8,
          configVersion: 2,
          correlationId: 'corr-both',
          dispatchState: 'dispatched',
          lastError: null,
        },
        attributedSnapshots: [
          // Attributed for version 2
          { type: 'RESERVE', configVersion: 2, snapshotTime: NOW, createdAt: NOW },
          { type: 'PACING', configVersion: 2, snapshotTime: NOW, createdAt: NOW },
          // Unattributed legacy
          { type: 'RESERVE', configVersion: null, snapshotTime: EARLIER, createdAt: EARLIER },
          { type: 'PACING', configVersion: null, snapshotTime: EARLIER, createdAt: EARLIER },
        ],
      })
    );

    expect(result.calculationState.status).toBe('ready');
    expect(result.calculationState.legacyEvidence).toBe(false);
  });

  // Case 10: engineResultsPresent=true but no snapshots -> legacy field set, status not_requested
  it('reports engineResultsPresent without affecting calculation status', () => {
    const result = deriveReadState(
      baseInput({
        engineResultsPresent: true,
      })
    );

    expect(result.legacy.engineResultsPresent).toBe(true);
    expect(result.calculationState.status).toBe('not_requested');
  });

  // Case 11: COHORT snapshot present -> ignored for ready (not in expectedSnapshotTypes)
  it('ignores COHORT snapshots for ready determination', () => {
    const result = deriveReadState(
      baseInput({
        publishedConfig: { version: 1, publishedAt: NOW, updatedAt: NOW },
        latestVersion: 1,
        latestRun: {
          id: 9,
          configVersion: 1,
          correlationId: 'corr-cohort',
          dispatchState: 'dispatched',
          lastError: null,
        },
        attributedSnapshots: [
          { type: 'COHORT', configVersion: 1, snapshotTime: NOW, createdAt: NOW },
        ],
      })
    );

    expect(result.calculationState.status).toBe('calculating');
    expect(result.calculationState.availableSnapshotTypes).toContain('COHORT');
    expect(result.calculationState.expectedSnapshotTypes).toEqual([...EXPECTED_SNAPSHOT_TYPES]);
  });

  // Case 12: Failed run but prior attributed snapshots satisfy coverage -> ready
  it('returns ready when failed run has prior attributed snapshots covering expected', () => {
    const result = deriveReadState(
      baseInput({
        publishedConfig: { version: 2, publishedAt: EARLIER, updatedAt: EARLIER },
        latestVersion: 2,
        latestRun: {
          id: 12,
          configVersion: 2,
          correlationId: 'corr-fail-prior',
          dispatchState: 'failed',
          lastError: 'Worker OOM',
        },
        attributedSnapshots: [
          { type: 'RESERVE', configVersion: 2, snapshotTime: EARLIER, createdAt: EARLIER },
          { type: 'PACING', configVersion: 2, snapshotTime: EARLIER, createdAt: EARLIER },
        ],
      })
    );

    expect(result.calculationState.status).toBe('ready');
    expect(result.calculationState.lastError).toBe('Worker OOM');
    expect(result.calculationState.legacyEvidence).toBe(false);
  });

  // Extra: lastCalculatedAt uses snapshotTime, falls back to createdAt
  it('falls back to createdAt for lastCalculatedAt when snapshotTime is null', () => {
    const createdAt = new Date('2026-03-20T10:00:00.000Z');
    const result = deriveReadState(
      baseInput({
        publishedConfig: { version: 1, publishedAt: EARLIER, updatedAt: EARLIER },
        latestVersion: 1,
        latestRun: {
          id: 4,
          configVersion: 1,
          correlationId: 'corr-fallback',
          dispatchState: 'dispatched',
          lastError: null,
        },
        attributedSnapshots: [
          { type: 'RESERVE', configVersion: 1, snapshotTime: null, createdAt },
          { type: 'PACING', configVersion: 1, snapshotTime: null, createdAt },
        ],
      })
    );

    expect(result.calculationState.status).toBe('ready');
    expect(result.calculationState.lastCalculatedAt).toBe(createdAt.toISOString());
  });

  // Case 13: Partial dispatch with full snapshots -> ready
  it('returns ready when partial dispatch has all expected snapshots', () => {
    const result = deriveReadState(
      baseInput({
        publishedConfig: { version: 1, publishedAt: NOW, updatedAt: NOW },
        latestVersion: 1,
        latestRun: {
          id: 50,
          configVersion: 1,
          correlationId: 'corr-partial-ready',
          dispatchState: 'partial',
          lastError: 'cohort queue unavailable',
        },
        attributedSnapshots: [
          { type: 'RESERVE', configVersion: 1, snapshotTime: NOW, createdAt: NOW },
          { type: 'PACING', configVersion: 1, snapshotTime: NOW, createdAt: NOW },
        ],
      })
    );

    expect(result.calculationState.status).toBe('ready');
    expect(result.calculationState.dispatchState).toBe('partial');
    expect(result.calculationState.lastError).toBe('cohort queue unavailable');
  });

  // Extra: fundId is passed through
  it('passes through fundId to the output', () => {
    const result = deriveReadState(baseInput({ fundId: 42 }));
    expect(result.fundId).toBe(42);
  });
});
