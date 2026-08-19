import { describe, expect, it, vi } from 'vitest';

import {
  PURGE_RESIDUE_GROUPS,
  PURGE_RESIDUE_GROUP_TABLES,
  buildPurgePlan,
  parsePurgeArgs,
  runPurge,
  topologicallyOrderChildTables,
} from '../../../scripts/release/purge-canary-runs.mjs';
import {
  RELEASE_CANARY_RUNS_QUERY,
  evaluateCanaryResidue,
} from '../../../scripts/release/assert-canary-residue.mjs';
import {
  CANARY_RESIDUE_GROUPS,
  CANARY_RESIDUE_GROUP_TABLES,
} from '../../../server/services/canary-residue-service';

describe('canary purge command', () => {
  it('defaults to dry-run and requires explicit execute mode', () => {
    expect(parsePurgeArgs([])).toEqual({ execute: false });
    expect(parsePurgeArgs(['--execute'])).toEqual({ execute: true });
  });

  it('prints exact targeted residue counts without mutating input', () => {
    const row = {
      fund: '2',
      run: '2',
      portfolioCompany: '3',
      fundConfig: '2',
      fundEvent: '4',
      notification: '1',
      grant: '1',
      calculation: '2',
      mutationReceipt: '1',
      scenario: '3',
      reporting: '5',
    };
    const rowSnapshot = { ...row };

    expect(buildPurgePlan(row)).toEqual({
      mode: 'dry-run',
      targetFunds: 2,
      targetRuns: 2,
      residue: {
        portfolioCompany: 3,
        fund: 2,
        fundConfig: 2,
        fundEvent: 4,
        notification: 1,
        grant: 1,
        calculation: 2,
        mutationReceipt: 1,
        scenario: 3,
        reporting: 5,
      },
      totalResidue: 24,
    });
    expect(row).toEqual(rowSnapshot);
  });

  it('dry-run reconciles inside a rolled-back transaction and never deletes', async () => {
    const output = vi.fn();
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ count: 1 }] })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [
            {
              fund: '1',
              run: '1',
              portfolioCompany: '2',
              fundConfig: '1',
              fundEvent: '3',
              notification: '0',
              grant: '1',
              calculation: '2',
              mutationReceipt: '0',
              scenario: '1',
              reporting: '4',
            },
          ],
        })
        .mockResolvedValueOnce({ rowCount: 0 }),
    };

    await expect(runPurge(client, { output })).resolves.toMatchObject({
      mode: 'dry-run',
      targetFunds: 1,
      targetRuns: 1,
      totalResidue: 15,
    });
    expect(output).toHaveBeenCalledOnce();
    expect(client.query).toHaveBeenCalledTimes(5);
    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.query.mock.calls.some(([query]) => String(query).startsWith('DELETE'))).toBe(
      false
    );
  });

  it('deletes child tables before their referenced parent tables', () => {
    expect(
      topologicallyOrderChildTables(
        ['public.portfoliocompanies', 'public.quarterly_review_companies'],
        [
          {
            childTable: 'public.quarterly_review_companies',
            parentTable: 'public.portfoliocompanies',
          },
        ]
      )
    ).toEqual(['public.quarterly_review_companies', 'public.portfoliocompanies']);
  });

  it('fails closed when purge foreign-key dependencies contain a cycle', () => {
    expect(() =>
      topologicallyOrderChildTables(
        ['public.first', 'public.second'],
        [
          { childTable: 'public.first', parentTable: 'public.second' },
          { childTable: 'public.second', parentTable: 'public.first' },
        ]
      )
    ).toThrow('Cycle in fund purge foreign-key graph');
  });

  it('blocks execute mode before any mutation-capable database call', async () => {
    const client = { query: vi.fn() };

    await expect(runPurge(client, { execute: true })).rejects.toThrow(
      /production data mutation is mechanically blocked/i
    );
    expect(client.query).not.toHaveBeenCalled();
  });
});

describe('canary residue group parity across service, purge, and assertion surfaces', () => {
  it('keeps the purge descriptor identical to the shared service descriptor', () => {
    expect([...PURGE_RESIDUE_GROUPS]).toEqual([...CANARY_RESIDUE_GROUPS]);
    expect(Object.keys(PURGE_RESIDUE_GROUP_TABLES).sort()).toEqual(
      Object.keys(CANARY_RESIDUE_GROUP_TABLES).sort()
    );
    for (const group of PURGE_RESIDUE_GROUPS) {
      expect(PURGE_RESIDUE_GROUP_TABLES[group]).toEqual(
        CANARY_RESIDUE_GROUP_TABLES[group as keyof typeof CANARY_RESIDUE_GROUP_TABLES]
      );
    }
  });

  it('evaluates residue over exactly the shared group keys plus total', () => {
    const sha = 'a'.repeat(40);
    const result = evaluateCanaryResidue({
      expectedSha: sha,
      rows: [
        {
          releaseSha: sha,
          status: 'completed',
          createdAt: '2026-08-10T10:00:00.000Z',
          expiresAt: '2026-08-11T10:00:00.000Z',
          purgedAt: null,
          ...Object.fromEntries(
            PURGE_RESIDUE_GROUPS.map((group) => [`${group}ResidueCount`, 0])
          ),
          totalResidueCount: 0,
        },
      ],
      policy: {
        ...Object.fromEntries(PURGE_RESIDUE_GROUPS.map((group) => [group, 0])),
        total: 0,
        ttlHours: 24,
      },
      now: Date.parse('2026-08-10T12:00:00.000Z'),
    });

    expect(result.verdict).toBe('pass');
    expect(Object.keys(result.residue).sort()).toEqual([...PURGE_RESIDUE_GROUPS, 'total'].sort());
  });

  it('selects a snake_case residue column for every shared group', () => {
    for (const group of PURGE_RESIDUE_GROUPS) {
      const column = `${group.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}_residue_count`;
      expect(RELEASE_CANARY_RUNS_QUERY).toContain(column);
    }
    expect(RELEASE_CANARY_RUNS_QUERY).toContain('total_residue_count');
  });
});
