import type { CapitalDatabaseState, CapitalHttpResponse } from './capital-scenario-http-runtime';

const successFields = new Set([
  'id',
  'ids',
  'run',
  'runs',
  'calculationRun',
  'calculationRuns',
  'snapshots',
  'scenarioSetId',
  'scenario_set_id',
  'variantId',
  'variant_id',
  'variantIds',
  'variant_ids',
  'baselineVariantId',
  'baseline_variant_id',
  'runId',
  'run_id',
  'calculationRunId',
  'calculation_run_id',
  'snapshotId',
  'snapshot_id',
  'scenarioSet',
  'scenarioSets',
  'variant',
  'variants',
  'savedResult',
  'savedPayload',
  'savedResponse',
  'serializedResponse',
  'createdResponse',
  'payload',
  'result',
  'results',
  'snapshot',
  'calculation',
  'construction',
  'performance',
  'sourceBundle',
  'normalizedInputs',
  'monthlyDetail',
  'inputHash',
  'input_hash',
]);

function isFormattedValidationError(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const node = value as Record<string, unknown>;
  return (
    Array.isArray(node['_errors']) &&
    node['_errors'].every((error) => typeof error === 'string') &&
    Object.entries(node).every(
      ([key, child]) => key === '_errors' || isFormattedValidationError(child)
    )
  );
}

export function inspectCapitalRefusal(response: CapitalHttpResponse, before: CapitalDatabaseState) {
  const violations: string[] = [];
  if (response.status < 400) violations.push('Expected an HTTP refusal status');
  const setRows = before.tables['fund_scenario_sets'] ?? [];
  const variantRows = before.tables['fund_scenario_variants'] ?? [];
  const storedUuids = new Set([...setRows, ...variantRows].map((row) => row.id));
  const serialized = response.rawBody.toString('utf8');
  for (const id of storedUuids) {
    if (serialized.includes(id)) violations.push('Response contains a stored set or variant UUID');
  }
  const walk = (value: unknown, location: string): void => {
    if (typeof value === 'string') {
      for (const id of storedUuids) {
        if (value.includes(id))
          violations.push(`${location} contains a stored set or variant UUID`);
      }
      if (/^\s*[[{]/.test(value)) {
        try {
          walk(JSON.parse(value), `${location}.decodedJson`);
        } catch {
          /* Non-JSON error text. */
        }
      }
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${location}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (successFields.has(key) && !isFormattedValidationError(child)) {
        violations.push(`${location}.${key} is a success payload or stored identifier field`);
      }
      walk(child, `${location}.${key}`);
    }
  };
  walk(response.body, 'response');
  return {
    checkedStoredSets: setRows.length,
    checkedStoredVariants: variantRows.length,
    checkedStoredRunRows: before.tables['fund_scenario_calculation_runs']?.length ?? 0,
    checkedStoredSnapshotRows: before.tables['fund_snapshots']?.length ?? 0,
    numericIdentityPolicy:
      'Numeric counters and caller source pins are allowed; labeled run/snapshot identifier fields are forbidden.',
    validationPolicy: 'Formatted Zod error trees are validation paths, not saved success payloads.',
    violations: [...new Set(violations)],
  };
}
