import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { normalizePostgresLiteralTextArrayCasts } from './lib/postgres-catalog-definition.mjs';

/**
 * @typedef {{ idx: number, version: string, when: number, tag: string, breakpoints: boolean }} JournalEntry
 * @typedef {JournalEntry & { hash: string }} HashedJournalEntry
 * @typedef {{ constraintCount: number, constraintSha256: string, indexCount: number, indexSha256: string }} SentinelDefinition
 * @typedef {SentinelDefinition & { tag: string, manifest: string, table: string, priorDefinitions?: SentinelDefinition }} CurrentForecastSentinel
 */

export const CURRENT_FORECAST_MIGRATION_IDENTITIES = Object.freeze([
  Object.freeze({ tag: '0050_g3_portfolio_and_calculation_schema', when: 1785800400000 }),
  Object.freeze({ tag: '0051_g3_canary_schema', when: 1785886800000 }),
  Object.freeze({ tag: '0052_g3_capital_call_notification_outbox', when: 1785973200000 }),
  Object.freeze({ tag: '0053_g3_release_gate_hardening', when: 1786059600000 }),
  Object.freeze({ tag: '0054_operating_decisions_spine', when: 1788161773455 }),
  Object.freeze({ tag: '0055_current_forecast_recompute_commands', when: 1788235843534 }),
]);
export const CURRENT_FORECAST_MIGRATION_TAGS = Object.freeze(
  CURRENT_FORECAST_MIGRATION_IDENTITIES.map(({ tag }) => tag)
);

export const CURRENT_FORECAST_BASELINE = Object.freeze({
  tag: '0049_kpi_observations',
  when: 1785714000000,
  hash: 'ae4d86c638118049a89b7c238ee04a38566ad029651db1f17c522d4a062cd3c7',
});

// ADR-074 preserved these exact journaled rows; 0008-0044 were reconciled separately.
const ADR074_BASELINE_TAGS = Object.freeze([
  '0000_quick_vivisector',
  '0001_certain_miracleman',
  '0002_phase0_variance_automation',
  '0003_phase0_runtime_alignment',
  '0004_phase1a1c_company_snapshots',
  '0005_phase1c2_alert_automation',
  '0005b_create_backtest_results',
  '0006_phase2_backtest_scenario_comparison_summary',
  '0007_phase2_retire_dormant_saved_comparison_persistence',
  '0045_internal_economics_policy_runs',
  '0046_internal_economics_certification',
  '0047_internal_economics_linkage',
  '0048_quarterly_review_workflow',
  '0049_kpi_observations',
]);

