import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { storage } from '../storage';
import { getDashboardSummaryReadModel } from './dashboard-summary-read-service';
import { shareSnapshots, type Share, type ShareSnapshotRecord } from '@shared/schema/shares';
import { stableJson } from '../lib/stable-json.js';
import type {
  PublicMetricValue,
  PublicPortfolioCompany,
  PublicShareSnapshotPayload,
} from '@shared/contracts/public-share-snapshot.contract';

const SNAPSHOT_PAYLOAD_VERSION = 'public-share-snapshot.v1';
const SNAPSHOT_CALCULATION_VERSION = 'dashboard-summary-read-model.v1';
type SnapshotDb = Pick<typeof db, 'insert' | 'select' | 'update'>;

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateToIso(value: Date | string | null | undefined, fallback: Date): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return fallback.toISOString();
}

function availableMetric(
  id: string,
  label: string,
  value: number | null,
  unit: PublicMetricValue['unit'],
  source: string,
  asOfDate: string
): PublicMetricValue {
  if (value === null) {
    return unavailableMetric(id, label, unit, source, asOfDate, 'source_value_missing');
  }

  return {
    id,
    label,
    value,
    unit,
    availability: 'available',
    source,
    asOfDate,
    calculationVersion: SNAPSHOT_CALCULATION_VERSION,
  };
}

function unavailableMetric(
  id: string,
  label: string,
  unit: PublicMetricValue['unit'],
  source: string,
  asOfDate: string,
  unavailableReason: string
): PublicMetricValue {
  return {
    id,
    label,
    value: null,
    unit,
    availability: 'unavailable',
    source,
    asOfDate,
    calculationVersion: SNAPSHOT_CALCULATION_VERSION,
    unavailableReason,
  };
}

function redactMetrics(
  metrics: PublicMetricValue[],
  hiddenMetrics: readonly string[] | null | undefined
): { metrics: PublicMetricValue[]; applied: string[] } {
  // Hidden metrics must be removed from top-level metrics and any per-row
  // surfaces that expose the same value, such as portfolioCompanies[*].moic.
  const hidden = new Set(hiddenMetrics ?? []);
  const applied = metrics.filter((metric) => hidden.has(metric.id)).map((metric) => metric.id);

  return {
    metrics: metrics.filter((metric) => !hidden.has(metric.id)),
    applied,
  };
}

function payloadContentFingerprint(payload: PublicShareSnapshotPayload): unknown {
  const { generatedAt: _generatedAt, snapshotId: _snapshotId, ...content } = payload;
  return content;
}

function hashPayload(payload: PublicShareSnapshotPayload): string {
  return crypto
    .createHash('sha256')
    .update(stableJson(payloadContentFingerprint(payload)))
    .digest('hex');
}

function portfolioCompanyMoic(company: Record<string, unknown>): number | null {
  const exitMoicBps = numberOrNull(company['exitMoicBps']);
  if (exitMoicBps !== null) {
    return exitMoicBps / 10000;
  }

  const currentValuation = numberOrNull(company['currentValuation']);
  const investmentAmount = numberOrNull(company['investmentAmount']);
  if (currentValuation !== null && investmentAmount !== null && investmentAmount > 0) {
    return currentValuation / investmentAmount;
  }

  return null;
}

