import fs from 'node:fs';

import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { SECURITY_TYPE_TERM_MATRIX } from '@shared/contracts/investment-ledger/financing-event.contract';
import * as runtimeSchema from '@shared/schema';
import { cashFlowEvents, vehicles } from '@shared/schema/lp-reporting-evidence';
import { financingEvents, financingTranches } from '@shared/schema/investment-ledger';
import { investmentRounds } from '@shared/schema/investment-rounds';
import { investmentLots, investments } from '@shared/schema/portfolio';
import { vehicleFinancingParticipations } from '@shared/schema/vehicle-financing-participations';

const eventConfig = getTableConfig(financingEvents);
const trancheConfig = getTableConfig(financingTranches);
const participationConfig = getTableConfig(vehicleFinancingParticipations);
const investmentsConfig = getTableConfig(investments);
const roundsConfig = getTableConfig(investmentRounds);
const lotsConfig = getTableConfig(investmentLots);
const cashFlowConfig = getTableConfig(cashFlowEvents);
const vehiclesConfig = getTableConfig(vehicles);
const dialect = new PgDialect();

function constraints(config: typeof eventConfig): string[] {
  return [
    ...config.foreignKeys.map((foreignKey) => foreignKey.getName()),
    ...config.uniqueConstraints.map((constraint) => constraint.name),
    ...config.checks.map((constraint) => constraint.name),
  ];
}

function indexes(config: typeof eventConfig): string[] {
  return config.indexes.map((index) => index.config.name);
}

function numericShape(config: typeof eventConfig, columnName: string) {
  const column = config.columns.find((candidate) => candidate.name === columnName) as
    { precision?: number; scale?: number } | undefined;
  return { precision: column?.precision, scale: column?.scale };
}

function checkSql(config: typeof eventConfig, checkName: string): string {
  const check = config.checks.find((candidate) => candidate.name === checkName);
  if (!check) {
    throw new Error(`Missing CHECK ${checkName}`);
  }
  return dialect.sqlToQuery(check.value).sql;
}

function snakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

const migration0040 = fs.readFileSync('migrations/0040_multi_entity_ledger_foundation.sql', 'utf8');
const migration0041 = fs.readFileSync(
  'migrations/0041_vehicle_financing_participations.sql',
  'utf8'
);
const trancheTermCheckBySecurityType = {
  equity: 'financing_tranches_equity_terms_check',
  safe: 'financing_tranches_safe_terms_check',
  convertible_note: 'financing_tranches_note_terms_check',
} as const;

function migrationCheckBody(checkName: string): string {
  const startMarker = `CONSTRAINT "${checkName}"`;
  const start = migration0040.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`Missing migration CHECK ${checkName}`);
  }

  const nextConstraint = migration0040.indexOf('\n  CONSTRAINT "', start + startMarker.length);
  return migration0040.slice(start, nextConstraint === -1 ? undefined : nextConstraint);
}

