import { describe, expect, it, vi } from 'vitest';

import {
  buildPurgePlan,
  parsePurgeArgs,
  runPurge,
  topologicallyOrderChildTables,
} from '../../../scripts/release/purge-canary-runs.mjs';

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
    };

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
      },
      totalResidue: 12,
    });
    expect(row).toEqual({
      fund: '2',
      run: '2',
      portfolioCompany: '3',
      fundConfig: '2',
      fundEvent: '4',
      notification: '1',
    });
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
            },
          ],
        })
        .mockResolvedValueOnce({ rowCount: 0 }),
    };

    await expect(runPurge(client, { output })).resolves.toMatchObject({
      mode: 'dry-run',
      targetFunds: 1,
      targetRuns: 1,
      totalResidue: 7,
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
