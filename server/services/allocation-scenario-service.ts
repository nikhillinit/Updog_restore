import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { transaction } from '../db/pg-circuit.js';

interface HttpError extends Error {
  statusCode: number;
}

interface AllocationScenarioHeaderRow {
  id: string;
  fund_id: number;
  name: string;
  notes: string | null;
  source_allocation_version: number | null;
  company_count: number;
  total_planned_cents: string;
  last_applied_at: Date | null;
  last_applied_by: string | null;
  last_applied_allocation_version: number | null;
  last_synced_at: Date | null;
  last_synced_by: string | null;
  created_at: Date;
  updated_at: Date;
}

interface AllocationScenarioItemRow {
  company_id: number;
  planned_reserves_cents: string;
  allocation_cap_cents: string | null;
  allocation_reason: string | null;
}

interface LiveAllocationSnapshotRow {
  company_id: number;
  company_name: string;
  planned_reserves_cents: string;
  deployed_reserves_cents: string;
  allocation_cap_cents: string | null;
  allocation_reason: string | null;
  allocation_version: number;
  last_allocation_at: Date | null;
}

export interface AllocationScenarioSnapshotItem {
  company_id: number;
  planned_reserves_cents: number;
  allocation_cap_cents: number | null;
  allocation_reason: string | null;
}