export async function buildPublicShareSnapshotPayload(
  share: Share,
  _generatedBy: string,
  snapshotId = uuidv4()
): Promise<{ payload: PublicShareSnapshotPayload; payloadHash: string }> {
  const generatedAt = new Date();
  const fundId = numberOrNull(share.fundId);
  const readModel =
    fundId === null ? undefined : await getDashboardSummaryReadModel(storage, fundId);
  const latestMetrics = readModel?.metrics ?? null;
  const fallbackAsOfDate = share.updatedAt ?? share.createdAt ?? generatedAt;
  const asOfDate = dateToIso(
    latestMetrics?.asOfDate ?? latestMetrics?.metricDate,
    fallbackAsOfDate
  );

  const allMetrics: PublicMetricValue[] = [
    availableMetric(
      'total_commitments',
      'Total commitments',
      numberOrNull(readModel?.fund?.size),
      'currency',
      readModel ? 'funds.size' : 'fund_read_model',
      asOfDate
    ),
    unavailableMetric(
      'capital_called',
      'Capital called',
      'currency',
      'capital_activity_ledger',
      asOfDate,
      'capital_call_source_not_yet_persisted'
    ),
    availableMetric(
      'capital_deployed',
      'Capital deployed',
      numberOrNull(readModel?.fund?.deployedCapital),
      'currency',
      readModel ? 'funds.deployed_capital' : 'fund_read_model',
      asOfDate
    ),
    unavailableMetric(
      'total_distributions',
      'Distributions',
      'currency',
      'fund_distributions',
      asOfDate,
      'distribution_source_not_in_snapshot_read_model'
    ),
    availableMetric(
      'total_value',
      'Total value',
      numberOrNull(latestMetrics?.totalValue),
      'currency',
      latestMetrics ? 'fund_metrics.totalvalue' : 'fund_metrics',
      asOfDate
    ),
    availableMetric(
      'irr',
      'IRR',
      readModel ? numberOrNull(readModel.summary.currentIRR) : null,
      'percent',
      latestMetrics ? 'fund_metrics.irr' : 'fund_metrics',
      asOfDate
    ),
    availableMetric(
      'moic',
      'MOIC',
      numberOrNull(latestMetrics?.multiple),
      'multiple',
      latestMetrics ? 'fund_metrics.multiple' : 'fund_metrics',
      asOfDate
    ),
    availableMetric(
      'dpi',
      'DPI',
      numberOrNull(latestMetrics?.dpi),
      'multiple',
      latestMetrics ? 'fund_metrics.dpi' : 'fund_metrics',
      asOfDate
    ),
    availableMetric(
      'tvpi',
      'TVPI',
      numberOrNull(latestMetrics?.tvpi),
      'multiple',
      latestMetrics ? 'fund_metrics.tvpi' : 'fund_metrics',
      asOfDate
    ),
    availableMetric(
      'portfolio_companies',
      'Portfolio companies',
      readModel ? readModel.summary.totalCompanies : null,
      'count',
      readModel ? 'portfolio_companies.count' : 'portfolio_companies',
      asOfDate
    ),
  ];

  const { metrics, applied } = redactMetrics(allMetrics, share.hiddenMetrics);
  const hidden = new Set(share.hiddenMetrics ?? []);
  const portfolioCompanies: PublicPortfolioCompany[] = (readModel?.portfolioCompanies ?? [])
    .slice(0, 5)
    .map((company) => ({
      name: company.name,
      stage: company.stage ?? null,
      moic: hidden.has('moic') ? null : portfolioCompanyMoic(company as Record<string, unknown>),
      status: company.status ?? null,
    }));

  const sourceCalculationRunIds =
    latestMetrics?.runId === null || latestMetrics?.runId === undefined
      ? []
      : [String(latestMetrics.runId)];

  const payload: PublicShareSnapshotPayload = {
    payloadVersion: SNAPSHOT_PAYLOAD_VERSION,
    snapshotId,
    shareId: share.id,
    title: share.customTitle ?? readModel?.fund?.name ?? 'Fund dashboard',
    message: share.customMessage ?? null,
    asOfDate,
    generatedAt: generatedAt.toISOString(),
    metrics,
    portfolioCompanies,
    hiddenMetricPolicy: {
      requested: share.hiddenMetrics ?? [],
      applied,
    },
    sourceCalculationRunIds,
  };

  return { payload, payloadHash: hashPayload(payload) };
}

export async function createShareSnapshot(
  share: Share,
  generatedBy: string,
  database: SnapshotDb = db
): Promise<ShareSnapshotRecord> {
  const snapshotId = uuidv4();
  const { payload, payloadHash } = await buildPublicShareSnapshotPayload(
    share,
    generatedBy,
    snapshotId
  );

  const [snapshot] = await database
    .insert(shareSnapshots)
    .values({
      id: snapshotId,
      shareId: share.id,
      fundIdInternal: share.fundId,
      payloadVersion: payload.payloadVersion,
      asOfDate: new Date(payload.asOfDate),
      sourceCalculationRunIds: payload.sourceCalculationRunIds,
      hiddenMetricPolicy: payload.hiddenMetricPolicy,
      generatedBy,
      generatedAt: new Date(payload.generatedAt),
      expiresAt: share.expiresAt,
      payloadHash,
      payload,
    })
    .returning();

  if (!snapshot) {
    throw new Error('Failed to create share snapshot');
  }

  return snapshot;
}

export async function getLatestShareSnapshot(
  shareId: string
): Promise<ShareSnapshotRecord | undefined> {
  const [snapshot] = await db
    .select()
    .from(shareSnapshots)
    .where(eq(shareSnapshots.shareId, shareId))
    .orderBy(desc(shareSnapshots.generatedAt))
    .limit(1);

  return snapshot;
}

export async function markShareSnapshotsRevoked(
  shareId: string,
  revokedAt: Date,
  database: SnapshotDb = db
): Promise<void> {
  await database
    .update(shareSnapshots)
    .set({ revokedAt })
    .where(eq(shareSnapshots.shareId, shareId));
}
