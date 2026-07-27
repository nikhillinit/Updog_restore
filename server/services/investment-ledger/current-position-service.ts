import { sql } from 'drizzle-orm';

import { db } from '../../db';
import {
  CurrentPositionListV1Schema,
  type CurrentPositionQuery,
  type CurrentPositionV1,
  type CurrentPositionListV1,
} from '../../../shared/contracts/investment-ledger/current-position.contract';
import { Decimal } from '../../../shared/lib/decimal-config';

type LedgerDatabase = typeof db;

interface PositionEventRow {
  id: number;
  fundId: number;
  vehicleId: number;
  companyIdentityId: number;
  eventType: string;
  effectiveDate: string;
  recordedAt: Date;
  sharesDelta: string;
  costBasisDelta: string;
  proceeds: string;
  vehicleParticipationId: number | null;
  resultingParticipationId: number | null;
}

interface ParticipationTermRow {
  id: number;
  securityType: string;
}

interface SourceBasisReliefRow {
  conversionPositionEventId: number;
  sourceParticipationId: number;
  resultingParticipationId: number;
  relievedCostBasis: string;
}

interface ComponentAccumulator {
  kind: 'priced' | 'contingent';
  shares: Decimal;
  costBasis: Decimal;
  participationIds: Set<number>;
}

export class CurrentPositionServiceError extends Error {
  readonly statusCode: number;

  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'CurrentPositionServiceError';
    this.statusCode = status;
  }
}

export async function listCurrentPositions(input: {
  fundId: number;
  query?: CurrentPositionQuery;
  knowledgeCutoff?: Date;
  database?: LedgerDatabase;
}): Promise<CurrentPositionListV1> {
  const database = input.database ?? db;
  const asOfDate = input.query?.asOfDate ?? new Date().toISOString().slice(0, 10);
  const knowledgeCutoff = input.knowledgeCutoff ?? new Date();
  const events = await readPositionEvents(database, {
    fundId: input.fundId,
    vehicleId: input.query?.vehicleId,
    companyIdentityId: input.query?.companyIdentityId,
    asOfDate,
    knowledgeCutoff,
  });
  const participationIds = uniquePositiveIds(
    events.flatMap((event) => [event.vehicleParticipationId, event.resultingParticipationId])
  );
  const termsByParticipationId = await readParticipationTerms(database, input.fundId, participationIds);
  const conversionReliefs = await readSourceBasisReliefs(
    database,
    input.fundId,
    events.filter((event) => event.eventType === 'conversion').map((event) => event.id)
  );

  const positions = buildPositions({
    fundId: input.fundId,
    asOfDate,
    knowledgeCutoff,
    events,
    termsByParticipationId,
    conversionReliefs,
  });

  return CurrentPositionListV1Schema.parse({
    fundId: input.fundId,
    asOfDate,
    knowledgeCutoff: knowledgeCutoff.toISOString(),
    positions,
  });
}

function buildPositions(input: {
  fundId: number;
  asOfDate: string;
  knowledgeCutoff: Date;
  events: PositionEventRow[];
  termsByParticipationId: Map<number, ParticipationTermRow>;
  conversionReliefs: SourceBasisReliefRow[];
}): CurrentPositionV1[] {
  const groups = new Map<string, PositionEventRow[]>();
  for (const event of input.events) {
    const key = `${event.vehicleId}:${event.companyIdentityId}`;
    const group = groups.get(key);
    if (group) group.push(event);
    else groups.set(key, [event]);
  }

  return Array.from(groups.values())
    .map((events) => {
      const first = events[0]!;
      const components = buildComponents(events, input.termsByParticipationId, input.conversionReliefs);
      const shares = sum(events.map((event) => event.sharesDelta));
      const costBasis = sum(events.map((event) => event.costBasisDelta));
      const proceeds = sum(events.map((event) => event.proceeds));
      const warnings =
        components.some((component) => component.kind === 'priced') &&
        components.some((component) => component.kind === 'contingent')
          ? [
              {
                code: 'MIXED_PRICED_AND_CONTINGENT_COMPONENTS',
                message: 'Position contains both priced and contingent components.',
              },
            ]
          : [];
      return {
        fundId: input.fundId,
        vehicleId: first.vehicleId,
        companyIdentityId: first.companyIdentityId,
        asOfDate: input.asOfDate,
        knowledgeCutoff: input.knowledgeCutoff.toISOString(),
        shares: q6(shares),
        costBasis: money(costBasis),
        proceeds: money(proceeds),
        components: components.map((component) => ({
          kind: component.kind,
          shares: q6(component.shares),
          costBasis: money(component.costBasis),
          participationIds: [...component.participationIds].sort((left, right) => left - right),
        })),
        warnings,
      };
    })
    .sort((left, right) => left.vehicleId - right.vehicleId || left.companyIdentityId - right.companyIdentityId);
}