/** @type {readonly Readonly<CurrentForecastSentinel>[]} */
export const CURRENT_FORECAST_SENTINELS = Object.freeze([
  Object.freeze({
    tag: '0050_g3_portfolio_and_calculation_schema',
    manifest: 'g3-portfolio-and-calculation',
    table: 'portfolio_company_update_receipts',
    constraintCount: 5,
    constraintSha256: '5a7f73a5c923bd7d316b60c3f8f24887ce2ba2b74859ec171dd8e33d9d807cf4',
    indexCount: 3,
    indexSha256: 'eaafb5c4d4f6e9c85990f02cb04de8242f94f944ce196744dc4a2e412aa9c13a',
  }),
  Object.freeze({
    tag: '0051_g3_canary_schema',
    manifest: 'g3-canary',
    table: 'release_canary_runs',
    constraintCount: 6,
    constraintSha256: '3044154229d0da7f573406ee0edb737efd139791adcfb7edb11dea8142c435dc',
    indexCount: 4,
    indexSha256: '313e83e45cf355ec41114ea6f041c2eddf0552552554d292a7f6bd85df7a938d',
    priorDefinitions: Object.freeze({
      constraintCount: 5,
      constraintSha256: '30e977c7862e147d0a31307cb03d584d8566b3d8dc54e600992b58334348f39f',
      indexCount: 3,
      indexSha256: 'a2fd4ab074eae4cc7e03822b2a46a34d0a8d842a1f758dc740bb2a390f879811',
    }),
  }),
  Object.freeze({
    tag: '0052_g3_capital_call_notification_outbox',
    manifest: 'g3-capital-call-notification-outbox',
    table: 'capital_call_notification_outbox',
    constraintCount: 7,
    constraintSha256: 'ac5ee48f02ae1a53d9890865993786ec2387e60aca00d0653c54fa1de6e3867f',
    indexCount: 3,
    indexSha256: '9f353468e9a6baae2bd91a319b3874d13cca14e5ffb0aa81ed12232c7794257a',
  }),
  Object.freeze({
    tag: '0053_g3_release_gate_hardening',
    manifest: 'g3-release-gate-hardening',
    table: 'fund_scenario_calculation_commands',
    constraintCount: 12,
    constraintSha256: 'e34c7961ee47a6e806f56c5cae1322e62abe956d237bc51957f8f2ef1c09a529',
    indexCount: 3,
    indexSha256: '2d0b03b2a8c10804015b68e291dc8007e96233ccff379d59556623917c28c463',
  }),
  Object.freeze({
    tag: '0054_operating_decisions_spine',
    manifest: 'operating-decisions-spine',
    table: 'operating_decisions',
    constraintCount: 13,
    constraintSha256: 'adb9798b4546af642f818a31b5b8593ecc86c97b9b7dfca1a8213423cb8cdaa3',
    indexCount: 4,
    indexSha256: 'cf890e6c4dbf0d465aafa22355b130cc96d3cf8b6825e051cef0fb7029a8566f',
  }),
  Object.freeze({
    tag: '0055_current_forecast_recompute_commands',
    manifest: 'current-forecast-recompute-commands',
    table: 'current_forecast_recompute_commands',
    constraintCount: 11,
    constraintSha256: '6d2c298c02815147cecff5eec16cb65746127f622bccf7c7ec7a234d07946e71',
    indexCount: 2,
    indexSha256: '7f3137c9007d9d1338f4291903f4825dcc2b28e9106db673546bf4c79205f75a',
  }),
]);

const ALLOWED_NON_SENTINEL_DELTAS = Object.freeze({
  'g3-portfolio-and-calculation': new Set([
    'missing-column:portfoliocompanies.row_version',
    'missing-column:portfoliocompanies.updated_at',
    'missing-column:fund_scenario_calculation_runs.deadline_at',
  ]),
  'g3-canary': new Set([
    'missing-column:users.is_release_canary_principal',
    'missing-column:funds.data_origin',
    'missing-column:funds.canary_run_id',
    'missing-constraint:funds_data_origin_check',
    'missing-constraint:funds_canary_run_id_unique',
    'missing-constraint:funds_canary_origin_coupling_check',
    'missing-constraint:funds_canary_run_id_release_canary_runs_id_fk',
  ]),
  'g3-capital-call-notification-outbox': new Set(),
  'g3-release-gate-hardening': new Set([
    'missing-table:release_canary_runs',
    'missing-column:fund_scenario_calculation_runs.queued_event_recorded_at',
    'missing-column:release_canary_runs.workflow_run_id',
    'missing-column:release_canary_runs.workflow_run_attempt',
    'missing-column:release_canary_runs.grant_residue_count',
    'missing-column:release_canary_runs.calculation_residue_count',
    'missing-column:release_canary_runs.mutation_receipt_residue_count',
    'missing-column:release_canary_runs.scenario_residue_count',
    'missing-column:release_canary_runs.reporting_residue_count',
    'missing-constraint:release_canary_runs_workflow_identity_check',
    'constraint-definition-mismatch:release_canary_runs_residue_count_check',
    'missing-index:release_canary_runs_workflow_identity_unique',
  ]),
  'operating-decisions-spine': new Set([
    'missing-table:decision_evidence_links',
    'missing-column:tasks.idempotency_key',
    'missing-column:tasks.request_hash',
    'missing-index:tasks_fund_idempotency_unique',
  ]),
  'current-forecast-recompute-commands': new Set(),
});

