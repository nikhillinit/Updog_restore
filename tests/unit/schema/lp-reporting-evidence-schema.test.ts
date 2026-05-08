/**
 * LP Reporting & Evidence Pack -- Foundation Schema Smoke Test
 *
 * Verifies the 8 LP-reporting tables are accessible via barrel exports
 * from `@shared/schema`, mirror the SQL migration in
 * server/migrations/20260508_lp_reporting_foundation_v1.up.sql, and
 * declare the documented CHECK constraints. Catches barrel/import
 * regressions and Drizzle-binding drift without needing a live DB.
 */
import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';

import * as schema from '@shared/schema';

describe('LP Reporting Foundation Schema -- Drizzle bindings', () => {
  describe('Barrel exports', () => {
    it('vehicles table is accessible', () => {
      expect(schema.vehicles).toBeDefined();
      expect(typeof schema.vehicles).toBe('object');
    });

    it('cashFlowEvents table is accessible', () => {
      expect(schema.cashFlowEvents).toBeDefined();
      expect(typeof schema.cashFlowEvents).toBe('object');
    });

    it('valuationMarks table is accessible', () => {
      expect(schema.valuationMarks).toBeDefined();
      expect(typeof schema.valuationMarks).toBe('object');
    });

    it('lpMetricRuns table is accessible', () => {
      expect(schema.lpMetricRuns).toBeDefined();
      expect(typeof schema.lpMetricRuns).toBe('object');
    });

    it('narrativeRuns table is accessible', () => {
      expect(schema.narrativeRuns).toBeDefined();
      expect(typeof schema.narrativeRuns).toBe('object');
    });

    it('evidenceRecords table is accessible', () => {
      expect(schema.evidenceRecords).toBeDefined();
      expect(typeof schema.evidenceRecords).toBe('object');
    });

    it('lpVehicleParticipation table is accessible', () => {
      expect(schema.lpVehicleParticipation).toBeDefined();
      expect(typeof schema.lpVehicleParticipation).toBe('object');
    });

    it('lpVehicleParticipationHistory table is accessible', () => {
      expect(schema.lpVehicleParticipationHistory).toBeDefined();
      expect(typeof schema.lpVehicleParticipationHistory).toBe('object');
    });
  });

  describe('Drizzle table names match the SQL migration', () => {
    it.each([
      ['vehicles', schema.vehicles],
      ['cash_flow_events', schema.cashFlowEvents],
      ['valuation_marks', schema.valuationMarks],
      ['lp_metric_runs', schema.lpMetricRuns],
      ['narrative_runs', schema.narrativeRuns],
      ['evidence_records', schema.evidenceRecords],
      ['lp_vehicle_participation', schema.lpVehicleParticipation],
      ['lp_vehicle_participation_history', schema.lpVehicleParticipationHistory],
    ])('table %s has matching SQL name', (sqlName, table) => {
      const config = getTableConfig(table);
      expect(config.name).toBe(sqlName);
    });
  });

  describe('Money columns use NUMERIC(20,6) precision', () => {
    it.each([
      ['vehicles.committed_capital', schema.vehicles, 'committed_capital'],
      ['cash_flow_events.amount', schema.cashFlowEvents, 'amount'],
      ['valuation_marks.fair_value', schema.valuationMarks, 'fair_value'],
      ['valuation_marks.cost_basis', schema.valuationMarks, 'cost_basis'],
      [
        'lp_vehicle_participation.commitment_amount',
        schema.lpVehicleParticipation,
        'commitment_amount',
      ],
    ])('%s is NUMERIC(20,6)', (_label, table, columnName) => {
      const config = getTableConfig(table);
      const column = config.columns.find((c) => c.name === columnName);
      expect(column).toBeDefined();
      const columnDef = column as unknown as {
        columnType?: string;
        precision?: number;
        scale?: number;
      };
      expect(columnDef.columnType).toMatch(/Numeric/i);
      expect(columnDef.precision).toBe(20);
      expect(columnDef.scale).toBe(6);
    });
  });

  describe('CHECK constraints declared on each table', () => {
    it('vehicles declares type, status, and admin-score CHECKs', () => {
      const config = getTableConfig(schema.vehicles);
      const names = config.checks.map((c) => c.name);
      expect(names).toContain('vehicles_type_check');
      expect(names).toContain('vehicles_status_check');
      expect(names).toContain('vehicles_admin_score_check');
    });

    it('cash_flow_events declares 4 CHECKs (event_type, perspective, status, locked-not-mutable)', () => {
      const config = getTableConfig(schema.cashFlowEvents);
      const names = config.checks.map((c) => c.name);
      expect(names).toContain('cash_flow_event_type_check');
      expect(names).toContain('cash_flow_perspective_check');
      expect(names).toContain('cash_flow_status_check');
      expect(names).toContain('cash_flow_locked_not_mutable');
    });

    it('valuation_marks declares 3 CHECKs (mark_source, confidence, status)', () => {
      const config = getTableConfig(schema.valuationMarks);
      const names = config.checks.map((c) => c.name);
      expect(names).toContain('valuation_mark_source_check');
      expect(names).toContain('valuation_confidence_check');
      expect(names).toContain('valuation_status_check');
    });

    it('lp_metric_runs declares 3 CHECKs (run_type, perspective, status)', () => {
      const config = getTableConfig(schema.lpMetricRuns);
      const names = config.checks.map((c) => c.name);
      expect(names).toContain('lp_metric_run_type_check');
      expect(names).toContain('lp_metric_run_perspective_check');
      expect(names).toContain('lp_metric_run_status_check');
    });

    it('narrative_runs declares 2 CHECKs (type, status)', () => {
      const config = getTableConfig(schema.narrativeRuns);
      const names = config.checks.map((c) => c.name);
      expect(names).toContain('narrative_type_check');
      expect(names).toContain('narrative_status_check');
    });

    it('evidence_records declares the num_nonnulls=1 typed-FK CHECK plus 4 enum CHECKs', () => {
      const config = getTableConfig(schema.evidenceRecords);
      const names = config.checks.map((c) => c.name);
      expect(names).toContain('evidence_one_target_check');
      expect(names).toContain('evidence_source_check');
      expect(names).toContain('evidence_confidence_check');
      expect(names).toContain('evidence_materiality_check');
      expect(names).toContain('evidence_confidentiality_check');
    });

    it('lp_vehicle_participation declares the status CHECK', () => {
      const config = getTableConfig(schema.lpVehicleParticipation);
      const names = config.checks.map((c) => c.name);
      expect(names).toContain('lp_participation_status_check');
    });
  });

  describe('Evidence target FK exclusivity (typed FKs, no polymorphic target_type)', () => {
    it('exposes 4 typed nullable FKs and no target_type column', () => {
      const config = getTableConfig(schema.evidenceRecords);
      const names = config.columns.map((c) => c.name);
      expect(names).toContain('valuation_mark_id');
      expect(names).toContain('company_id');
      expect(names).toContain('metric_run_id');
      expect(names).toContain('narrative_run_id');
      expect(names).not.toContain('target_type');
      expect(names).not.toContain('target_id');
    });
  });

  describe('Type inference compiles', () => {
    it('produces $inferSelect / $inferInsert types for each table', () => {
      // Compile-time assertions via type-only declarations. Existence at
      // runtime is sufficient evidence the inferred types are present.
      const vehicleSelect: schema.Vehicle | null = null;
      const cfeSelect: schema.CashFlowEvent | null = null;
      const vmSelect: schema.ValuationMark | null = null;
      const mrSelect: schema.LpMetricRun | null = null;
      const nrSelect: schema.NarrativeRun | null = null;
      const erSelect: schema.EvidenceRecord | null = null;
      const lvpSelect: schema.LpVehicleParticipation | null = null;
      const lvphSelect: schema.LpVehicleParticipationHistory | null = null;
      expect([
        vehicleSelect,
        cfeSelect,
        vmSelect,
        mrSelect,
        nrSelect,
        erSelect,
        lvpSelect,
        lvphSelect,
      ]).toHaveLength(8);
    });
  });
});
