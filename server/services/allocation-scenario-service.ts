import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { transaction } from '../db/pg-circuit.js';
import {
  applyAllocationUpdates,
  type AllocationWriteConflict,
} from './allocation-write-service.js';

interface HttpError extends Error {
  statusCode: number;
  code?: string;
  details?: unknown;
  conflicts?: AllocationWriteConflict[];
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

interface AllocationScenarioEventRow {
  id: string;
  event_type: 'applied' | 'synced';
  actor_user_id: number | null;
  actor_label: string | null;
  note: string | null;
  source_allocation_version: number | null;
  resulting_allocation_version: number | null;
  change_summary_json: unknown;
  created_at: Date;
}

interface LiveAllocationSnapshotItem {
  company_id: number;
  company_name: string;
  planned_reserves_cents: number;
  deployed_reserves_cents: number;
  allocation_cap_cents: number | null;
  allocation_reason: string | null;
  allocation_version: number;
  last_allocation_at: string | null;
}

interface AllocationScenarioPreviewContext {
  scenario: AllocationScenarioLoadedDetail;
  liveItems: LiveAllocationSnapshotItem[];
  preview: AllocationScenarioApplyPreview;
}

type AllocationScenarioApplyPreviewDriftStatus =
  | 'exact_match'
  | 'stale_but_mappable'
  | 'company_set_changed';

type AllocationScenarioApplyPreviewState = 'apply_allowed' | 'confirmable_with_drift' | 'blocked';

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

interface AllocationScenarioLoadedDetail extends AllocationScenarioSummary {
  snapshot_items: AllocationScenarioSnapshotItem[];
}

export interface AllocationScenarioDetail extends AllocationScenarioLoadedDetail {
  context: AllocationScenarioCollaborationContext;
}

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

export interface AllocationScenarioChangeSummary {
  companies_changed: number;
  companies_unchanged: number;
  scenario_only_count: number;
  live_only_count: number;
  total_planned_delta_cents: number;
  headline: string | null;
}

export interface AllocationScenarioCollaborationContextEvent {
  event_id: string;
  at: string;
  by: string | null;
  note: string | null;
  source_allocation_version: number | null;
  resulting_allocation_version: number | null;
  change_summary: AllocationScenarioChangeSummary;
}

export interface AllocationScenarioCollaborationContext {
  scenario_notes: string | null;
  last_sync: AllocationScenarioCollaborationContextEvent | null;
  last_apply: AllocationScenarioCollaborationContextEvent | null;
}

export interface AllocationScenarioEventSummary {
  id: string;
  event_type: 'applied' | 'synced';
  actor_user_id: number | null;
  actor_label: string | null;
  note: string | null;
  source_allocation_version: number | null;
  resulting_allocation_version: number | null;
  change_summary: AllocationScenarioChangeSummary;
  created_at: string;
}

export interface AllocationScenarioMutationActor {
  user_id?: number | null;
  label?: string | null;
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

export interface SyncAllocationScenarioInput {
  note?: string | null | undefined;
  actor?: AllocationScenarioMutationActor | undefined;
}

export interface ApplyAllocationScenarioInput extends SyncAllocationScenarioInput {
  preview_token: string;
}

export interface AllocationScenarioSyncResult {
  scenario: AllocationScenarioDetail;
  event: AllocationScenarioEventSummary;
}

export interface AllocationScenarioApplyResult extends AllocationScenarioSyncResult {
  live: {
    updated_count: number;
    resulting_allocation_version: number | null;
    previous_preview_token: string;
    current_live_token: string;
  };
}

function createHttpError(
  statusCode: number,
  message: string,
  options: {
    code?: string;
    details?: unknown;
    conflicts?: AllocationWriteConflict[];
  } = {}
): HttpError {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  if (options.code) {
    error.code = options.code;
  }
  if (options.details !== undefined) {
    error.details = options.details;
  }
  if (options.conflicts) {
    error.conflicts = options.conflicts;
  }
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

function calculateScenarioStats(items: Array<{ planned_reserves_cents: number }>) {
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

function mapLiveAllocationSnapshotItem(row: LiveAllocationSnapshotRow): LiveAllocationSnapshotItem {
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

function mapLiveItemToScenarioItem(item: LiveAllocationSnapshotItem): AllocationScenarioSnapshotItem {
  return {
    company_id: item.company_id,
    planned_reserves_cents: item.planned_reserves_cents,
    allocation_cap_cents: item.allocation_cap_cents,
    allocation_reason: item.allocation_reason,
  };
}

function buildLiveAllocationToken(fundId: number, items: LiveAllocationSnapshotItem[]): string {
  const payload = items.map((item) => ({
    company_id: item.company_id,
    allocation_version: item.allocation_version,
  }));

  return createHash('sha256').update(JSON.stringify({ fundId, payload })).digest('hex');
}

function areAllocationValuesDifferent(
  scenarioItem: AllocationScenarioSnapshotItem,
  liveItem: LiveAllocationSnapshotItem
): boolean {
  return (
    scenarioItem.planned_reserves_cents !== liveItem.planned_reserves_cents ||
    scenarioItem.allocation_cap_cents !== liveItem.allocation_cap_cents ||
    normalizeNotes(scenarioItem.allocation_reason) !== normalizeNotes(liveItem.allocation_reason)
  );
}

function buildChangeSummaryHeadline(
  eventType: 'applied' | 'synced',
  summary: Omit<AllocationScenarioChangeSummary, 'headline'>
): string | null {
  const verb = eventType === 'applied' ? 'Applied' : 'Synced';

  if (summary.scenario_only_count > 0 || summary.live_only_count > 0) {
    return `${verb} with company-set drift`;
  }

  if (summary.companies_changed === 0) {
    return `${verb} with no allocation changes`;
  }

  const noun = summary.companies_changed === 1 ? 'company' : 'companies';
  return `${verb} ${summary.companies_changed} ${noun}`;
}

function buildChangeSummaryFromPreview(
  preview: AllocationScenarioApplyPreview,
  eventType: 'applied' | 'synced'
): AllocationScenarioChangeSummary {
  const baseSummary = {
    companies_changed: preview.summary.companies_changed,
    companies_unchanged: preview.summary.companies_unchanged,
    scenario_only_count: preview.summary.scenario_only_count,
    live_only_count: preview.summary.live_only_count,
    total_planned_delta_cents: preview.summary.total_planned_delta_cents,
  };

  return {
    ...baseSummary,
    headline: buildChangeSummaryHeadline(eventType, baseSummary),
  };
}

function parseChangeSummary(raw: unknown): AllocationScenarioChangeSummary {
  const value =
    typeof raw === 'string' ? (JSON.parse(raw) as Partial<AllocationScenarioChangeSummary>) : raw;
  const summary =
    value && typeof value === 'object'
      ? (value as Partial<AllocationScenarioChangeSummary>)
      : {};

  return {
    companies_changed: summary.companies_changed ?? 0,
    companies_unchanged: summary.companies_unchanged ?? 0,
    scenario_only_count: summary.scenario_only_count ?? 0,
    live_only_count: summary.live_only_count ?? 0,
    total_planned_delta_cents: summary.total_planned_delta_cents ?? 0,
    headline: summary.headline ?? null,
  };
}

function mapEventRow(row: AllocationScenarioEventRow): AllocationScenarioEventSummary {
  return {
    id: row.id,
    event_type: row.event_type,
    actor_user_id: row.actor_user_id,
    actor_label: row.actor_label,
    note: row.note,
    source_allocation_version: row.source_allocation_version,
    resulting_allocation_version: row.resulting_allocation_version,
    change_summary: parseChangeSummary(row.change_summary_json),
    created_at: row.created_at.toISOString(),
  };
}

function mapContextEventRow(
  row: AllocationScenarioEventRow
): AllocationScenarioCollaborationContextEvent {
  return {
    event_id: row.id,
    at: row.created_at.toISOString(),
    by: row.actor_label,
    note: row.note,
    source_allocation_version: row.source_allocation_version,
    resulting_allocation_version: row.resulting_allocation_version,
    change_summary: parseChangeSummary(row.change_summary_json),
  };
}

async function getLiveAllocationSnapshot(
  client: PoolClient,
  fundId: number,
  options: { forUpdate?: boolean } = {}
): Promise<LiveAllocationSnapshotItem[]> {
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
     ORDER BY id ASC
     ${options.forUpdate ? 'FOR UPDATE' : ''}`,
    [fundId]
  );

  return result.rows.map(mapLiveAllocationSnapshotItem);
}

async function verifyFundExists(client: PoolClient, fundId: number): Promise<void> {
  const result = await client.query<{ id: number }>('SELECT id FROM funds WHERE id = $1', [fundId]);

  if (result.rows.length === 0) {
    throw createHttpError(404, `Fund ${fundId} not found`, { code: 'fund_not_found' });
  }
}

async function verifyCompaniesInFund(
  client: PoolClient,
  fundId: number,
  companyIds: number[]
): Promise<void> {
  const uniqueCompanyIds = [...new Set(companyIds)];
  const result = await client.query<{ id: number }>(
    `SELECT id
       FROM portfoliocompanies
      WHERE fund_id = $1
        AND id = ANY($2::int[])`,
    [fundId, uniqueCompanyIds]
  );

  if (result.rows.length !== uniqueCompanyIds.length) {
    const foundIds = new Set(result.rows.map((row) => row.id));
    const missingIds = uniqueCompanyIds.filter((companyId) => !foundIds.has(companyId));
    throw createHttpError(404, `Companies not found in fund ${fundId}: ${missingIds.join(', ')}`, {
      code: 'company_not_found',
    });
  }
}

async function resolveActorUserId(client: PoolClient, userId: number | null | undefined) {
  if (!userId) {
    return null;
  }

  const result = await client.query<{ id: number }>('SELECT id FROM users WHERE id = $1', [userId]);
  return result.rows.length > 0 ? result.rows[0]!.id : null;
}

async function getScenarioHeaderOrThrow(
  client: PoolClient,
  fundId: number,
  scenarioId: string,
  options: { forUpdate?: boolean } = {}
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
       AND id = $2
     ${options.forUpdate ? 'FOR UPDATE' : ''}`,
    [fundId, scenarioId]
  );

  if (result.rows.length === 0) {
    throw createHttpError(404, `Allocation scenario ${scenarioId} not found`, {
      code: 'scenario_not_found',
    });
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

async function replaceScenarioItems(
  client: PoolClient,
  scenarioId: string,
  items: AllocationScenarioSnapshotItem[]
): Promise<void> {
  await client.query('DELETE FROM allocation_scenario_items WHERE scenario_id = $1', [scenarioId]);
  await insertScenarioItems(client, scenarioId, items);
}

async function insertScenarioEvent(
  client: PoolClient,
  options: {
    scenarioId: string;
    fundId: number;
    eventType: 'applied' | 'synced';
    actorUserId: number | null;
    actorLabel: string | null;
    note: string | null;
    sourceAllocationVersion: number | null;
    resultingAllocationVersion: number | null;
    changeSummary: AllocationScenarioChangeSummary;
    createdAt: Date;
  }
): Promise<AllocationScenarioEventSummary> {
  const result = await client.query<AllocationScenarioEventRow>(
    `INSERT INTO allocation_scenario_events (
       scenario_id,
       fund_id,
       event_type,
       actor_user_id,
       actor_label,
       note,
       source_allocation_version,
       resulting_allocation_version,
       change_summary_json,
       created_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
     RETURNING
       id,
       event_type,
       actor_user_id,
       actor_label,
       note,
       source_allocation_version,
       resulting_allocation_version,
       change_summary_json,
       created_at`,
    [
      options.scenarioId,
      options.fundId,
      options.eventType,
      options.actorUserId,
      options.actorLabel,
      options.note,
      options.sourceAllocationVersion,
      options.resultingAllocationVersion,
      JSON.stringify(options.changeSummary),
      options.createdAt,
    ]
  );

  return mapEventRow(result.rows[0]!);
}

async function fetchScenarioDetail(
  client: PoolClient,
  fundId: number,
  scenarioId: string
): Promise<AllocationScenarioDetail> {
  const header = await getScenarioHeaderOrThrow(client, fundId, scenarioId);
  const snapshot_items = await getScenarioItems(client, scenarioId);
  const context = await getScenarioCollaborationContext(client, scenarioId, header.notes);

  return {
    ...mapScenarioHeader(header),
    snapshot_items,
    context,
  };
}

async function getScenarioCollaborationContext(
  client: PoolClient,
  scenarioId: string,
  scenarioNotes: string | null
): Promise<AllocationScenarioCollaborationContext> {
  const result = await client.query<AllocationScenarioEventRow>(
    `SELECT DISTINCT ON (event_type)
       id,
       event_type,
       actor_user_id,
       actor_label,
       note,
       source_allocation_version,
       resulting_allocation_version,
       change_summary_json,
       created_at
     FROM allocation_scenario_events
     WHERE scenario_id = $1
       AND event_type IN ('synced', 'applied')
     ORDER BY event_type ASC, created_at DESC, id DESC`,
    [scenarioId]
  );

  let lastSync: AllocationScenarioCollaborationContextEvent | null = null;
  let lastApply: AllocationScenarioCollaborationContextEvent | null = null;

  for (const row of result.rows) {
    if (row.event_type === 'synced') {
      lastSync = mapContextEventRow(row);
      continue;
    }

    if (row.event_type === 'applied') {
      lastApply = mapContextEventRow(row);
    }
  }

  return {
    scenario_notes: scenarioNotes,
    last_sync: lastSync,
    last_apply: lastApply,
  };
}

async function buildAllocationScenarioPreviewContext(
  client: PoolClient,
  fundId: number,
  scenarioId: string,
  options: { lockScenario?: boolean; lockLiveRows?: boolean } = {}
): Promise<AllocationScenarioPreviewContext> {
  await verifyFundExists(client, fundId);

  const header = await getScenarioHeaderOrThrow(
    client,
    fundId,
    scenarioId,
    options.lockScenario ? { forUpdate: true } : {}
  );
  const snapshot_items = await getScenarioItems(client, scenarioId);
  const scenario: AllocationScenarioLoadedDetail = {
    ...mapScenarioHeader(header),
    snapshot_items,
  };
  const liveItems = await getLiveAllocationSnapshot(
    client,
    fundId,
    options.lockLiveRows ? { forUpdate: true } : {}
  );

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

    if (areAllocationValuesDifferent(snapshotItem, liveItem)) {
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

  const { snapshot_items: _snapshotItems, ...scenarioSummary } = scenario;
  const preview: AllocationScenarioApplyPreview = {
    scenario: scenarioSummary,
    live: {
      fund_id: fundId,
      company_count: liveItems.length,
      total_planned_cents: liveItems.reduce((sum, item) => sum + item.planned_reserves_cents, 0),
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

  return {
    scenario,
    liveItems,
    preview,
  };
}

export async function getAllocationScenarioApplyPreview(
  fundId: number,
  scenarioId: string
): Promise<AllocationScenarioApplyPreview> {
  return transaction(async (client) => {
    const context = await buildAllocationScenarioPreviewContext(client, fundId, scenarioId);
    return context.preview;
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
      await replaceScenarioItems(client, scenarioId, snapshotItems);
    }

    return fetchScenarioDetail(client, fundId, scenarioId);
  });
}

export async function syncAllocationScenario(
  fundId: number,
  scenarioId: string,
  input: SyncAllocationScenarioInput
): Promise<AllocationScenarioSyncResult> {
  return transaction(async (client) => {
    const context = await buildAllocationScenarioPreviewContext(client, fundId, scenarioId, {
      lockScenario: true,
    });
    const actorLabel = normalizeNotes(input.actor?.label);
    const actorUserId = await resolveActorUserId(client, input.actor?.user_id ?? null);
    const actionAt = new Date();
    const syncedItems = context.liveItems.map(mapLiveItemToScenarioItem);
    const nextStats = calculateScenarioStats(syncedItems);
    const resultingVersion = context.preview.live.max_allocation_version;

    await replaceScenarioItems(client, scenarioId, syncedItems);
    await client.query(
      `UPDATE allocation_scenarios
          SET source_allocation_version = $1,
              company_count = $2,
              total_planned_cents = $3,
              last_synced_at = $4,
              last_synced_by = $5,
              updated_at = $4
        WHERE fund_id = $6
          AND id = $7`,
      [
        resultingVersion,
        nextStats.company_count,
        nextStats.total_planned_cents,
        actionAt,
        actorLabel,
        fundId,
        scenarioId,
      ]
    );

    const event = await insertScenarioEvent(client, {
      scenarioId,
      fundId,
      eventType: 'synced',
      actorUserId,
      actorLabel,
      note: normalizeNotes(input.note),
      sourceAllocationVersion: context.scenario.source_allocation_version,
      resultingAllocationVersion: resultingVersion,
      changeSummary: buildChangeSummaryFromPreview(context.preview, 'synced'),
      createdAt: actionAt,
    });

    const scenario = await fetchScenarioDetail(client, fundId, scenarioId);
    return { scenario, event };
  });
}

export async function applyAllocationScenario(
  fundId: number,
  scenarioId: string,
  input: ApplyAllocationScenarioInput
): Promise<AllocationScenarioApplyResult> {
  return transaction(async (client) => {
    const context = await buildAllocationScenarioPreviewContext(client, fundId, scenarioId, {
      lockScenario: true,
      lockLiveRows: true,
    });

    if (context.preview.live_token !== input.preview_token) {
      throw createHttpError(409, 'Apply preview has expired; refresh preview and try again', {
        code: 'preview_token_mismatch',
        details: {
          current_live_token: context.preview.live_token,
        },
      });
    }

    if (context.preview.apply_state === 'blocked') {
      throw createHttpError(
        409,
        'Scenario can no longer be applied because the live company set changed',
        {
          code: 'apply_blocked',
          details: {
            drift_status: context.preview.drift_status,
            summary: context.preview.summary,
          },
        }
      );
    }

    const liveByCompanyId = new Map(context.liveItems.map((item) => [item.company_id, item] as const));
    const updates = context.scenario.snapshot_items
      .map((item) => {
        const liveItem = liveByCompanyId.get(item.company_id);
        if (!liveItem) {
          throw createHttpError(
            409,
            'Scenario can no longer be applied because the live company set changed',
            {
              code: 'apply_blocked',
              details: {
                drift_status: 'company_set_changed',
              },
            }
          );
        }

        if (!areAllocationValuesDifferent(item, liveItem)) {
          return null;
        }

        return {
          company_id: item.company_id,
          planned_reserves_cents: item.planned_reserves_cents,
          allocation_cap_cents: item.allocation_cap_cents,
          allocation_reason: item.allocation_reason,
          expected_version: liveItem.allocation_version,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const actorLabel = normalizeNotes(input.actor?.label);
    const actorUserId = await resolveActorUserId(client, input.actor?.user_id ?? null);
    const actionAt = new Date();
    let updatedCount = 0;
    let resultingVersion = context.preview.live.max_allocation_version;

    try {
      if (updates.length > 0) {
        const writeResult = await applyAllocationUpdates(client, {
          fundId,
          updates,
          userId: actorUserId,
          auditMetadata: {
            source: 'allocation_scenario_apply',
            scenario_id: scenarioId,
          },
        });

        updatedCount = writeResult.updated_count;
        resultingVersion = Math.max(
          context.preview.live.max_allocation_version ?? 0,
          writeResult.new_version
        );
      }
    } catch (error) {
      if (
        error instanceof Error &&
        'statusCode' in error &&
        (error as { statusCode?: unknown }).statusCode === 409
      ) {
        const writeError = error as HttpError;
        throw createHttpError(409, writeError.message, {
          code: writeError.code ?? 'version_conflict',
          ...(writeError.conflicts ? { conflicts: writeError.conflicts } : {}),
        });
      }

      throw error;
    }

    await client.query(
      `UPDATE allocation_scenarios
          SET source_allocation_version = $1,
              last_applied_at = $2,
              last_applied_by = $3,
              last_applied_allocation_version = $4,
              updated_at = $2
        WHERE fund_id = $5
          AND id = $6`,
      [resultingVersion, actionAt, actorLabel, resultingVersion, fundId, scenarioId]
    );

    const event = await insertScenarioEvent(client, {
      scenarioId,
      fundId,
      eventType: 'applied',
      actorUserId,
      actorLabel,
      note: normalizeNotes(input.note),
      sourceAllocationVersion: context.scenario.source_allocation_version,
      resultingAllocationVersion: resultingVersion,
      changeSummary: buildChangeSummaryFromPreview(context.preview, 'applied'),
      createdAt: actionAt,
    });

    const scenario = await fetchScenarioDetail(client, fundId, scenarioId);
    const currentLiveItems =
      updates.length > 0
        ? await getLiveAllocationSnapshot(client, fundId)
        : context.liveItems;

    return {
      scenario,
      event,
      live: {
        updated_count: updatedCount,
        resulting_allocation_version: resultingVersion,
        previous_preview_token: input.preview_token,
        current_live_token: buildLiveAllocationToken(fundId, currentLiveItems),
      },
    };
  });
}
