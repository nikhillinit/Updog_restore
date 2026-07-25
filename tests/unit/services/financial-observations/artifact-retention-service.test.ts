import { describe, expect, it, vi } from 'vitest';

import {
  RETENTION_JOB_TYPE,
  RETENTION_EXTENSION_DAYS,
  RETENTION_STARTUP_CATCHUP_DAYS,
  RETENTION_EXTENSION_REASON,
  retentionDedupeKey,
  enumerateCatchupDates,
  classifyBatchDisposition,
  computeRetentionExtension,
  appendExpiredUnresolvedHistory,
  sweepDueBatches,
  type RetentionSweepBatchRow,
  type RetentionSweepPorts,
} from '../../../../server/services/financial-observations/artifact-retention-service';

const DAY_MS = 86_400_000;

function at(iso: string): Date {
  return new Date(iso);
}

// A batch that is past its base retention with no extension and no pending work.
function dueBatch(overrides: Partial<RetentionSweepBatchRow> = {}): RetentionSweepBatchRow {
  return {
    id: 1,
    fundId: 7,
    sourceArtifactId: 11,
    status: 'committed',
    purgeAfter: at('2026-01-01T00:00:00.000Z'),
    retentionExtendedUntil: null,
    purgedAt: null,
    hasUncommittedObservations: false,
    hasOpenCases: false,
    ...overrides,
  };
}

describe('retention constants + dedupe key', () => {
  it('pins the job type, extension window, and startup catch-up bound', () => {
    expect(RETENTION_JOB_TYPE).toBe('artifact_retention_sweep');
    expect(RETENTION_EXTENSION_DAYS).toBe(90);
    expect(RETENTION_STARTUP_CATCHUP_DAYS).toBe(30);
  });

  it('derives a deterministic per-UTC-day dedupe key', () => {
    expect(retentionDedupeKey(at('2026-07-24T18:45:12.000Z'))).toBe('retention:2026-07-24');
    // Same UTC day, different clock -> identical key (idempotent daily planning).
    expect(retentionDedupeKey(at('2026-07-24T00:00:00.000Z'))).toBe('retention:2026-07-24');
  });
});

describe('enumerateCatchupDates (missed-window catch-up, bounded)', () => {
  it('includes today and every prior UTC day within the bound, oldest first', () => {
    const dates = enumerateCatchupDates(at('2026-07-24T12:00:00.000Z'), 3);
    expect(dates).toEqual(['2026-07-22', '2026-07-23', '2026-07-24']);
  });

  it('never emits more than the bound (a long outage cannot flood the outbox)', () => {
    const dates = enumerateCatchupDates(
      at('2026-07-24T12:00:00.000Z'),
      RETENTION_STARTUP_CATCHUP_DAYS
    );
    expect(dates).toHaveLength(RETENTION_STARTUP_CATCHUP_DAYS);
    expect(dates[dates.length - 1]).toBe('2026-07-24');
  });
});

describe('classifyBatchDisposition', () => {
  const now = at('2026-07-24T00:00:00.000Z');

  it('purges a committed batch with no pending work once past retention', () => {
    expect(classifyBatchDisposition(dueBatch({ status: 'committed' }), now)).toBe('purge');
  });

  it('skips a batch that is not yet due', () => {
    expect(
      classifyBatchDisposition(dueBatch({ purgeAfter: at('2026-12-01T00:00:00.000Z') }), now)
    ).toBe('skip');
  });

  it('skips an already-purged batch (idempotent)', () => {
    expect(
      classifyBatchDisposition(dueBatch({ purgedAt: at('2026-02-01T00:00:00.000Z') }), now)
    ).toBe('skip');
  });

  it('extends once when a due batch still has staged groups', () => {
    expect(
      classifyBatchDisposition(
        dueBatch({ status: 'staged', hasUncommittedObservations: true }),
        now
      )
    ).toBe('extend');
  });

  it('extends once when a due batch still has open reconciliation cases', () => {
    expect(classifyBatchDisposition(dueBatch({ hasOpenCases: true }), now)).toBe('extend');
  });

  it('skips a batch still inside its granted extension window', () => {
    expect(
      classifyBatchDisposition(
        dueBatch({
          hasOpenCases: true,
          retentionExtendedUntil: at('2026-08-01T00:00:00.000Z'),
        }),
        now
      )
    ).toBe('skip');
  });

  it('purges once the granted extension has itself elapsed (never extends twice)', () => {
    expect(
      classifyBatchDisposition(
        dueBatch({
          status: 'partially_committed',
          hasUncommittedObservations: true,
          hasOpenCases: true,
          retentionExtendedUntil: at('2026-06-01T00:00:00.000Z'),
        }),
        now
      )
    ).toBe('purge');
  });
});