describe('investment ledger Drizzle schema', () => {
  it('exports both tables through the shadowing runtime schema barrel', () => {
    expect(runtimeSchema.financingEvents).toBe(financingEvents);
    expect(runtimeSchema.financingTranches).toBe(financingTranches);
    expect(runtimeSchema.vehicleFinancingParticipations).toBe(vehicleFinancingParticipations);
    expect(eventConfig.name).toBe('financing_events');
    expect(trancheConfig.name).toBe('financing_tranches');
    expect(participationConfig.name).toBe('vehicle_financing_participations');
  });

  it('pins every column and the ledger precision policy', () => {
    expect(eventConfig.columns.map((column) => column.name)).toEqual([
      'id',
      'fund_id',
      'company_identity_id',
      'event_key',
      'round_name',
      'security_type',
      'event_date',
      'currency',
      'round_size',
      'pre_money_valuation',
      'post_money_valuation',
      'price_per_share',
      'created_by',
      'idempotency_key',
      'request_hash',
      'created_at',
    ]);
    expect(trancheConfig.columns.map((column) => column.name)).toEqual([
      'id',
      'fund_id',
      'financing_event_id',
      'tranche_key',
      'version',
      'superseded_by_tranche_id',
      'closing_date',
      'security_type',
      'investment_amount',
      'original_amount',
      'currency',
      'fx_rate_to_usd',
      'fx_rate_date',
      'price_per_share',
      'post_money_valuation',
      'valuation_cap',
      'conversion_discount_rate',
      'interest_rate',
      'maturity_date',
      'liquidation_preference_multiple',
      'participating_preferred',
      'participation_cap_multiple',
      'pro_rata_rights_pct',
      'descriptive_terms',
      'calculation_eligible',
      'source_observation_id',
      'created_by',
      'idempotency_key',
      'request_hash',
      'created_at',
    ]);

    for (const column of [
      'round_size',
      'pre_money_valuation',
      'post_money_valuation',
      'price_per_share',
    ]) {
      expect(numericShape(eventConfig, column), column).toEqual({
        precision: 20,
        scale: 6,
      });
    }
    for (const column of [
      'investment_amount',
      'original_amount',
      'price_per_share',
      'post_money_valuation',
      'valuation_cap',
    ]) {
      expect(numericShape(trancheConfig, column), column).toEqual({
        precision: 20,
        scale: 6,
      });
    }
    for (const column of [
      'conversion_discount_rate',
      'interest_rate',
      'liquidation_preference_multiple',
      'participation_cap_multiple',
      'pro_rata_rights_pct',
    ]) {
      expect(numericShape(trancheConfig, column), column).toEqual({
        precision: 12,
        scale: 8,
      });
    }
    expect(numericShape(trancheConfig, 'fx_rate_to_usd')).toEqual({
      precision: 20,
      scale: 10,
    });
  });

  it('uses unique constraints, not unique indexes, for composite FK targets', () => {
    expect(constraints(eventConfig)).toContain('financing_events_id_fund_unique');
    expect(constraints(trancheConfig)).toContain('financing_tranches_id_fund_unique');
    expect(constraints(participationConfig)).toContain('vfp_id_fund_unique');
    expect(constraints(vehiclesConfig)).toContain('vehicles_id_fund_unique');
    expect(indexes(eventConfig)).not.toContain('financing_events_id_fund_unique');
    expect(indexes(trancheConfig)).not.toContain('financing_tranches_id_fund_unique');
    expect(indexes(participationConfig)).not.toContain('vfp_id_fund_unique');
    expect(indexes(vehiclesConfig)).not.toContain('vehicles_id_fund_unique');
    expect(constraints(eventConfig)).toContain('financing_events_identity_fund_fk');
    expect(constraints(trancheConfig)).toEqual(
      expect.arrayContaining([
        'financing_tranches_event_fund_fk',
        'financing_tranches_superseded_fund_fk',
        'financing_tranches_observation_fund_fk',
      ])
    );
  });

  it('pins vehicle participation columns, sparse overrides, and precision policy', () => {
    expect(participationConfig.columns.map((column) => column.name)).toEqual([
      'id',
      'fund_id',
      'vehicle_id',
      'financing_event_id',
      'tranche_key',
      'financing_tranche_id',
      'version',
      'superseded_by_participation_id',
      'participation_amount',
      'original_amount',
      'currency',
      'fx_rate_to_usd',
      'fx_rate_date',
      'shares_acquired',
      'closing_date',
      'price_per_share',
      'post_money_valuation',
      'valuation_cap',
      'conversion_discount_rate',
      'interest_rate',
      'liquidation_preference_multiple',
      'participation_cap_multiple',
      'pro_rata_rights_pct',
      'participating_preferred',
      'maturity_date',
      'descriptive_terms',
      'confirmed_duplicates',
      'source_observation_id',
      'created_by',
      'idempotency_key',
      'request_hash',
      'created_at',
    ]);
    expect(participationConfig.columns.map((column) => column.name)).not.toEqual(
      expect.arrayContaining(['security_type', 'calculation_eligible'])
    );

    for (const column of [
      'participation_amount',
      'original_amount',
      'price_per_share',
      'post_money_valuation',
      'valuation_cap',
    ]) {
      expect(numericShape(participationConfig, column), column).toEqual({
        precision: 20,
        scale: 6,
      });
    }
    for (const column of [
      'conversion_discount_rate',
      'interest_rate',
      'liquidation_preference_multiple',
      'participation_cap_multiple',
      'pro_rata_rights_pct',
    ]) {
      expect(numericShape(participationConfig, column), column).toEqual({
        precision: 12,
        scale: 8,
      });
    }
    expect(numericShape(participationConfig, 'fx_rate_to_usd')).toEqual({
      precision: 20,
      scale: 10,
    });
    expect(numericShape(participationConfig, 'shares_acquired')).toEqual({
      precision: 18,
      scale: 8,
    });
  });

  it('pins participation lineage constraints and head uniqueness', () => {
    expect(constraints(participationConfig)).toEqual(
      expect.arrayContaining([
        'vfp_fund_id_funds_id_fk',
        'vfp_vehicle_fund_fk',
        'vfp_tranche_fund_fk',
        'vfp_superseded_fund_fk',
        'vfp_observation_fund_fk',
        'vfp_created_by_fk',
        'vfp_version_positive_check',
        'vfp_amount_positive_check',
        'vfp_fx_rate_positive_check',
        'vfp_no_self_supersede_check',
        'vfp_usd_fx_check',
        'vfp_id_fund_unique',
        'vfp_fund_idem_unique',
        'vfp_key_version_unique',
      ])
    );

    const headIndex = participationConfig.indexes.find(
      (index) => index.config.name === 'vfp_head_unique'
    );
    expect(headIndex?.config.unique).toBe(true);
    expect(dialect.sqlToQuery(headIndex!.config.where!).sql).toContain(
      '"vehicle_financing_participations"."superseded_by_participation_id" IS NULL'
    );
    expect(indexes(participationConfig)).toEqual(
      expect.arrayContaining(['vfp_head_unique', 'idx_vfp_fund_vehicle', 'idx_vfp_fund_tranche'])
    );
  });

  it('adds compat lineage columns without exposing server-owned investment pointers', () => {
    expect(investmentsConfig.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['imported_from', 'vehicle_participation_id'])
    );
    expect(constraints(investmentsConfig)).toContain('investments_vfp_fund_fk');
    expect(indexes(investmentsConfig)).toContain('investments_vfp_unique');
    expect(roundsConfig.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['imported_from', 'vehicle_participation_id', 'financing_tranche_id'])
    );
    expect(constraints(roundsConfig)).toEqual(
      expect.arrayContaining([
        'investment_rounds_vfp_fund_fk',
        'investment_rounds_financing_tranche_fund_fk',
      ])
    );
    expect(lotsConfig.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['imported_from', 'vehicle_participation_id'])
    );
    expect(constraints(lotsConfig)).toContain('investment_lots_vfp_fk');
    expect(cashFlowConfig.columns.map((column) => column.name)).toContain(
      'vehicle_participation_id'
    );
    expect(constraints(cashFlowConfig)).toContain('cash_flow_events_vfp_fund_fk');

    expect(Object.keys(runtimeSchema.insertInvestmentSchema.shape)).not.toEqual(
      expect.arrayContaining(['importedFrom', 'vehicleParticipationId'])
    );
  });

  it('orders migration 0041 so composite FK targets exist before references', () => {
    const vehiclesUnique = migration0041.indexOf('vehicles_id_fund_unique');
    const createParticipation = migration0041.indexOf(
      'CREATE TABLE IF NOT EXISTS "vehicle_financing_participations"'
    );
    const vehicleFk = migration0041.indexOf('vfp_vehicle_fund_fk');
    const investmentsAlter = migration0041.indexOf('ALTER TABLE "investments"');

    expect(vehiclesUnique).toBeGreaterThanOrEqual(0);
    expect(createParticipation).toBeGreaterThan(vehiclesUnique);
    expect(vehicleFk).toBeGreaterThan(createParticipation);
    expect(investmentsAlter).toBeGreaterThan(vehicleFk);
    expect(migration0041).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "vfp_head_unique"');
    expect(migration0041).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "investments_vfp_unique"');
    expect(migration0041).toContain('ADD COLUMN IF NOT EXISTS "vehicle_participation_id"');
  });

  it('enforces one head per tranche identity with a partial unique index', () => {
    const headIndex = trancheConfig.indexes.find(
      (index) => index.config.name === 'financing_tranches_head_unique'
    );
    expect(headIndex?.config.unique).toBe(true);
    expect(dialect.sqlToQuery(headIndex!.config.where!).sql).toContain(
      '"financing_tranches"."superseded_by_tranche_id" IS NULL'
    );
  });

  it('declares every pinned ledger check and uniqueness constraint', () => {
    expect(constraints(eventConfig)).toEqual(
      expect.arrayContaining([
        'financing_events_fund_id_funds_id_fk',
        'financing_events_identity_fund_fk',
        'financing_events_created_by_fk',
        'financing_events_security_type_check',
        'financing_events_id_fund_unique',
        'financing_events_fund_idempotency_unique',
        'financing_events_identity_event_key_unique',
      ])
    );
    expect(constraints(trancheConfig)).toEqual(
      expect.arrayContaining([
        'financing_tranches_fund_id_funds_id_fk',
        'financing_tranches_event_fund_fk',
        'financing_tranches_superseded_fund_fk',
        'financing_tranches_observation_fund_fk',
        'financing_tranches_created_by_fk',
        'financing_tranches_security_type_check',
        'financing_tranches_version_positive_check',
        'financing_tranches_amount_positive_check',
        'financing_tranches_fx_rate_positive_check',
        'financing_tranches_no_self_supersede_check',
        'financing_tranches_usd_fx_check',
        'financing_tranches_equity_terms_check',
        'financing_tranches_safe_terms_check',
        'financing_tranches_note_terms_check',
        'financing_tranches_id_fund_unique',
        'financing_tranches_fund_idempotency_unique',
        'financing_tranches_event_key_version_unique',
      ])
    );
  });

  it('declares and migrates direct-write protection for positive tranche amounts and FX rates', () => {
    expect(checkSql(trancheConfig, 'financing_tranches_amount_positive_check')).toContain(
      '"financing_tranches"."investment_amount" > 0 AND "financing_tranches"."original_amount" > 0'
    );
    expect(checkSql(trancheConfig, 'financing_tranches_fx_rate_positive_check')).toContain(
      '"financing_tranches"."fx_rate_to_usd" > 0'
    );
    expect(migration0040).toContain('CONSTRAINT "financing_tranches_amount_positive_check"');
    expect(migration0040).toContain('CHECK ("investment_amount" > 0 AND "original_amount" > 0)');
    expect(migration0040).toContain('CONSTRAINT "financing_tranches_fx_rate_positive_check"');
    expect(migration0040).toContain('CHECK ("fx_rate_to_usd" > 0)');
  });

  it('keeps migration security-type term CHECKs semantically aligned with the exported matrix', () => {
    for (const [securityType, terms] of Object.entries(SECURITY_TYPE_TERM_MATRIX)) {
      const checkName =
        trancheTermCheckBySecurityType[securityType as keyof typeof trancheTermCheckBySecurityType];
      if (!checkName) {
        continue;
      }
      const body = migrationCheckBody(checkName);

      expect(body).toContain(`"security_type" <> '${securityType}'`);

      if ('requiredAny' in terms) {
        for (const field of terms.requiredAny) {
          expect(body).toContain(`"${snakeCase(field)}" IS NOT NULL`);
        }
      }
      if ('requiredAll' in terms) {
        for (const field of terms.requiredAll) {
          expect(body).toContain(`"${snakeCase(field)}" IS NOT NULL`);
        }
      }
      for (const field of terms.forbidden) {
        expect(body).toContain(`"${snakeCase(field)}" IS NULL`);
      }
    }
  });
});