function buildComponents(
  events: readonly PositionEventRow[],
  termsByParticipationId: Map<number, ParticipationTermRow>,
  conversionReliefs: readonly SourceBasisReliefRow[]
): ComponentAccumulator[] {
  const components = new Map<'priced' | 'contingent', ComponentAccumulator>();
  const conversionEventIds = new Set(events.map((event) => event.id));
  const reliefByConversionId = new Map(
    conversionReliefs
      .filter((relief) => conversionEventIds.has(relief.conversionPositionEventId))
      .map((relief) => [relief.conversionPositionEventId, relief])
  );

  for (const event of events) {
    const participationId = event.resultingParticipationId ?? event.vehicleParticipationId;
    if (participationId === null) {
      addComponent(components, 'priced', null, event.sharesDelta, event.costBasisDelta);
      continue;
    }
    const kind = componentKind(termsByParticipationId.get(participationId)?.securityType);
    addComponent(components, kind, participationId, event.sharesDelta, event.costBasisDelta);

    if (event.eventType !== 'conversion') continue;
    const relief = reliefByConversionId.get(event.id);
    if (!relief) continue;
    addComponent(components, 'contingent', relief.sourceParticipationId, '0.000000', new Decimal(relief.relievedCostBasis).negated());
    addComponent(components, 'priced', relief.resultingParticipationId, '0.000000', relief.relievedCostBasis);
  }

  return Array.from(components.values()).filter(
    (component) => !component.shares.isZero() || !component.costBasis.isZero()
  );
}

function addComponent(
  components: Map<'priced' | 'contingent', ComponentAccumulator>,
  kind: 'priced' | 'contingent',
  participationId: number | null,
  shares: Decimal.Value,
  costBasis: Decimal.Value
): void {
  const existing =
    components.get(kind) ??
    ({
      kind,
      shares: new Decimal(0),
      costBasis: new Decimal(0),
      participationIds: new Set<number>(),
    } satisfies ComponentAccumulator);
  existing.shares = existing.shares.plus(shares);
  existing.costBasis = existing.costBasis.plus(costBasis);
  if (participationId !== null) existing.participationIds.add(participationId);
  components.set(kind, existing);
}

function componentKind(securityType: string | undefined): 'priced' | 'contingent' {
  return securityType === 'safe' || securityType === 'convertible_note' ? 'contingent' : 'priced';
}

async function readPositionEvents(
  database: LedgerDatabase,
  input: {
    fundId: number;
    vehicleId: number | undefined;
    companyIdentityId: number | undefined;
    asOfDate: string;
    knowledgeCutoff: Date;
  }
): Promise<PositionEventRow[]> {
  return readRows(
    await database.execute(sql`
      SELECT id, fund_id, vehicle_id, company_identity_id, event_type, effective_date,
             recorded_at, shares_delta, cost_basis_delta, proceeds,
             vehicle_participation_id, resulting_participation_id
      FROM position_events
      WHERE fund_id = ${input.fundId}
        AND effective_date <= ${input.asOfDate}
        AND recorded_at <= ${input.knowledgeCutoff}
        ${input.vehicleId === undefined ? sql`` : sql`AND vehicle_id = ${input.vehicleId}`}
        ${
          input.companyIdentityId === undefined
            ? sql``
            : sql`AND company_identity_id = ${input.companyIdentityId}`
        }
      ORDER BY vehicle_id, company_identity_id, effective_date, recorded_at, id
    `)
  ).map(positionEventFromRow);
}