/** @param {{ migrationsDir: string }} options @returns {Promise<HashedJournalEntry[]>} */
export async function loadCurrentForecastMigrationRange({ migrationsDir }) {
  const journalPath = path.join(migrationsDir, 'meta', '_journal.json');
  const journal = JSON.parse(await readFile(journalPath, 'utf8'));
  if (!Array.isArray(journal.entries))
    throw new Error(`Migration journal has no entries array: ${journalPath}`);

  /** @type {HashedJournalEntry[]} */
  const targetEntries = [];
  for (const identity of CURRENT_FORECAST_MIGRATION_IDENTITIES) {
    const { tag } = identity;
    const matches = journal.entries.filter((entry) => entry.tag === tag);
    if (matches.length !== 1)
      throw new Error(`Target migration tag must appear exactly once: ${tag}`);
    const entry = matches[0];
    if (!Number.isFinite(entry.when))
      throw new Error(`Target migration timestamp must be numeric: ${tag}`);
    if (entry.when !== identity.when) {
      throw new Error(`Target migration timestamp identity mismatch: ${tag}`);
    }
    const sqlPath = path.join(migrationsDir, `${tag}.sql`);
    await access(sqlPath);
    const hash = createHash('sha256')
      .update(await readFile(sqlPath))
      .digest('hex');
    targetEntries.push({ ...entry, hash });
  }

  const first = journal.entries.indexOf(
    journal.entries.find((entry) => entry.tag === CURRENT_FORECAST_MIGRATION_TAGS[0])
  );
  const adjacent = journal.entries.slice(first, first + CURRENT_FORECAST_MIGRATION_TAGS.length);
  if (adjacent.some((entry, index) => entry.tag !== CURRENT_FORECAST_MIGRATION_TAGS[index])) {
    throw new Error('Current Forecast migration tags must be adjacent and authorized order');
  }
  if (
    targetEntries.some((entry, index) => index > 0 && entry.when <= targetEntries[index - 1].when)
  ) {
    throw new Error('Current Forecast migration timestamps must strictly increase');
  }
  return targetEntries;
}

/** @param {{ migrationsDir: string }} options @returns {Promise<HashedJournalEntry[]>} */
export async function loadCurrentForecastBaselineLedger({ migrationsDir }) {
  const journalPath = path.join(migrationsDir, 'meta', '_journal.json');
  const journal = JSON.parse(await readFile(journalPath, 'utf8'));
  if (!Array.isArray(journal.entries)) {
    throw new Error(`Migration journal has no entries array: ${journalPath}`);
  }

  const baselineIndexes = journal.entries
    .map((entry, index) => (entry.tag === CURRENT_FORECAST_BASELINE.tag ? index : -1))
    .filter((index) => index >= 0);
  if (baselineIndexes.length !== 1) {
    throw new Error('Current Forecast baseline migration must appear exactly once');
  }
  const entries = journal.entries.slice(0, baselineIndexes[0] + 1);
  /** @type {HashedJournalEntry[]} */
  const canonical = [];
  for (const [index, entry] of entries.entries()) {
    if (
      entry.idx !== index ||
      !Number.isFinite(entry.when) ||
      entry.when <= (entries[index - 1]?.when ?? -1)
    ) {
      throw new Error('Migration journal through 0049 must be exact and contiguous');
    }
    const sqlPath = path.join(migrationsDir, `${entry.tag}.sql`);
    await access(sqlPath);
    canonical.push({
      ...entry,
      hash: createHash('sha256')
        .update(await readFile(sqlPath))
        .digest('hex'),
    });
  }
  const baseline = canonical.at(-1);
  if (
    baseline?.tag !== CURRENT_FORECAST_BASELINE.tag ||
    baseline.when !== CURRENT_FORECAST_BASELINE.when ||
    baseline.hash !== CURRENT_FORECAST_BASELINE.hash
  ) {
    throw new Error('Current Forecast 0049 baseline identity mismatch');
  }
  return canonical;
}

/**
 * @param {{
 *   ledgerRows: Array<{ created_at: string | number, hash: string }>;
 *   baselineEntries: HashedJournalEntry[];
 *   targetEntries: HashedJournalEntry[];
 * }} options
 */