describe('computeRetentionExtension', () => {
  it('sets the extension to purge_after + 90 days with a logged reason', () => {
    const purgeAfter = at('2026-01-01T00:00:00.000Z');
    const ext = computeRetentionExtension(purgeAfter);
    expect(ext.retentionExtendedUntil.getTime()).toBe(
      purgeAfter.getTime() + RETENTION_EXTENSION_DAYS * DAY_MS
    );
    expect(ext.retentionExtensionReason).toBe(RETENTION_EXTENSION_REASON);
  });
});

describe('appendExpiredUnresolvedHistory', () => {
  it('appends a terminal expiry entry without mutating prior history', () => {
    const prior = [{ at: '2026-01-01T00:00:00.000Z', event: 'opened' as const }];
    const next = appendExpiredUnresolvedHistory(prior, at('2026-07-24T00:00:00.000Z'));
    expect(prior).toHaveLength(1);
    expect(next).toEqual([
      { at: '2026-01-01T00:00:00.000Z', event: 'opened' },
      { at: '2026-07-24T00:00:00.000Z', event: 'expired_unresolved' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Sweep orchestration (ports seam — the SQL adapter is a thin, separate layer).
// ---------------------------------------------------------------------------

function recordingPorts(dueRows: RetentionSweepBatchRow[]) {
  const extended: number[] = [];
  const purged: number[] = [];
  const ports: RetentionSweepPorts = {
    selectDueBatches: vi.fn(async () => dueRows),
    extendBatch: vi.fn(async (batch) => {
      extended.push(batch.id);
    }),
    purgeBatch: vi.fn(async (batch) => {
      purged.push(batch.id);
      const becameExpired = batch.hasUncommittedObservations;
      return {
        becameExpired,
        expiredCaseIds: batch.hasOpenCases ? [batch.id * 100] : [],
      };
    }),
  };
  return { ports, extended, purged };
}

describe('sweepDueBatches', () => {
  const now = at('2026-07-24T00:00:00.000Z');

  it('summarizes purges and extensions and never double-counts', async () => {
    const { ports } = recordingPorts([
      dueBatch({ id: 1, status: 'committed' }), // purge, no expiry
      dueBatch({ id: 2, status: 'staged', hasUncommittedObservations: true }), // extend
      dueBatch({
        id: 3,
        status: 'partially_committed',
        hasUncommittedObservations: true,
        hasOpenCases: true,
        retentionExtendedUntil: at('2026-06-01T00:00:00.000Z'),
      }), // purge -> expired batch + expired case
    ]);

    const summary = await sweepDueBatches(ports, now);

    expect(summary.extended).toBe(1);
    expect(summary.purged).toBe(2);
    expect(summary.expiredBatchIds).toContain(3);
    expect(summary.expiredBatchIds).not.toContain(1);
    expect(summary.expiredCaseIds).toContain(300);
    // A committed batch with no pending work purges its payload but never expires.
    expect(ports.purgeBatch).toHaveBeenCalledTimes(2);
    expect(ports.extendBatch).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when nothing is due', async () => {
    const { ports } = recordingPorts([]);
    const summary = await sweepDueBatches(ports, now);
    expect(summary.extended).toBe(0);
    expect(summary.purged).toBe(0);
    expect(summary.expiredCaseIds).toEqual([]);
    expect(ports.purgeBatch).not.toHaveBeenCalled();
  });
});
