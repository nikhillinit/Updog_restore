import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import * as runtimeSchema from '@shared/schema';
import { financingEvents, financingTranches } from '@shared/schema/investment-ledger';

const eventConfig = getTableConfig(financingEvents);
const trancheConfig = getTableConfig(financingTranches);
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

describe('investment ledger Drizzle schema', () => {
  it('exports both tables through the shadowing runtime schema barrel', () => {
    expect(runtimeSchema.financingEvents).toBe(financingEvents);
    expect(runtimeSchema.financingTranches).toBe(financingTranches);
    expect(eventConfig.name).toBe('financing_events');
    expect(trancheConfig.name).toBe('financing_tranches');
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
    expect(indexes(eventConfig)).not.toContain('financing_events_id_fund_unique');
    expect(indexes(trancheConfig)).not.toContain('financing_tranches_id_fund_unique');
    expect(constraints(eventConfig)).toContain('financing_events_identity_fund_fk');
    expect(constraints(trancheConfig)).toEqual(
      expect.arrayContaining([
        'financing_tranches_event_fund_fk',
        'financing_tranches_superseded_fund_fk',
        'financing_tranches_observation_fund_fk',
      ])
    );
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
});
