import { and, eq } from 'drizzle-orm';

import { db } from '../../db';
import { lpMetricRuns, type LpMetricRun } from '@shared/schema/lp-reporting-evidence';
import type { H9ExportSurface } from './h9-export-gate';
import { MetricRunCommitError } from './metric-run-commit-service';

type MetricRunExportWorkflowDatabase = typeof db;
type MetricRunExportWorkflowRow = Pick<LpMetricRun, 'id' | 'fundId' | 'status'>;

const EXPORTABLE_METRIC_RUN_STATUSES = ['locked', 'exported'] as const;

function isExportableMetricRunStatus(status: string): boolean {
  return (EXPORTABLE_METRIC_RUN_STATUSES as readonly string[]).includes(status);
}

async function loadMetricRunStatus(params: {
  database: MetricRunExportWorkflowDatabase;
  fundId: number;
  metricRunId: number;
}): Promise<MetricRunExportWorkflowRow> {
  const rows = await params.database
    .select({
      id: lpMetricRuns.id,
      fundId: lpMetricRuns.fundId,
      status: lpMetricRuns.status,
    })
    .from(lpMetricRuns)
    .where(and(eq(lpMetricRuns.fundId, params.fundId), eq(lpMetricRuns.id, params.metricRunId)))
    .limit(1);

  const row = (rows as MetricRunExportWorkflowRow[]).find(
    (candidate) => candidate.id === params.metricRunId && candidate.fundId === params.fundId
  );
  if (!row) {
    throw new MetricRunCommitError(
      404,
      'METRIC_RUN_NOT_FOUND',
      'Metric run was not found for this fund.'
    );
  }
  return row;
}

export async function assertMetricRunExportWorkflowState(params: {
  surface: H9ExportSurface;
  fundId: number;
  metricRunId: number;
  database?: MetricRunExportWorkflowDatabase;
  preloaded?: MetricRunExportWorkflowRow;
}): Promise<void> {
  const row =
    params.preloaded ??
    (await loadMetricRunStatus({
      database: params.database ?? db,
      fundId: params.fundId,
      metricRunId: params.metricRunId,
    }));

  if (isExportableMetricRunStatus(row.status)) {
    return;
  }

  throw new MetricRunCommitError(
    409,
    'METRIC_RUN_NOT_EXPORTABLE',
    'Metric run must be locked or exported before this export surface can be used.',
    {
      expected: [...EXPORTABLE_METRIC_RUN_STATUSES],
      actual: row.status,
      surface: params.surface,
    }
  );
}