export function classifyCurrentForecastLedgerState({ ledgerRows, baselineEntries, targetEntries }) {
  if (!Array.isArray(baselineEntries) || baselineEntries.length !== 51) {
    throw new Error('Canonical migration ledger through 0049 is required');
  }
  const baseline = baselineEntries.at(-1);
  if (
    !baseline ||
    baseline.tag !== CURRENT_FORECAST_BASELINE.tag ||
    baseline.when !== CURRENT_FORECAST_BASELINE.when ||
    baseline.hash !== CURRENT_FORECAST_BASELINE.hash
  ) {
    throw new Error('Canonical migration ledger does not end at required 0049 baseline');
  }

  const ledger = ledgerRows.map((row) => ({
    created_at: Number(row.created_at),
    hash: String(row.hash ?? ''),
  }));
  if (ledger.some((row) => !Number.isFinite(row.created_at))) {
    throw new Error('Migration ledger contains invalid timestamp');
  }
  const baselineKind =
    ledger[9]?.created_at === baselineEntries[46]?.when ? 'adr074-reconciled' : 'canonical';
  const expectedBaseline =
    baselineKind === 'canonical'
      ? baselineEntries
      : ADR074_BASELINE_TAGS.map((tag, index) => {
          const idx = index < 9 ? index : index + 37;
          const entry = baselineEntries[idx];
          if (entry?.idx !== idx || entry.tag !== tag) {
            throw new Error(`Canonical migration ledger does not match ADR-074 identity ${tag}`);
          }
          return entry;
        });
  const expected = [...expectedBaseline, ...targetEntries];
  if (ledger.length < expectedBaseline.length) {
    throw new Error('Migration ledger is missing canonical history through 0049');
  }

  const seen = new Set();
  for (const [index, row] of ledger.entries()) {
    if (seen.has(row.created_at)) throw new Error('Migration ledger contains duplicate row');
    seen.add(row.created_at);
    const expectedEntry = expected[index];
    if (!expectedEntry) throw new Error('Migration ledger contains unknown post-0055 row');
    if (expectedEntry.when !== row.created_at) {
      throw new Error('Migration ledger contains gap or reorder');
    }
    if (row.hash !== expectedEntry.hash) {
      throw new Error(`Migration ledger hash mismatch ${expectedEntry.tag}`);
    }
  }

  const appliedTargetCount = ledger.length - expectedBaseline.length;
  const lastAppliedTag =
    appliedTargetCount === 0
      ? CURRENT_FORECAST_BASELINE.tag
      : targetEntries[appliedTargetCount - 1].tag;
  if (appliedTargetCount === targetEntries.length) {
    return { baselineKind, state: 'complete', appliedTargetCount, lastAppliedTag };
  }
  return { baselineKind, state: 'ready', appliedTargetCount, lastAppliedTag };
}

function catalogDigest(rows, nameKey) {
  return createHash('sha256')
    .update(
      rows
        .map((row) => `${row[nameKey]}\0${normalizePostgresLiteralTextArrayCasts(row.definition)}`)
        .join('\n')
    )
    .digest('hex');
}

