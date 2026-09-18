#!/usr/bin/env node
/* global Buffer, structuredClone, process, setTimeout, console */
/** Fresh HTTP create/calculate evidence; preparation never constitutes measured capacity. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { tsImport } from 'tsx/esm/api';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORACLE_COMMIT = '0eb52b586a7ae3d7030c06d21b4692df7a533062';
const REPRESENTATION = '?representation=capital-plan-v1';
const TABLES = [
  'funds',
  'fundconfigs',
  'users',
  'user_fund_grants',
  'revoked_tokens',
  'fund_scenario_sets',
  'fund_scenario_variants',
  'fund_scenario_calculation_runs',
  'fund_snapshots',
  'fund_scenario_set_events',
];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const json = (value) => JSON.stringify(value);
const bytes = (value) => Buffer.byteLength(json(value));
const hashJson = (value) => sha256(json(value));
const scriptPath = fileURLToPath(import.meta.url);
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${json(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  return json(value);
}
const canonicalHash = (value) => sha256(canonicalJson(value));

function options(argv) {
  const flags = new Set(['--prepare-only', '--measure-replay-separately']);
  const values = new Set([
    '--fixture',
    '--mode',
    '--cold',
    '--warm',
    '--max-ms',
    '--transport-bytes',
    '--evidence-dir',
    '--oracle-dir',
    '--rate-limit-max',
  ]);
  const result = {};
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index];
    assert(!(name in result), `Duplicate option ${name}`);
    if (flags.has(name)) result[name] = true;
    else {
      assert(values.has(name), `Unknown option ${name}`);
      assert(argv[index + 1] && !argv[index + 1].startsWith('--'), `Missing ${name}`);
      result[name] = argv[++index];
    }
  }
  assert(result['--fixture'], '--fixture is required');
  assert.equal(result['--mode'], 'fresh-calculate-and-persist');
  assert.equal(Number(result['--cold']), 3);
  assert.equal(Number(result['--warm']), 20);
  assert.equal(Number(result['--max-ms']), 5000);
  assert.equal(Number(result['--transport-bytes']), 262144);
  assert(result['--measure-replay-separately']);
  if (!result['--prepare-only']) assert(result['--oracle-dir'], 'Frozen --oracle-dir required');
  return result;
}

function writeArtifact(directory, name, value, compressed = false) {
  const raw = Buffer.isBuffer(value) ? value : Buffer.from(json(value));
  const target = path.join(directory, `${name}${compressed ? '.gz' : ''}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, compressed ? gzipSync(raw) : raw);
  return {
    path: target,
    bytes: raw.length,
    sha256: sha256(raw),
    fileSha256: sha256(fs.readFileSync(target)),
  };
}

function manifestTree(directory, relative = '') {
  return fs
    .readdirSync(path.join(directory, relative), { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const name = path.join(relative, entry.name);
      if (entry.isDirectory()) return manifestTree(directory, name);
      if (!entry.isFile()) return [];
      const content = fs.readFileSync(path.join(directory, name));
      return [{ path: name, bytes: content.length, sha256: sha256(content) }];
    });
}

function candidateIdentity() {
  const files = ['server', 'shared', 'migrations']
    .filter((name) => fs.existsSync(path.join(ROOT, name)))
    .flatMap((name) =>
      manifestTree(path.join(ROOT, name)).map((entry) => ({
        ...entry,
        path: `${name}/${entry.path}`,
      }))
    );
  for (const name of [
    'scripts/measure-f115-capital-plan-capacity.mjs',
    'tests/helpers/capital-scenario-http-runtime.ts',
    'tests/helpers/testcontainers-migration.ts',
    'tests/helpers/browser-auth.ts',
    'tests/fixtures/capital-planning/fixtures.ts',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
  ]) {
    const content = fs.readFileSync(path.join(ROOT, name));
    files.push({ path: name, bytes: content.length, sha256: sha256(content) });
  }
  return {
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    files,
    sha256: hashJson(files),
  };
}

function dimensions(fixture, materialized, results) {
  const raw = fixture[0].source.config.raw;
  const inputs = fixture.flatMap((entry) => entry.inputs);
  const allocations = inputs.flatMap((input) => input.allocations);
  const inputStrings = [];
  const visit = (value) => {
    if (typeof value === 'string') inputStrings.push(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  inputs.forEach(visit);
  const distribution = inputs.map((input) => ({
    allocations: input.allocations.length,
    enteredAllocations: input.allocations.filter(
      (allocation) => allocation.plannedCompanyCount !== undefined
    ).length,
    followOnRounds: input.allocations.map((allocation) => allocation.followOnRounds.length),
    expandedRows: input.allocations.reduce(
      (count, allocation) =>
        count +
        allocation.deploymentPeriodYears *
          12 *
          (1 + allocation.followOnRounds.length) *
          (allocation.plannedCompanyCount === undefined ? 1 : 2),
      0
    ),
  }));
  return {
    variants: inputs.length,
    distribution,
    maxAllocations: Math.max(...distribution.map((entry) => entry.allocations)),
    maxFollowOnRounds: Math.max(...allocations.map((entry) => entry.followOnRounds.length)),
    profiles: raw.pipelineProfiles.length,
    stages: raw.pipelineProfiles.map((profile) => profile.stages.length),
    feePieces: raw.economicsAssumptions.feeModel.tiers.length,
    expensePieces: raw.economicsAssumptions.expenseModel.annualExpenses.length,
    fundYears: raw.fundLife,
    maxDeploymentYears: Math.max(...allocations.map((entry) => entry.deploymentPeriodYears)),
    maxRoundLagMonths: Math.max(
      ...allocations.flatMap((entry) =>
        entry.followOnRounds.map((round) => round.monthsAfterPreviousRound)
      )
    ),
    maxPlannedCompanies: Math.max(...allocations.map((entry) => entry.plannedCompanyCount ?? 0)),
    sourceFacts: materialized.sourceBundle.projection.facts.length,
    declarations: Object.keys(fixture[0].unitDeclarations).length,
    stringWitnesses: {
      allocationLabelCharacters: Math.max(
        ...allocations.map((allocation) => allocation.name.length)
      ),
      roundIdCharacters: Math.max(
        ...allocations.flatMap((allocation) =>
          allocation.followOnRounds.map((round) => round.roundId.length)
        )
      ),
      decimalCharacters: Math.max(
        ...inputStrings.filter((value) => /^-?\d+\.\d+$/.test(value)).map((value) => value.length)
      ),
      noteCharacters: Math.max(
        ...inputs.map((input) => input.performanceCase?.ownershipOverrideExplanation?.length ?? 0)
      ),
      requestScenarioNameCharacters: 120,
    },
    expandedRows: distribution.reduce((sum, entry) => sum + entry.expandedRows, 0),
    emittedRows: results.map((result) => result.construction.monthlyDetail.length),
    maxScheduleMonth: Math.max(
      ...results.map((result) =>
        result.construction.monthlyDetail.reduce(
          (month, row) => Math.max(month, row.demandMonth),
          0
        )
      )
    ),
  };
}

async function prepare(fixture, directory, report) {
  const reference = path.join(directory, 'reference');
  fs.mkdirSync(reference, { recursive: true });
  const archive = execFileSync(
    'git',
    ['archive', ORACLE_COMMIT, 'shared', 'tsconfig.json', 'package.json'],
    {
      cwd: ROOT,
      maxBuffer: 32 * 1024 * 1024,
    }
  );
  execFileSync('tar', ['-xf', '-', '-C', reference], { input: archive });
  const modules = path.join(reference, 'node_modules');
  if (!fs.existsSync(modules)) fs.symlinkSync(path.join(ROOT, 'node_modules'), modules, 'dir');
  const load = (name) =>
    tsImport(pathToFileURL(path.join(reference, name)).href, {
      parentURL: import.meta.url,
      tsconfig: path.join(reference, 'tsconfig.json'),
    });
  const materializer = await load('shared/lib/capital-planning/materialize-from-fund-draft.ts');
  const calculator = await load('shared/lib/capital-planning/capital-planning-v1.ts');
  const contracts = await load('shared/contracts/capital-planning-v1.contract.ts');
  const scenarios = await load('shared/contracts/fund-scenario-sets-v1.contract.ts');
  const limit = contracts.CAPITAL_PLANNING_PROVISIONAL_LIMITS;
  assert.equal(fixture.length, limit.maxVariants);
  for (const entry of fixture) {
    assert.deepEqual(entry.source, fixture[0].source, 'All five source copies must be identical');
    assert.deepEqual(entry.unitDeclarations, fixture[0].unitDeclarations);
    assert.equal(entry.inputs.length, 1);
  }
  const inputs = fixture.map((entry) => entry.inputs[0]);
  const materialized = materializer.materializeCapitalSource({ ...fixture[0], inputs });
  report.materialization = writeArtifact(directory, 'materialization.json', materialized);
  assert(materialized.ok, `Frozen materializer refused: ${json(materialized)}`);
  const results = [];
  const overrides = [];
  for (const [index, draft] of inputs.entries()) {
    const input = materialized.resolvedInputs?.[index] ?? draft;
    const benchmarkSnapshots = materialized.benchmarkSnapshotsByInput?.[index];
    const sourceBundle = structuredClone(materialized.sourceBundle);
    const result = calculator.calculateCapitalPlanningV1({
      input,
      sourceBundle,
      ...(benchmarkSnapshots === undefined ? {} : { benchmarkSnapshots }),
    });
    results.push(result);
    overrides.push({
      overrideType: 'capital_plan',
      payload: {
        input,
        sourceBundle,
        sourceBundleHash: sourceBundle.sourceBundleHash,
        ...(benchmarkSnapshots === undefined ? {} : { benchmarkSnapshots }),
      },
    });
  }
  const variantIds = inputs.map(
    (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
  );
  const scenarioSetId = '00000000-0000-4000-8000-000000000099';
  const source = fixture[0].source;
  const create = {
    contractVersion: 'fund-scenario-set-create/3.0.0',
    name: 'Maximum capacity preparation'.padEnd(120, 'x'),
    variants: inputs.map((input, index) => ({
      variantId: variantIds[index],
      name: (index === 0 ? 'Baseline' : `Variant ${index}`).padEnd(120, 'v'),
      override: { overrideType: 'capital_plan', payload: input },
    })),
    baselineVariantId: variantIds[0],
    expectedSourceConfigId: source.config.id,
    expectedSourceConfigVersion: source.config.version,
    expectedSourceBundleHash: materialized.sourceBundle.sourceBundleHash,
    expectedInterpretationVersion: materialized.sourceBundle.interpretationVersion,
    unitDeclarations: fixture[0].unitDeclarations,
  };
  const payload = {
    contractVersion: 'fund-scenario-capital-calculation/1.0.0',
    calculationDomain: 'capital_plan',
    calculationMode: 'sync_capital_plan',
    capitalPreimageVersion: contracts.CAPITAL_PREIMAGE_VERSION,
    methodVersion: contracts.CAPITAL_PLANNING_VERSION,
    interpretationVersion: materialized.sourceBundle.interpretationVersion,
    calculationVersion: '1.0.0',
    inputHash: '0'.repeat(64),
    lineage: {
      hashKind: 'scenario-input-hash-v1',
      modelInputsAsOfDate: null,
      comparisonLineageVersion: null,
    },
    fundId: source.fund.id,
    scenarioSetId,
    baselineVariantId: variantIds[0],
    sourceConfigId: source.config.id,
    sourceConfigVersion: source.config.version,
    sourceBundleHash: materialized.sourceBundle.sourceBundleHash,
    calculatedAt: '2026-09-11T00:00:00.000Z',
    variants: results.map((result, index) => ({
      variantId: variantIds[index],
      scenarioSetId,
      name: create.variants[index].name,
      overrideType: 'capital_plan',
      result,
    })),
  };
  const payloadValidation =
    scenarios.FundScenarioCapitalCalculationPayloadV1Schema.safeParse(payload);
  const observed = dimensions(fixture, materialized, results);
  const checks = [
    ['storedInputBytes', bytes(overrides), limit.maxInputBytes],
    ['snapshotPayloadBytes', bytes(payload), limit.maxSnapshotBytes],
    ['transportBytes', bytes(create), Number(report.options['--transport-bytes'])],
    ['expandedRows', observed.expandedRows, limit.maxExpandedRows],
    ['sourceFacts', observed.sourceFacts, limit.maxSourceFacts],
    ['declarations', observed.declarations, limit.maxDeclarations],
  ].map(([name, actual, maximum]) => ({ name, actual, maximum, passed: actual <= maximum }));
  const oracle = {
    schemaVersion: 'f115-capacity-oracle/1.0.0',
    producedAt: new Date().toISOString(),
    producer: {
      commit: ORACLE_COMMIT,
      sharedSource: manifestTree(path.join(reference, 'shared')),
      node: process.version,
      archiveSha256: sha256(archive),
    },
    fixture: report.fixture,
    dimensions: observed,
    limits: limit,
    checks,
    payloadSchema: payloadValidation.success
      ? { success: true }
      : { success: false, issues: payloadValidation.error.issues },
    byteBreakdown: {
      rawSource: bytes(source.config.raw),
      sourceBundle: bytes(materialized.sourceBundle),
      sourceFields: Object.fromEntries(
        Object.entries(materialized.sourceBundle).map(([key, value]) => [key, bytes(value)])
      ),
      inputs: overrides.map((override) => bytes(override.payload.input)),
      storedEnvelopes: overrides.map(bytes),
      results: results.map(bytes),
    },
    results: writeArtifact(directory, 'oracle-results.json', results),
    fullResultCanonicalSha256: canonicalHash(results),
    savedInputs: writeArtifact(directory, 'oracle-saved-inputs.json', overrides),
    payload: writeArtifact(directory, 'oracle-payload.json', payload),
    request: writeArtifact(directory, 'oracle-create-request.json', create),
    boundaryEvidence: {
      status: 'PENDING',
      note: 'Independent count, string and byte limit-plus-one refusal-before-write evidence requires the coordinated integration suite. Preparation is not that proof.',
    },
    readyForMeasurement: checks.every((check) => check.passed) && payloadValidation.success,
  };
  report.oracle = writeArtifact(directory, 'oracle-manifest.json', oracle);
  report.status = oracle.readyForMeasurement ? 'PREPARED_NOT_MEASURED' : 'PREPARATION_BLOCKED';
  report.checks = checks;
  return oracle;
}

async function databaseState(runtime) {
  const tables = {};
  for (const table of TABLES) {
    // All committed row fields contribute; no large JSONB payload crosses the wire here.
    const result = await runtime.pool.query(
      `SELECT COALESCE(to_jsonb(t)->>'id', to_jsonb(t)->>'jti',
        (to_jsonb(t)->>'user_id') || ':' || (to_jsonb(t)->>'fund_id')) AS id,
        encode(sha256(convert_to(to_jsonb(t)::text, 'UTF8')), 'hex') AS sha256 FROM ${table} t ORDER BY 1, 2`
    );
    tables[table] = result.rows;
  }
  return { tables, sha256: hashJson(tables) };
}

function addedRows(before, after, table) {
  const existing = new Map(before.tables[table].map((row) => [row.id, row.sha256]));
  const retained = new Map(after.tables[table].map((row) => [row.id, row.sha256]));
  assert.equal(existing.size, before.tables[table].length, `${table} duplicate prior IDs`);
  assert.equal(retained.size, after.tables[table].length, `${table} duplicate retained IDs`);
  assert(!existing.has(null) && !retained.has(null), `${table} null row identity`);
  for (const [id, hash] of existing) {
    assert(retained.has(id), `${table} prior row ${id} removed`);
    assert.equal(retained.get(id), hash, `${table} prior row ${id} changed`);
  }
  assert(after.tables[table].length >= before.tables[table].length, `${table} rows removed`);
  return after.tables[table].filter((row) => !existing.has(row.id));
}

async function fullReadback(runtime, scenarioSetId, directory) {
  const tables = {};
  for (const table of [
    'fund_scenario_sets',
    'fund_scenario_variants',
    'fund_scenario_calculation_runs',
    'fund_snapshots',
    'fund_scenario_set_events',
  ]) {
    const key = table === 'fund_scenario_sets' ? 'id' : 'scenario_set_id';
    const result = await runtime.pool.query(
      `SELECT to_jsonb(t)::text AS text, encode(pg_catalog.jsonb_send(to_jsonb(t)), 'hex') AS binary FROM ${table} t WHERE ${key} = $1 ORDER BY to_jsonb(t)->>'id'`,
      [scenarioSetId]
    );
    tables[table] = result.rows;
  }
  const artifact = writeArtifact(directory, 'committed-rows.json', tables, true);
  return { tables, artifact };
}

async function operation(runtime, directory, name, requestPath, requestBytes, headers, validate) {
  writeArtifact(directory, `${name}-request.bin`, requestBytes);
  const startedAt = new Date().toISOString();
  const started = performance.now();
  let response;
  let validation;
  try {
    response = await runtime.request('POST', requestPath, {
      rawBody: requestBytes,
      headers,
      timeoutMs: 120000,
    });
    validation = validate(response);
  } catch (error) {
    const record = {
      name,
      startedAt,
      elapsedMs: performance.now() - started,
      path: requestPath,
      requestBytes: requestBytes.length,
      requestSha256: sha256(requestBytes),
      error: { message: error.message, stack: error.stack },
    };
    if (response) {
      record.status = response.status;
      record.headers = response.headers;
      record.response = writeArtifact(directory, `${name}-response.bin`, response.rawBody, true);
    }
    writeArtifact(directory, `${name}.json`, record);
    error.operationRecord = record;
    throw error;
  }
  const elapsedMs = performance.now() - started;
  const record = {
    name,
    startedAt,
    elapsedMs,
    transportElapsedMs: response.elapsedMs,
    path: requestPath,
    requestBytes: requestBytes.length,
    requestSha256: sha256(requestBytes),
    status: response.status,
    headers: response.headers,
    response: writeArtifact(directory, `${name}-response.bin`, response.rawBody, true),
    validation,
  };
  writeArtifact(directory, `${name}.json`, record);
  if (!validation.passed)
    throw Object.assign(new Error(`${name} returned ${response.status}: ${json(validation)}`), {
      operationRecord: record,
    });
  return { record, response };
}

function successSchema(schema, status) {
  return (response) => {
    const parsed = schema.safeParse(response.body);
    return {
      passed: response.status === status && parsed.success,
      schemaValid: parsed.success,
      issues: parsed.success ? [] : parsed.error.issues,
    };
  };
}

async function sample(
  runtime,
  label,
  output,
  fixture,
  oracleResults,
  oracleSavedInputs,
  schemas,
  helper,
  report
) {
  const directory = path.join(output, label);
  const record = {
    label,
    classification:
      label === 'warmup-excluded'
        ? 'warmup-excluded-from-fresh-threshold'
        : 'fresh-calculate-and-persist',
    startedAt: new Date().toISOString(),
    operations: [],
    passed: false,
  };
  report.samples.push(record);
  const checkpoint = () => writeArtifact(output, 'writers-capacity.json', report);
  const before = await databaseState(runtime);
  record.before = writeArtifact(directory, 'before.json', before);
  const inputs = fixture.map((entry) => entry.inputs[0]);
  const body = helper.makeCapitalCreateBody(runtime, {
    name: `Capacity ${label} ${randomUUID()}`.padEnd(120, 'x'),
    inputs,
    unitDeclarations: fixture[0].unitDeclarations,
  });
  body.variants.forEach((variant) => {
    variant.name = variant.name.padEnd(120, 'v');
  });
  const requestBytes = Buffer.from(json(body));
  assert(requestBytes.length <= Number(report.options['--transport-bytes']));
  const headers = { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() };
  record.createKey = headers['Idempotency-Key'];
  record.financialInputSha256 = hashJson(inputs);
  let setId;
  try {
    const create = await operation(
      runtime,
      directory,
      'create',
      `/api/funds/${runtime.fundId}/scenario-sets${REPRESENTATION}`,
      requestBytes,
      headers,
      successSchema(schemas.FundScenarioCapitalCreateResponseV1Schema, 201)
    );
    record.operations.push(create.record);
    setId = create.response.body.scenarioSetId;
    const afterCreate = await databaseState(runtime);
    record.afterCreate = writeArtifact(directory, 'after-create.json', afterCreate);
    assert.equal(addedRows(before, afterCreate, 'fund_scenario_sets').length, 1);
    assert.equal(addedRows(before, afterCreate, 'fund_scenario_variants').length, 5);
    assert.equal(addedRows(before, afterCreate, 'fund_snapshots').length, 0);
    assert.equal(addedRows(before, afterCreate, 'fund_scenario_calculation_runs').length, 0);
    const calculatePath = `/api/funds/${runtime.fundId}/scenario-sets/${setId}/calculate${REPRESENTATION}`;
    const calculateBytes = Buffer.from('{}');
    const calculate = await operation(
      runtime,
      directory,
      'calculate',
      calculatePath,
      calculateBytes,
      headers,
      successSchema(schemas.FundScenarioCapitalCalculateResponseV1Schema, 200)
    );
    record.operations.push(calculate.record);
    const after = await databaseState(runtime);
    record.after = writeArtifact(directory, 'after.json', after);
    const newRuns = addedRows(before, after, 'fund_scenario_calculation_runs');
    const newSnapshots = addedRows(before, after, 'fund_snapshots');
    assert.equal(newRuns.length, 1);
    assert.equal(newSnapshots.length, 1);
    assert.equal(addedRows(afterCreate, after, 'fund_scenario_sets').length, 0);
    const readback = await fullReadback(runtime, setId, directory);
    record.committedRows = readback.artifact;
    for (const [table, count] of Object.entries({
      fund_scenario_sets: 1,
      fund_scenario_variants: 5,
      fund_scenario_calculation_runs: 1,
      fund_snapshots: 1,
      fund_scenario_set_events: 2,
    }))
      assert.equal(readback.tables[table].length, count, `${table} sample row cardinality`);
    const savedSet = JSON.parse(readback.tables.fund_scenario_sets[0].text);
    const snapshot = JSON.parse(readback.tables.fund_snapshots[0].text);
    const run = JSON.parse(readback.tables.fund_scenario_calculation_runs[0].text);
    const payload = snapshot.payload;
    assert.equal(savedSet.id, setId);
    for (const row of [savedSet, snapshot, run]) {
      assert.equal(row.fund_id, runtime.fundId);
      if (row !== savedSet) assert.equal(row.scenario_set_id, setId);
    }
    for (const row of [savedSet, run]) {
      assert.equal(row.source_config_id, body.expectedSourceConfigId);
      assert.equal(row.source_config_version, body.expectedSourceConfigVersion);
    }
    assert.equal(snapshot.config_id, body.expectedSourceConfigId);
    assert.equal(snapshot.config_version, body.expectedSourceConfigVersion);
    assert.equal(snapshot.type, 'SCENARIOS');
    assert.equal(run.input_hash, snapshot.state_hash);
    assert.equal(snapshot.state_hash, payload.inputHash);
    assert.equal(run.correlation_id, snapshot.correlation_id);
    assert.equal(snapshot.correlation_id, calculate.response.body.correlationId);
    assert.equal(run.job_id, null);
    assert.equal(run.calculation_mode, 'sync_capital_plan');
    assert.equal(run.override_type, 'capital_plan');
    assert.equal(run.hash_kind ?? 'scenario-input-hash-v1', payload.lineage.hashKind);
    assert.equal(run.model_inputs_as_of_date, payload.lineage.modelInputsAsOfDate);
    assert.equal(run.comparison_lineage_version, payload.lineage.comparisonLineageVersion);
    assert.equal(payload.fundId, runtime.fundId);
    assert.equal(payload.scenarioSetId, setId);
    assert.equal(payload.sourceConfigId, body.expectedSourceConfigId);
    assert.equal(payload.sourceConfigVersion, body.expectedSourceConfigVersion);
    assert.equal(payload.sourceBundleHash, body.expectedSourceBundleHash);
    assert.equal(payload.baselineVariantId, body.baselineVariantId);
    assert.equal(snapshot.calc_version, payload.calculationVersion);
    assert.equal(payload.calculationMode, 'sync_capital_plan');
    assert.equal(payload.calculationDomain, 'capital_plan');
    assert.equal(String(snapshot.id), String(calculate.response.body.snapshotId));
    assert.equal(String(run.snapshot_id), String(snapshot.id));
    assert.equal(run.status, 'completed');
    assert.deepEqual(snapshot.payload, calculate.response.body.payload);
    assert.deepEqual(
      snapshot.payload.variants.map((variant) => variant.result),
      oracleResults
    );
    const savedVariants = readback.tables.fund_scenario_variants
      .map((row) => JSON.parse(row.text))
      .sort((a, b) => a.sort_order - b.sort_order);
    assert.equal(savedVariants.length, 5);
    for (const [index, variant] of savedVariants.entries()) {
      assert.equal(variant.id, body.variants[index].variantId);
      assert.equal(variant.name, body.variants[index].name);
      assert.equal(payload.variants[index].variantId, variant.id);
      assert.equal(payload.variants[index].name, variant.name);
      assert.equal(variant.override_type, 'capital_plan');
      assert.deepEqual(variant.override_payload.input, oracleResults[index].input);
      assert.deepEqual(variant.override_payload.sourceBundle, oracleResults[index].sourceBundle);
      assert.equal(
        variant.override_payload.sourceBundleHash,
        oracleResults[index].sourceBundle.sourceBundleHash
      );
    }
    const savedEnvelopes = savedVariants.map((variant) => ({
      overrideType: variant.override_type,
      payload: variant.override_payload,
    }));
    assert.deepEqual(savedEnvelopes, oracleSavedInputs);
    record.storedEnvelopeBytes = bytes(savedEnvelopes);
    assert.equal(record.storedEnvelopeBytes, bytes(oracleSavedInputs));
    assert.equal(record.storedEnvelopeBytes, 2097152);
    record.savedEnvelopeCanonicalSha256 = canonicalHash(savedEnvelopes);
    record.snapshotPayloadBytes = bytes(snapshot.payload);
    record.identities = {
      scenarioSetId: setId,
      runId: run.id,
      snapshotId: snapshot.id,
      inputHash: snapshot.state_hash,
    };
    record.fullResultCanonicalSha256 = canonicalHash(
      snapshot.payload.variants.map((variant) => variant.result)
    );
    record.monthlyRows = snapshot.payload.variants.map(
      (variant) => variant.result.construction.monthlyDetail.length
    );
    record.combinedCreateCalculateMs = create.record.elapsedMs + calculate.record.elapsedMs;
    for (const [name, original, route, sentBytes] of [
      ['create-replay', create, create.record.path, requestBytes],
      ['calculate-replay', calculate, calculatePath, calculateBytes],
    ]) {
      const replay = await operation(
        runtime,
        directory,
        name,
        route,
        sentBytes,
        headers,
        (response) => ({
          passed:
            response.status === original.response.status &&
            response.rawBody.equals(original.response.rawBody),
          exactStatusAndBody:
            response.status === original.response.status &&
            response.rawBody.equals(original.response.rawBody),
        })
      );
      record.operations.push({
        ...replay.record,
        classification: 'replay-excluded-from-fresh-threshold',
      });
      assert.deepEqual(await databaseState(runtime), after, `${name} mutated committed state`);
    }
    record.thresholdPassed = [create, calculate].every(
      (value) => value.record.elapsedMs <= Number(report.options['--max-ms'])
    );
    record.passed =
      record.thresholdPassed || record.classification === 'warmup-excluded-from-fresh-threshold';
    assert(record.passed, 'Fresh operation exceeded per-operation 5000ms threshold');
  } catch (error) {
    if (error.operationRecord) record.operations.push(error.operationRecord);
    record.error = { message: error.message, stack: error.stack };
    record.failedState = writeArtifact(
      directory,
      'failed-state.json',
      await databaseState(runtime)
    );
    throw error;
  } finally {
    if (setId) {
      const beforeArchive = await databaseState(runtime);
      const stableSetSql = `SELECT to_jsonb(t) - ARRAY['archived_at','archived_by_user_id',
        'archived_by_label','updated_by_user_id','updated_by_label','updated_at'] AS row
        FROM fund_scenario_sets t WHERE id=$1`;
      const stableSetBefore = await runtime.pool.query(stableSetSql, [setId]);
      const archived = await runtime.request(
        'POST',
        `/api/funds/${runtime.fundId}/scenario-sets/${setId}/archive${REPRESENTATION}`,
        {
          body: { reason: 'Capacity sample complete; retain all committed rows' },
          headers: { 'Idempotency-Key': randomUUID() },
        }
      );
      record.archive = {
        status: archived.status,
        headers: archived.headers,
        responseSha256: sha256(archived.rawBody),
        outsideTiming: true,
      };
      const afterArchive = await databaseState(runtime);
      try {
        assert.equal(archived.status, 200, json(archived.body));
        for (const table of TABLES) {
          if (table === 'fund_scenario_sets') {
            assert.deepEqual(
              afterArchive.tables[table].map((row) => row.id),
              beforeArchive.tables[table].map((row) => row.id),
              'Archive changed retained scenario set IDs'
            );
            assert.deepEqual(
              afterArchive.tables[table].filter((row) => row.id !== setId),
              beforeArchive.tables[table].filter((row) => row.id !== setId),
              'Archive changed another scenario set'
            );
          } else if (table === 'fund_scenario_set_events') {
            const events = addedRows(beforeArchive, afterArchive, table);
            assert.equal(events.length, 1, 'Archive must add exactly one event');
            const event = await runtime.pool.query(
              'SELECT scenario_set_id, fund_id, event_type FROM fund_scenario_set_events WHERE id=$1',
              [events[0].id]
            );
            assert.deepEqual(event.rows, [
              { scenario_set_id: setId, fund_id: runtime.fundId, event_type: 'archived' },
            ]);
          } else {
            assert.deepEqual(
              afterArchive.tables[table],
              beforeArchive.tables[table],
              `Archive changed ${table}`
            );
          }
        }
        const stableSetAfter = await runtime.pool.query(stableSetSql, [setId]);
        assert.deepEqual(
          stableSetAfter.rows,
          stableSetBefore.rows,
          'Archive changed non-archive scenario fields'
        );
        record.archive.retainedRowsVerified = true;
      } catch (error) {
        record.passed = false;
        record.archive.error = error.message;
      }
      record.afterArchive = writeArtifact(directory, 'after-archive.json', afterArchive);
    }
    checkpoint();
  }
  assert(record.passed, 'Sample cleanup or threshold failed');
  return record;
}

async function measure(fixture, directory, oracleDirectory, report) {
  assert.equal(process.env.TZ, 'UTC', 'TZ=UTC required');
  assert.equal(process.version, 'v22.23.2', 'Pinned Node22.23.2 required');
  assert.equal(execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(), '10.9.2');
  const manifestFile = path.join(oracleDirectory, 'oracle-manifest.json');
  const oracle = JSON.parse(fs.readFileSync(manifestFile));
  assert.equal(oracle.fixture.sha256, report.fixture.sha256);
  assert.equal(oracle.producer.commit, ORACLE_COMMIT);
  assert(oracle.readyForMeasurement, `Maximum fixture is not admitted: ${json(oracle.checks)}`);
  for (const entry of [oracle.results, oracle.savedInputs, oracle.payload, oracle.request])
    assert.equal(sha256(fs.readFileSync(entry.path)), entry.fileSha256);
  const oracleResults = JSON.parse(fs.readFileSync(oracle.results.path));
  const oracleSavedInputs = JSON.parse(fs.readFileSync(oracle.savedInputs.path));
  assert.equal(canonicalHash(oracleResults), oracle.fullResultCanonicalSha256);
  report.oracle = { path: manifestFile, sha256: sha256(fs.readFileSync(manifestFile)) };
  const helper = await tsImport(
    pathToFileURL(path.join(ROOT, 'tests/helpers/capital-scenario-http-runtime.ts')).href,
    import.meta.url
  );
  const schemas = await tsImport(
    pathToFileURL(path.join(ROOT, 'shared/contracts/fund-scenario-sets-v1.contract.ts')).href,
    import.meta.url
  );
  const source = fixture[0].source;
  const runtimeOptions = {
    mode: 'process',
    source: {
      rawConfig: source.config.raw,
      fundSize: String(source.fund.size),
      baseCurrency: source.fund.baseCurrency,
      publishedAt: source.config.publishedAt,
    },
    rateLimitMax: Number(report.options['--rate-limit-max'] ?? 100000),
  };
  report.runtimeOptions = { ...runtimeOptions, source: { fixtureSha256: report.fixture.sha256 } };
  const candidate = candidateIdentity();
  report.candidate = writeArtifact(directory, 'candidate-source-manifest.json', candidate);
  for (const phase of ['cold-1', 'cold-2', 'cold-3', 'warm']) {
    let runtime;
    const record = { phase };
    report.runtimes.push(record);
    try {
      runtime = await helper.startCapitalScenarioHttpRuntime({
        ...runtimeOptions,
        label: `capacity-${phase}`,
        evidenceDir: path.join(directory, phase, 'runtime'),
      });
      assert.deepEqual(
        runtime.source,
        source,
        'Runtime financial source and identity must exactly equal frozen oracle'
      );
      record.identity = runtime.identity;
      assert.equal(runtime.identity.scenarioWriteRateLimit.max, 100);
      assert.equal(runtime.identity.scenarioWriteRateLimit.windowMs, 900000);
      if (phase === 'warm') {
        const warmup = await sample(
          runtime,
          'warmup-excluded',
          directory,
          fixture,
          oracleResults,
          oracleSavedInputs,
          schemas,
          helper,
          report
        );
        warmup.classification = 'warmup-excluded-from-fresh-threshold';
        const waitStarted = Date.now();
        record.rateLimitWait = {
          reason:
            'Preserve100-write/15-minute scenario limiter for20 serial samples at5 writes each',
          startedAt: new Date(waitStarted).toISOString(),
          requestedMs: 900100,
          warmupHeaders: warmup.operations.map((operation) => operation.headers),
        };
        writeArtifact(directory, 'writers-capacity.json', report);
        while (Date.now() - waitStarted < 900100) {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.min(30000, 900100 - (Date.now() - waitStarted)))
          );
          console.log(
            json({
              event: 'rate-limit-reset-wait',
              elapsedMs: Date.now() - waitStarted,
              requiredMs: 900100,
            })
          );
        }
        record.rateLimitWait.actualMs = Date.now() - waitStarted;
        for (let index = 1; index <= 20; index++)
          await sample(
            runtime,
            `warm-${String(index).padStart(2, '0')}`,
            directory,
            fixture,
            oracleResults,
            oracleSavedInputs,
            schemas,
            helper,
            report
          );
      } else
        await sample(
          runtime,
          phase,
          directory,
          fixture,
          oracleResults,
          oracleSavedInputs,
          schemas,
          helper,
          report
        );
    } finally {
      if (runtime) record.lifecycle = await runtime.close();
      writeArtifact(directory, 'writers-capacity.json', report);
    }
    assert(
      record.lifecycle?.api.graceful &&
        !record.lifecycle.api.forced &&
        record.lifecycle.containerStopped &&
        record.lifecycle.errors.length === 0,
      `${phase} did not drain gracefully and stop its owned container`
    );
  }
  const fresh = report.samples.filter(
    (entry) => entry.classification === 'fresh-calculate-and-persist'
  );
  assert.equal(fresh.length, 23);
  assert(fresh.every((entry) => entry.passed));
  assert.equal(
    candidateIdentity().sha256,
    candidate.sha256,
    'Candidate source bytes changed during capacity execution'
  );
  report.status = 'FRESH_CAPACITY_PASSED_BOUNDARY_EVIDENCE_PENDING';
}

const args = options(process.argv.slice(2));
const directory = path.resolve(
  args['--evidence-dir'] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'f115-capacity-'))
);
assert(
  directory !== ROOT && !directory.startsWith(`${ROOT}${path.sep}`),
  'Capacity artifacts must remain outside repository'
);
fs.mkdirSync(directory, { recursive: true });
assert(
  !fs.existsSync(path.join(directory, 'writers-capacity.json')),
  'Use a new evidence directory for every run'
);
const fixturePath = path.resolve(ROOT, args['--fixture']);
const fixtureBytes = fs.readFileSync(fixturePath);
const report = {
  schemaVersion: 'f115-capacity-report/1.0.0',
  startedAt: new Date().toISOString(),
  status: 'RUNNING',
  options: args,
  fixture: { path: fixturePath, bytes: fixtureBytes.length, sha256: sha256(fixtureBytes) },
  runner: { path: scriptPath, sha256: sha256(fs.readFileSync(scriptPath)) },
  environment: {
    node: process.version,
    executable: process.execPath,
    executableSha256: sha256(fs.readFileSync(process.execPath)),
    os: os.type(),
    release: os.release(),
    arch: os.arch(),
    cpus: os.cpus(),
    totalMemoryBytes: os.totalmem(),
    freeMemoryBytes: os.freemem(),
    timezone: process.env.TZ ?? null,
  },
  samples: [],
  runtimes: [],
  failures: [],
};
writeArtifact(directory, 'fixture.json', fixtureBytes);
try {
  const fixture = JSON.parse(fixtureBytes);
  if (args['--prepare-only']) await prepare(fixture, directory, report);
  else await measure(fixture, directory, path.resolve(args['--oracle-dir']), report);
  if (report.status === 'PREPARATION_BLOCKED') process.exitCode = 1;
} catch (error) {
  report.status = 'FAILED';
  report.failures.push({ message: error.message, stack: error.stack, issues: error.issues });
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  report.runnerPeakRssBytes = process.resourceUsage().maxRSS * 1024;
  writeArtifact(directory, 'writers-capacity.json', report);
  console.log(
    json({
      status: report.status,
      evidenceDir: directory,
      checks: report.checks,
      failures: report.failures,
    })
  );
}
