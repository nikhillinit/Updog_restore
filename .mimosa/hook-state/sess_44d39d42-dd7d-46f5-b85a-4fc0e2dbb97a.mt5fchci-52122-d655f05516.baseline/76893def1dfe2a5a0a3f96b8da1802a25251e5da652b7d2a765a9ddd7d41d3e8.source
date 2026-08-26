import { describe, expect, it } from 'vitest';

import { ALL_FLAGS, type FlagKey } from '../../../shared/feature-flags/flag-definitions';
import {
  CLIENT_FLAG_KEYS,
  type FlagKey as GeneratedFlagKey,
} from '../../../shared/generated/flag-types';
import { FLAG_DEFINITIONS } from '../../../shared/generated/flag-defaults';

const LEGACY_ALL_FLAGS_KEYS = [
  'enable_new_ia',
  'enable_kpi_selectors',
  'enable_cap_table_tabs',
  'enable_brand_tokens',
  'enable_modeling_wizard',
  'enable_wizard_step_general',
  'enable_wizard_step_sectors',
  'enable_wizard_step_allocations',
  'enable_wizard_step_fees',
  'enable_wizard_step_recycling',
  'enable_wizard_step_waterfall',
  'enable_wizard_step_results',
  'enable_reserve_engine',
  'enable_portfolio_table_v2',
  'enable_operations_hub',
  'enable_pipeline_bulk_actions',
  'enable_pipeline_dnd',
  'enable_lp_reporting',
  'enable_lp_snapshot_mode',
  'enable_context_rail',
  'enable_work_panel',
  'enable_cash_event_object',
  'enable_cash_event_edit',
  'enable_route_redirects',
  'enable_observability',
] as const;

const MIGRATED_DEPENDENCIES = {
  enable_cash_event_object: [],
  enable_cash_event_edit: ['enable_cash_event_object'],
  enable_work_panel: [],
  enable_context_rail: [],
  enable_lp_snapshot_mode: [],
  enable_observability: [],
  enable_route_redirects: ['enable_new_ia'],
  enable_wizard_step_sectors: ['enable_wizard_step_general'],
  enable_wizard_step_allocations: ['enable_wizard_step_sectors'],
  enable_wizard_step_recycling: ['enable_wizard_step_fees'],
} as const satisfies Record<string, readonly string[]>;

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

describe('feature flag registry parity', () => {
  it('preserves the legacy client flag keys as globally off by default', () => {
    for (const key of LEGACY_ALL_FLAGS_KEYS) {
      const flag = ALL_FLAGS[key as FlagKey];

      expect(flag, key).toBeDefined();
      expect(flag?.enabled, key).toBe(false);
    }
  });

  it('derives ALL_FLAGS exactly from registry flags exposed to the client', () => {
    expect(sorted(Object.keys(ALL_FLAGS))).toEqual(sorted(CLIENT_FLAG_KEYS));
  });

  it('preserves migrated dependencies without dangling registry edges', () => {
    for (const [key, expectedDependencies] of Object.entries(MIGRATED_DEPENDENCIES)) {
      const generatedKey = key as GeneratedFlagKey;

      expect(FLAG_DEFINITIONS[generatedKey].dependencies).toEqual([...expectedDependencies]);
      for (const dependency of expectedDependencies) {
        expect(dependency in FLAG_DEFINITIONS, `${key} -> ${dependency}`).toBe(true);
      }
    }
  });
});
