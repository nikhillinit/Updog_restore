import { beforeEach, describe, expect, it } from 'vitest';

import type { db } from '../../../../server/db';
import { assertMetricRunExportWorkflowState } from '../../../../server/services/lp-reporting/metric-run-export-workflow-gate';
import { lpMetricRuns } from '@shared/schema/lp-reporting-evidence';

interface MetricRunStatusRow {
  id: number;
  fundId: number;
  status: string;
}

const state = {
  rows: [] as MetricRunStatusRow[],
  selectCalls: 0,
};

function queryResult<T>(rows: T[]): Promise<T[]> & { limit: (count: number) => Promise<T[]> } {
  const promise = Promise.resolve(rows) as Promise<T[]> & {
    limit: (count: number) => Promise<T[]>;
  };
  promise.limit = () => Promise.resolve(rows);
  return promise;
}

function makeDatabase(): typeof db {
  return {
    select: () => {
      state.selectCalls += 1;
      return {
        from: (table: unknown) => ({
          where: () => queryResult(table === lpMetricRuns ? state.rows : []),
        }),
      };
    },
  } as unknown as typeof db;
}

beforeEach(() => {
  state.rows = [{ id: 11, fundId: 1, status: 'locked' }];
  state.selectCalls = 0;
});

describe('assertMetricRunExportWorkflowState', () => {
  it.each(['locked', 'exported'])('allows %s metric runs', async (status) => {
    state.rows = [{ id: 11, fundId: 1, status }];

    await expect(
      assertMetricRunExportWorkflowState({
        surface: 'stored_json_export',
        fundId: 1,
        metricRunId: 11,
        database: makeDatabase(),
      })
    ).resolves.toBeUndefined();
  });

  it.each(['draft', 'approved', 'superseded'])('blocks %s metric runs', async (status) => {
    state.rows = [{ id: 11, fundId: 1, status }];

    await expect(
      assertMetricRunExportWorkflowState({
        surface: 'live_json_export',
        fundId: 1,
        metricRunId: 11,
        database: makeDatabase(),
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'METRIC_RUN_NOT_EXPORTABLE',
      details: {
        expected: ['locked', 'exported'],
        actual: status,
        surface: 'live_json_export',
      },
    });
  });

  it('returns METRIC_RUN_NOT_FOUND when the metric run is absent', async () => {
    state.rows = [];

    await expect(
      assertMetricRunExportWorkflowState({
        surface: 'render_model',
        fundId: 1,
        metricRunId: 11,
        database: makeDatabase(),
      })
    ).rejects.toMatchObject({
      status: 404,
      code: 'METRIC_RUN_NOT_FOUND',
    });
  });

  it('uses a preloaded row without issuing another query', async () => {
    await expect(
      assertMetricRunExportWorkflowState({
        surface: 'render_model',
        fundId: 1,
        metricRunId: 11,
        database: makeDatabase(),
        preloaded: { id: 11, fundId: 1, status: 'exported' },
      })
    ).resolves.toBeUndefined();

    expect(state.selectCalls).toBe(0);
  });
});