async function readParticipationTerms(
  database: LedgerDatabase,
  fundId: number,
  participationIds: readonly number[]
): Promise<Map<number, ParticipationTermRow>> {
  if (participationIds.length === 0) return new Map();
  const params = sql.join(
    participationIds.map((id) => sql`${id}`),
    sql`, `
  );
  return new Map(
    readRows(
      await database.execute(sql`
        SELECT p.id, t.security_type
        FROM vehicle_financing_participations p
        JOIN financing_tranches t
          ON t.id = p.financing_tranche_id
         AND t.fund_id = p.fund_id
        WHERE p.fund_id = ${fundId}
          AND p.id = ANY(ARRAY[${params}]::int[])
      `)
    ).map((row) => [
      asPositiveInt(row['id']),
      { id: asPositiveInt(row['id']), securityType: asString(row['security_type']) },
    ])
  );
}

async function readSourceBasisReliefs(
  database: LedgerDatabase,
  fundId: number,
  conversionEventIds: readonly number[]
): Promise<SourceBasisReliefRow[]> {
  if (conversionEventIds.length === 0) return [];
  const params = sql.join(
    conversionEventIds.map((id) => sql`${id}`),
    sql`, `
  );
  return readRows(
    await database.execute(sql`
      SELECT conversion_position_event_id, source_participation_id,
             resulting_participation_id, relieved_cost_basis
      FROM position_event_source_basis_reliefs
      WHERE fund_id = ${fundId}
        AND conversion_position_event_id = ANY(ARRAY[${params}]::int[])
    `)
  ).map((row) => ({
    conversionPositionEventId: asPositiveInt(row['conversion_position_event_id']),
    sourceParticipationId: asPositiveInt(row['source_participation_id']),
    resultingParticipationId: asPositiveInt(row['resulting_participation_id']),
    relievedCostBasis: asString(row['relieved_cost_basis']),
  }));
}

function uniquePositiveIds(values: readonly (number | null)[]): number[] {
  return [...new Set(values.filter((value): value is number => value !== null))].sort(
    (left, right) => left - right
  );
}

function sum(values: readonly Decimal.Value[]): Decimal {
  let total = new Decimal(0);
  for (const value of values) {
    total = total.plus(value);
  }
  return total;
}

function q6(value: Decimal): string {
  return value.toFixed(6);
}

function money(value: Decimal): string {
  return value.toFixed(6);
}

function positionEventFromRow(row: Record<string, unknown>): PositionEventRow {
  return {
    id: asPositiveInt(row['id']),
    fundId: asPositiveInt(row['fund_id']),
    vehicleId: asPositiveInt(row['vehicle_id']),
    companyIdentityId: asPositiveInt(row['company_identity_id']),
    eventType: asString(row['event_type']),
    effectiveDate: asDateString(row['effective_date']),
    recordedAt: asDate(row['recorded_at']),
    sharesDelta: asString(row['shares_delta']),
    costBasisDelta: asString(row['cost_basis_delta']),
    proceeds: asString(row['proceeds']),
    vehicleParticipationId: asNullablePositiveInt(row['vehicle_participation_id']),
    resultingParticipationId: asNullablePositiveInt(row['resulting_participation_id']),
  };
}

function readRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  if (result && typeof result === 'object' && 'rows' in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
  }
  return [];
}

function asPositiveInt(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CurrentPositionServiceError(500, 'LEDGER_READ_FAILED', 'Database returned invalid id.');
  }
  return parsed;
}

function asNullablePositiveInt(value: unknown): number | null {
  return value === null || value === undefined ? null : asPositiveInt(value);
}

function asString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new CurrentPositionServiceError(
      500,
      'LEDGER_READ_FAILED',
      'Database returned invalid string.'
    );
  }
  return value;
}

function asDateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return asString(value);
}

function asDate(value: unknown): Date {
  const parsed = value instanceof Date ? value : new Date(asString(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new CurrentPositionServiceError(
      500,
      'LEDGER_READ_FAILED',
      'Database returned invalid timestamp.'
    );
  }
  return parsed;
}