export interface AllocationScenarioSummary {
  id: string;
  fund_id: number;
  name: string;
  notes: string | null;
  source_allocation_version: number | null;
  company_count: number;
  total_planned_cents: number;
  last_applied_at: string | null;
  last_applied_by: string | null;
  last_applied_allocation_version: number | null;
  last_synced_at: string | null;
  last_synced_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AllocationScenarioDetail extends AllocationScenarioSummary {
  snapshot_items: AllocationScenarioSnapshotItem[];
}

type AllocationScenarioApplyPreviewDriftStatus =
  | 'exact_match'
  | 'stale_but_mappable'
  | 'company_set_changed';
type AllocationScenarioApplyPreviewState = 'apply_allowed' | 'confirmable_with_drift' | 'blocked';

export interface AllocationScenarioApplyPreview {
  scenario: AllocationScenarioSummary;
  live: {
    fund_id: number;
    company_count: number;
    total_planned_cents: number;
    total_deployed_cents: number;
    max_allocation_version: number | null;
    last_updated_at: string | null;
  };
  drift_status: AllocationScenarioApplyPreviewDriftStatus;
  apply_state: AllocationScenarioApplyPreviewState;
  live_token: string;
  summary: {
    companies_changed: number;
    companies_unchanged: number;
    scenario_only_count: number;
    live_only_count: number;
    total_planned_delta_cents: number;
  };
}

export interface CreateAllocationScenarioInput {
  name: string;
  notes?: string | null | undefined;
  source_allocation_version?: number | null | undefined;
  snapshot_items: AllocationScenarioSnapshotItem[];
}

export interface UpdateAllocationScenarioInput {
  name?: string | undefined;
  notes?: string | null | undefined;
  source_allocation_version?: number | null | undefined;
  snapshot_items?: AllocationScenarioSnapshotItem[] | undefined;
}

function createHttpError(statusCode: number, message: string): HttpError {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  return error;
}

function normalizeNotes(notes: string | null | undefined): string | null {
  const trimmed = notes?.trim();
  return trimmed ? trimmed : null;
}

function normalizeName(name: string): string {
  return name.trim();
}

function normalizeSnapshotItems(
  items: AllocationScenarioSnapshotItem[]
): AllocationScenarioSnapshotItem[] {
  return items.map((item) => ({
    company_id: item.company_id,
    planned_reserves_cents: item.planned_reserves_cents,
    allocation_cap_cents: item.allocation_cap_cents ?? null,
    allocation_reason: normalizeNotes(item.allocation_reason),
  }));
}

function calculateScenarioStats(items: AllocationScenarioSnapshotItem[]) {
  return {
    company_count: items.length,
    total_planned_cents: items.reduce((sum, item) => sum + item.planned_reserves_cents, 0),
  };
}

function mapScenarioHeader(row: AllocationScenarioHeaderRow): AllocationScenarioSummary {
  return {
    id: row.id,
    fund_id: row.fund_id,
    name: row.name,
    notes: row.notes,
    source_allocation_version: row.source_allocation_version,
    company_count: row.company_count,
    total_planned_cents: parseInt(row.total_planned_cents, 10),
    last_applied_at: row.last_applied_at ? row.last_applied_at.toISOString() : null,
    last_applied_by: row.last_applied_by ?? null,
    last_applied_allocation_version: row.last_applied_allocation_version,
    last_synced_at: row.last_synced_at ? row.last_synced_at.toISOString() : null,
    last_synced_by: row.last_synced_by ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function mapSnapshotItem(row: AllocationScenarioItemRow): AllocationScenarioSnapshotItem {
  return {
    company_id: row.company_id,
    planned_reserves_cents: parseInt(row.planned_reserves_cents, 10),
    allocation_cap_cents: row.allocation_cap_cents ? parseInt(row.allocation_cap_cents, 10) : null,
    allocation_reason: row.allocation_reason,
  };
}

function mapLiveAllocationSnapshotItem(row: LiveAllocationSnapshotRow) {
  return {
    company_id: row.company_id,
    company_name: row.company_name,
    planned_reserves_cents: parseInt(row.planned_reserves_cents, 10),
    deployed_reserves_cents: parseInt(row.deployed_reserves_cents, 10),
    allocation_cap_cents: row.allocation_cap_cents ? parseInt(row.allocation_cap_cents, 10) : null,
    allocation_reason: normalizeNotes(row.allocation_reason),
    allocation_version: row.allocation_version,
    last_allocation_at: row.last_allocation_at ? row.last_allocation_at.toISOString() : null,
  };
}

function buildLiveAllocationToken(
  fundId: number,
  items: ReturnType<typeof mapLiveAllocationSnapshotItem>[]
): string {
  const payload = items.map((item) => ({
    company_id: item.company_id,
    allocation_version: item.allocation_version,
  }));

  return createHash('sha256').update(JSON.stringify({ fundId, payload })).digest('hex');
}

async function getLiveAllocationSnapshot(client: PoolClient, fundId: number) {
  const result = await client.query<LiveAllocationSnapshotRow>(
    `SELECT
       id AS company_id,
       name AS company_name,
       planned_reserves_cents,
       deployed_reserves_cents,
       allocation_cap_cents,
       allocation_reason,
       allocation_version,
       last_allocation_at
     FROM portfoliocompanies
     WHERE fund_id = $1
     ORDER BY id ASC`,
    [fundId]
  );

  return result.rows.map(mapLiveAllocationSnapshotItem);
}

async function verifyFundExists(client: PoolClient, fundId: number): Promise<void> {
  const result = await client.query<{ id: number }>('SELECT id FROM funds WHERE id = $1', [fundId]);

  if (result.rows.length === 0) {
    throw createHttpError(404, `Fund ${fundId} not found`);
  }
}

async function verifyCompaniesInFund(
  client: PoolClient,
  fundId: number,
  companyIds: number[]
): Promise<void> {
  const result = await client.query<{ id: number }>(
    `SELECT id
       FROM portfoliocompanies
      WHERE fund_id = $1
        AND id = ANY($2::int[])`,
    [fundId, companyIds]
  );

  if (result.rows.length !== companyIds.length) {
    const foundIds = new Set(result.rows.map((row) => row.id));
    const missingIds = companyIds.filter((companyId) => !foundIds.has(companyId));
    throw createHttpError(404, `Companies not found in fund ${fundId}: ${missingIds.join(', ')}`);
  }
}

async function getScenarioHeaderOrThrow(
  client: PoolClient,
  fundId: number,
  scenarioId: string
): Promise<AllocationScenarioHeaderRow> {
  const result = await client.query<AllocationScenarioHeaderRow>(
    `SELECT
       id,
       fund_id,
       name,
       notes,
       source_allocation_version,
       company_count,
       total_planned_cents,
       last_applied_at,
       last_applied_by,
       last_applied_allocation_version,
       last_synced_at,
       last_synced_by,
       created_at,
       updated_at
     FROM allocation_scenarios
     WHERE fund_id = $1
       AND id = $2`,
    [fundId, scenarioId]
  );

  if (result.rows.length === 0) {
    throw createHttpError(404, `Allocation scenario ${scenarioId} not found`);
  }

  return result.rows[0]!;
}

async function getScenarioItems(
  client: PoolClient,
  scenarioId: string
): Promise<AllocationScenarioSnapshotItem[]> {
  const result = await client.query<AllocationScenarioItemRow>(
    `SELECT
       company_id,
       planned_reserves_cents,
       allocation_cap_cents,
       allocation_reason
     FROM allocation_scenario_items
     WHERE scenario_id = $1
     ORDER BY company_id ASC`,
    [scenarioId]
  );

  return result.rows.map(mapSnapshotItem);
}

async function insertScenarioItems(
  client: PoolClient,
  scenarioId: string,
  items: AllocationScenarioSnapshotItem[]
): Promise<void> {
  for (const item of items) {
    await client.query(
      `INSERT INTO allocation_scenario_items (
         scenario_id,
         company_id,
         planned_reserves_cents,
         allocation_cap_cents,
         allocation_reason
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [
        scenarioId,
        item.company_id,
        item.planned_reserves_cents,
        item.allocation_cap_cents,
        item.allocation_reason,
      ]
    );
  }
}

async function fetchScenarioDetail(
  client: PoolClient,
  fundId: number,
  scenarioId: string
): Promise<AllocationScenarioDetail> {
  const header = await getScenarioHeaderOrThrow(client, fundId, scenarioId);
  const snapshot_items = await getScenarioItems(client, scenarioId);

  return {
    ...mapScenarioHeader(header),
    snapshot_items,
  };
}

export async function getAllocationScenarioApplyPreview(
  fundId: number,
  scenarioId: string
): Promise<AllocationScenarioApplyPreview> {
  return transaction(async (client) => {
    await verifyFundExists(client, fundId);

    const scenario = await fetchScenarioDetail(client, fundId, scenarioId);
    const liveItems = await getLiveAllocationSnapshot(client, fundId);
    const { snapshot_items: _snapshotItems, ...scenarioSummary } = scenario;

    const scenarioByCompanyId = new Map(
      scenario.snapshot_items.map((item) => [item.company_id, item] as const)
    );
    const liveByCompanyId = new Map(liveItems.map((item) => [item.company_id, item] as const));

    let companiesChanged = 0;
    let companiesUnchanged = 0;
    let scenarioOnlyCount = 0;
    let liveOnlyCount = 0;
    let totalPlannedDeltaCents = 0;

    for (const snapshotItem of scenario.snapshot_items) {
      const liveItem = liveByCompanyId.get(snapshotItem.company_id);

      if (!liveItem) {
        scenarioOnlyCount++;
        totalPlannedDeltaCents += snapshotItem.planned_reserves_cents;
        continue;
      }

      const changed =
        snapshotItem.planned_reserves_cents !== liveItem.planned_reserves_cents ||
        snapshotItem.allocation_cap_cents !== liveItem.allocation_cap_cents ||
        normalizeNotes(snapshotItem.allocation_reason) !== normalizeNotes(liveItem.allocation_reason);

      if (changed) {
        companiesChanged++;
      } else {
        companiesUnchanged++;
      }

      totalPlannedDeltaCents += snapshotItem.planned_reserves_cents - liveItem.planned_reserves_cents;
    }

    for (const liveItem of liveItems) {
      if (!scenarioByCompanyId.has(liveItem.company_id)) {
        liveOnlyCount++;
        totalPlannedDeltaCents -= liveItem.planned_reserves_cents;
      }
    }

    const maxAllocationVersion =
      liveItems.length > 0 ? Math.max(...liveItems.map((item) => item.allocation_version)) : null;
    const lastUpdatedAt =
      liveItems
        .map((item) => item.last_allocation_at)
        .filter((value): value is string => value !== null)
        .sort()
        .reverse()[0] ?? null;
    const companySetChanged = scenarioOnlyCount > 0 || liveOnlyCount > 0;
    const exactMatch =
      !companySetChanged &&
      scenario.source_allocation_version !== null &&
      maxAllocationVersion !== null &&
      scenario.source_allocation_version === maxAllocationVersion;

    const driftStatus: AllocationScenarioApplyPreviewDriftStatus = companySetChanged
      ? 'company_set_changed'
      : exactMatch
        ? 'exact_match'
        : 'stale_but_mappable';
    const applyState: AllocationScenarioApplyPreviewState = companySetChanged
      ? 'blocked'
      : exactMatch
        ? 'apply_allowed'
        : 'confirmable_with_drift';

    return {
      scenario: scenarioSummary,
      live: {
        fund_id: fundId,
        company_count: liveItems.length,
        total_planned_cents: liveItems.reduce(
          (sum, item) => sum + item.planned_reserves_cents,
          0
        ),
        total_deployed_cents: liveItems.reduce(
          (sum, item) => sum + item.deployed_reserves_cents,
          0
        ),
        max_allocation_version: maxAllocationVersion,
        last_updated_at: lastUpdatedAt,
      },
      drift_status: driftStatus,
      apply_state: applyState,
      live_token: buildLiveAllocationToken(fundId, liveItems),
      summary: {
        companies_changed: companiesChanged,
        companies_unchanged: companiesUnchanged,
        scenario_only_count: scenarioOnlyCount,
        live_only_count: liveOnlyCount,
        total_planned_delta_cents: totalPlannedDeltaCents,
      },
    };
  });
}

export async function listAllocationScenarios(
  fundId: number
): Promise<AllocationScenarioSummary[]> {
  return transaction(async (client) => {
    await verifyFundExists(client, fundId);

    const result = await client.query<AllocationScenarioHeaderRow>(
      `SELECT
         id,
         fund_id,
         name,
         notes,
         source_allocation_version,
         company_count,
         total_planned_cents,
         last_applied_at,
         last_applied_by,
         last_applied_allocation_version,
         last_synced_at,
         last_synced_by,
         created_at,
         updated_at
       FROM allocation_scenarios
       WHERE fund_id = $1
       ORDER BY updated_at DESC, id DESC`,
      [fundId]
    );

    return result.rows.map(mapScenarioHeader);
  });
}

export async function getAllocationScenario(
  fundId: number,
  scenarioId: string
): Promise<AllocationScenarioDetail> {
  return transaction(async (client) => {
    await verifyFundExists(client, fundId);
    return fetchScenarioDetail(client, fundId, scenarioId);
  });
}

export async function createAllocationScenario(
  fundId: number,
  input: CreateAllocationScenarioInput
): Promise<AllocationScenarioDetail> {
  return transaction(async (client) => {
    await verifyFundExists(client, fundId);

    const snapshotItems = normalizeSnapshotItems(input.snapshot_items);
    await verifyCompaniesInFund(
      client,
      fundId,
      snapshotItems.map((item) => item.company_id)
    );

    const stats = calculateScenarioStats(snapshotItems);
    const result = await client.query<{ id: string }>(
      `INSERT INTO allocation_scenarios (
         fund_id,
         name,
         notes,
         source_allocation_version,
         company_count,
         total_planned_cents
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        fundId,
        normalizeName(input.name),
        normalizeNotes(input.notes),
        input.source_allocation_version ?? null,
        stats.company_count,
        stats.total_planned_cents,
      ]
    );

    const scenarioId = result.rows[0]!.id;
    await insertScenarioItems(client, scenarioId, snapshotItems);

    return fetchScenarioDetail(client, fundId, scenarioId);
  });
}

export async function updateAllocationScenario(
  fundId: number,
  scenarioId: string,
  input: UpdateAllocationScenarioInput
): Promise<AllocationScenarioDetail> {
  return transaction(async (client) => {
    await verifyFundExists(client, fundId);
    const existing = await getScenarioHeaderOrThrow(client, fundId, scenarioId);

    const snapshotItems = input.snapshot_items
      ? normalizeSnapshotItems(input.snapshot_items)
      : undefined;

    if (snapshotItems) {
      await verifyCompaniesInFund(
        client,
        fundId,
        snapshotItems.map((item) => item.company_id)
      );
    }

    const nextStats = snapshotItems
      ? calculateScenarioStats(snapshotItems)
      : {
          company_count: existing.company_count,
          total_planned_cents: parseInt(existing.total_planned_cents, 10),
        };

    await client.query(
      `UPDATE allocation_scenarios
          SET name = $1,
              notes = $2,
              source_allocation_version = $3,
              company_count = $4,
              total_planned_cents = $5,
              updated_at = NOW()
        WHERE fund_id = $6
          AND id = $7`,
      [
        input.name !== undefined ? normalizeName(input.name) : existing.name,
        input.notes !== undefined ? normalizeNotes(input.notes) : existing.notes,
        input.source_allocation_version !== undefined
          ? input.source_allocation_version
          : existing.source_allocation_version,
        nextStats.company_count,
        nextStats.total_planned_cents,
        fundId,
        scenarioId,
      ]
    );

    if (snapshotItems) {
      await client.query('DELETE FROM allocation_scenario_items WHERE scenario_id = $1', [
        scenarioId,
      ]);
      await insertScenarioItems(client, scenarioId, snapshotItems);
    }

    return fetchScenarioDetail(client, fundId, scenarioId);
  });
}