export function assertCurrentForecastRawMigrationSafeCatalog({
  appliedTargetCount,
  audits,
  catalog,
}) {
  if (
    !Number.isInteger(appliedTargetCount) ||
    appliedTargetCount < 0 ||
    appliedTargetCount > CURRENT_FORECAST_MIGRATION_TAGS.length
  ) {
    throw new Error('Invalid applied Current Forecast migration count');
  }
  if (!Array.isArray(audits) || audits.length !== CURRENT_FORECAST_MIGRATION_TAGS.length) {
    throw new Error('Current Forecast catalog audit must cover all six migrations');
  }
  if (!Array.isArray(catalog) || catalog.length !== CURRENT_FORECAST_SENTINELS.length) {
    throw new Error('Current Forecast raw catalog must cover all six sentinel tables');
  }
  for (const [index, audit] of audits.entries()) {
    const sentinel = CURRENT_FORECAST_SENTINELS[index];
    if (audit.manifest !== sentinel.manifest) {
      throw new Error(`Current Forecast catalog audit order mismatch ${audit.manifest}`);
    }
    const allowed = index < appliedTargetCount ? ['SKIP'] : ['SKIP', 'APPLY-MISSING-DDL'];
    if (!allowed.includes(audit.action)) {
      throw new Error(`Unsafe Current Forecast catalog state ${audit.manifest}: ${audit.action}`);
    }
    if (
      !Array.isArray(audit.objects) ||
      audit.objects.some((object) => object.action === 'REFUSE-FOR-HUMAN')
    ) {
      throw new Error(`Unsafe Current Forecast catalog detail ${audit.manifest}`);
    }

    const raw = catalog[index];
    if (raw.table !== sentinel.table || typeof raw.present !== 'boolean') {
      throw new Error(`Current Forecast raw catalog order mismatch ${sentinel.table}`);
    }
    const sentinelObject = audit.objects.find((object) => object.table === sentinel.table);
    if (!raw.present) {
      if (
        index < appliedTargetCount ||
        audit.action !== 'APPLY-MISSING-DDL' ||
        !sentinelObject ||
        sentinelObject.present !== false ||
        sentinelObject.deltas?.length !== 1 ||
        sentinelObject.deltas[0]?.kind !== 'missing-table' ||
        sentinelObject.deltas[0]?.name !== sentinel.table
      ) {
        throw new Error(`Unsafe absent Current Forecast sentinel ${sentinel.table}`);
      }
    } else {
      if (
        audit.action !== 'SKIP' ||
        !sentinelObject ||
        sentinelObject.present !== true ||
        sentinelObject.deltas?.length !== 0
      ) {
        throw new Error(`Unsafe partial Current Forecast sentinel ${sentinel.table}`);
      }
      const definitions = [
        sentinel,
        ...(sentinel.priorDefinitions ? [sentinel.priorDefinitions] : []),
      ];
      const exactDefinition =
        Array.isArray(raw.constraints) &&
        Array.isArray(raw.indexes) &&
        definitions.some(
          (definition) =>
            raw.constraints.length === definition.constraintCount &&
            catalogDigest(raw.constraints, 'name') === definition.constraintSha256 &&
            raw.indexes.length === definition.indexCount &&
            catalogDigest(raw.indexes, 'name') === definition.indexSha256
        );
      if (!exactDefinition) {
        throw new Error(`Unsafe Current Forecast sentinel definition ${sentinel.table}`);
      }
    }

    const allowedDeltas = ALLOWED_NON_SENTINEL_DELTAS[audit.manifest];
    for (const object of audit.objects) {
      if (object.table === sentinel.table) continue;
      for (const delta of object.deltas ?? []) {
        const identity = `${delta.kind}:${delta.name}`;
        if (!allowedDeltas?.has(identity)) {
          throw new Error(
            `Unsafe Current Forecast non-sentinel delta ${audit.manifest}: ${identity}`
          );
        }
      }
    }
  }
}

export async function createCurrentForecastMigrationFolder({ migrationsDir }) {
  const entries = await loadCurrentForecastMigrationRange({ migrationsDir });
  const sourceJournal = JSON.parse(
    await readFile(path.join(migrationsDir, 'meta', '_journal.json'), 'utf8')
  );
  const directory = await mkdtemp(path.join(os.tmpdir(), 'updog-current-forecast-0050-0055-'));
  const cleanup = () => rm(directory, { recursive: true, force: true });
  try {
    await mkdir(path.join(directory, 'meta'));
    await writeFile(
      path.join(directory, 'meta', '_journal.json'),
      `${JSON.stringify(
        {
          version: sourceJournal.version,
          dialect: sourceJournal.dialect,
          entries: entries.map(({ hash, ...entry }) => {
            void hash;
            return entry;
          }),
        },
        null,
        2
      )}\n`
    );
    await Promise.all(
      CURRENT_FORECAST_MIGRATION_TAGS.map((tag) =>
        copyFile(path.join(migrationsDir, `${tag}.sql`), path.join(directory, `${tag}.sql`))
      )
    );
    return { directory, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
