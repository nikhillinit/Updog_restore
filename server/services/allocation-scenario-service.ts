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
  created_at: Date;
  updated_at: Date;
}

interface AllocationScenarioItemRow {
  company_id: number;
  planned_reserves_cents: string;
  allocation_cap_cents: string | null;
  allocation_reason: string | null;
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
  created_at: string;
  updated_at: string;
}

export interface AllocationScenarioDetail extends AllocationScenarioSummary {
  snapshot_items: AllocationScenarioSnapshotItem[];
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
