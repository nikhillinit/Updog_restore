import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import path from 'node:path';

import type { Pool } from 'pg';
import { ActualsPublishReceiptV1Schema } from '../../shared/contracts/lp-reporting/actuals-pilot.contract';

interface PublishFile {
  fileName: string;
  payload: string;
}

interface ConnectedActualsFixture {
  request: {
    asOfDate: string;
    ledger: PublishFile;
    valuation: PublishFile | null;
  };
}

interface ConnectedActualsDemoInput {
  pool: Pool;
  fundId: number;
  actorId: number;
  fixture: ConnectedActualsFixture;
  artifactDir: string;
}

interface ApiResult {
  status: number;
  body: Record<string, unknown>;
}

const LOGIN_PASSWORD = 'connected-actuals-demo-password';
const PLAN_KEY = '30000000-0000-4000-8000-000000000001';
const FORECAST_KEY = 'connected-actuals-forecast-1';

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function api(
  page: import('playwright').Page,
  url: string,
  init: { method: string; idempotencyKey: string; body: Record<string, unknown> }
): Promise<ApiResult> {
  return page.evaluate(
    async ({ requestUrl, requestInit }) => {
      const response = await fetch(requestUrl, {
        method: requestInit.method,
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': requestInit.idempotencyKey,
        },
        body: JSON.stringify(requestInit.body),
      });
      return {
        status: response.status,
        body: (await response.json()) as Record<string, unknown>,
      };
    },
    { requestUrl: url, requestInit: init }
  );
}

export async function runConnectedActualsDemo(input: ConnectedActualsDemoInput): Promise<void> {
  const originalEnv = { ...process.env };
  let browser: import('playwright').Browser | undefined;
  let page: import('playwright').Page | undefined;
  const browserErrors: string[] = [];
  let server: Server | undefined;
  let providers:
    Awaited<ReturnType<typeof import('../../server/providers').buildProviders>> | undefined;
  let setReady: ((ready: boolean) => void) | undefined;
  let runtimePool: { end: () => Promise<void> } | undefined;
  let stopRouteServices: (() => Promise<void>) | undefined;
  let cleanupErrors: unknown[] = [];

  try {
    assert.ok(process.env['DATABASE_URL'], 'Connected demo requires suite PostgreSQL DATABASE_URL');
    assert.ok(
      process.env['CONNECTED_DEMO_ARTIFACT_DIR'],
      'Connected demo artifact directory missing'
    );

    Object.assign(process.env, {
      NODE_ENV: 'test',
      _EXPLICIT_NODE_ENV: '1',
      DATABASE_URL: process.env['DATABASE_URL'],
      _EXPLICIT_DATABASE_URL: '1',
      USE_REAL_DB_IN_VITEST: '1',
      ALLOW_MEMORY_STORAGE: '0',
      _EXPLICIT_ALLOW_MEMORY_STORAGE: '1',
      REDIS_URL: 'memory://',
      _EXPLICIT_REDIS_URL: '1',
      ENABLE_QUEUES: '0',
      _EXPLICIT_ENABLE_QUEUES: '1',
      REQUIRE_AUTH: '1',
      ACTUALS_PILOT_FUND_ID: String(input.fundId),
      JWT_SECRET: 'connected-actuals-demo-jwt-secret-at-least-32-characters',
      _EXPLICIT_JWT_SECRET: '1',
      JWT_ALG: 'HS256',
      _EXPLICIT_JWT_ALG: '1',
      JWT_AUDIENCE: 'connected-actuals-demo',
      _EXPLICIT_JWT_AUDIENCE: '1',
      JWT_ISSUER: 'connected-actuals-demo',
      _EXPLICIT_JWT_ISSUER: '1',
      SESSION_SECRET: 'connected-actuals-demo-session-secret-at-least-32-characters',
      RATE_LIMIT_MAX: '1000',
    });
    delete process.env['NEON_DATABASE_URL'];

    const [{ hash }, { chromium }, { loadEnv }, providersModule, serverModule, health, db] =
      await Promise.all([
        import('bcryptjs'),
        import('playwright'),
        import('../../server/config/index.js'),
        import('../../server/providers.js'),
        import('../../server/server.js'),
        import('../../server/health/state.js'),
        import('../../server/db.js'),
      ]);

    assert.ok(db.pool, 'Connected server must use PostgreSQL pool');
    runtimePool = db.pool;
    assert.equal(db.pool.options.connectionString, process.env['DATABASE_URL']);
    await input.pool.query('UPDATE users SET password = $1 WHERE id = $2', [
      await hash(LOGIN_PASSWORD, 10),
      input.actorId,
    ]);

    const config = loadEnv();
    assert.equal(config.ALLOW_MEMORY_STORAGE, false);
    assert.equal(config.REQUIRE_AUTH, true);
    providers = await providersModule.buildProviders(config);
    ({ stopRouteServices } = await import('../../server/routes.js'));
    server = await serverModule.createServer(config, providers);
    setReady = health.setReady;
    setReady(true);
    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject);
      server!.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const origin = `http://127.0.0.1:${address.port}`;

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ baseURL: origin });
    page = await context.newPage();
    page.on('pageerror', (error) => browserErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(message.text());
    });

    assert.equal((await page.goto('/login'))?.status(), 200);
    await page.getByLabel('Username').fill('actuals-pg-admin');
    await page.getByLabel('Password').fill(LOGIN_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL((url) => url.pathname !== '/login');

    await page.goto('/lp-reporting/imports');
    await page.getByRole('heading', { name: 'Publish fixed-template actuals' }).waitFor();
    await page.locator('#actuals-as-of').fill(input.fixture.request.asOfDate);
    await page.locator('#actuals-ledger-file').setInputFiles({
      name: input.fixture.request.ledger.fileName,
      mimeType: 'text/csv',
      buffer: Buffer.from(input.fixture.request.ledger.payload, 'base64'),
    });
    if (input.fixture.request.valuation) {
      await page.locator('#actuals-valuation-file').setInputFiles({
        name: input.fixture.request.valuation.fileName,
        mimeType: 'text/csv',
        buffer: Buffer.from(input.fixture.request.valuation.payload, 'base64'),
      });
    }
    await page.getByRole('button', { name: 'Preview actuals' }).click();
    await page.getByTestId('actuals-preview-summary').waitFor();
    await page
      .locator('#actuals-evidence-note')
      .fill('Connected synthetic browser publication proof.');
    const publicationResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/funds/${input.fundId}/imports/actuals/publish` &&
        response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Publish actuals' }).click();
    const published = await publicationResponse;
    assert.equal(published.status(), 201, await published.text());
    const publication = ActualsPublishReceiptV1Schema.parse(await published.json());

    const receipt = page.getByTestId('actuals-publish-receipt');
    await receipt.waitFor();
    const identityText = await page.getByTestId('actuals-publish-receipt-identity').innerText();
    const snapshotId = Number(identityText.match(/Snapshot (\d+);/)?.[1]);
    assert.ok(Number.isInteger(snapshotId) && snapshotId > 0, identityText);
    assert.equal(snapshotId, publication.facts.snapshotId);
    const metricsReadback = page.getByTestId('actuals-metrics-readback');
    await metricsReadback.getByRole('table').waitFor();
    const metricsText = await metricsReadback.innerText();
    assert.match(
      await metricsReadback
        .getByRole('row')
        .filter({ hasText: /^Paid in/ })
        .innerText(),
      /\$100,000\.00/
    );
    assert.match(
      await metricsReadback
        .getByRole('row')
        .filter({ hasText: /^Portfolio FMV/ })
        .innerText(),
      /\$55,000\.00/
    );
    assert.match(
      await metricsReadback.getByRole('row').filter({ hasText: /^NAV/ }).innerText(),
      /Unavailable.*NAV_UNAVAILABLE/
    );

    await mkdir(input.artifactDir, { recursive: true });
    const screenshotPath = path.join(input.artifactDir, 'connected-actuals-receipt.png');
    await receipt.screenshot({ path: screenshotPath });
    await page.screenshot({
      path: path.join(input.artifactDir, 'connected-actuals-page.png'),
      fullPage: true,
    });

    const plan = await api(page, `/api/funds/${input.fundId}/current-plan-versions`, {
      method: 'POST',
      idempotencyKey: PLAN_KEY,
      body: { asOfDate: input.fixture.request.asOfDate },
    });
    assert.equal(plan.status, 200, JSON.stringify(plan.body));
    const planId = String(plan.body['id']);
    assert.match(planId, /^\d+$/);
    assert.equal(Number(plan.body['sourceFactsSnapshotId']), snapshotId);

    await input.pool.query(
      `INSERT INTO fund_calculation_modes
       (fund_id, calculation_key, configured_mode, kill_switch_active, shadow_started_at, updated_by)
       VALUES ($1, 'current_forecast', 'shadow', false, clock_timestamp(), $2)`,
      [input.fundId, input.actorId]
    );

    const forecast = await api(page, `/api/funds/${input.fundId}/current-forecast/recompute`, {
      method: 'POST',
      idempotencyKey: FORECAST_KEY,
      body: {},
    });
    assert.equal(forecast.status, 201, JSON.stringify(forecast.body));
    assert.equal(forecast.body['status'], 'completed');
    assert.equal(forecast.body['replayed'], false);
    const reconciliationId = Number(forecast.body['shadowReconciliationId']);
    assert.ok(Number.isInteger(reconciliationId) && reconciliationId > 0);

    const replay = await api(page, `/api/funds/${input.fundId}/current-forecast/recompute`, {
      method: 'POST',
      idempotencyKey: FORECAST_KEY,
      body: {},
    });
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.deepEqual(replay.body, {
      status: 'completed',
      shadowReconciliationId: reconciliationId,
      replayed: true,
    });

    const persisted = await input.pool.query<{
      facts_snapshot_id: number;
      plan_facts_snapshot_id: number;
      forecast_count: string;
      command_count: string;
      reconciliation_count: string;
      forecast_payload: Record<string, unknown>;
    }>(
      `SELECT
         facts.id AS facts_snapshot_id,
         plan.source_facts_snapshot_id AS plan_facts_snapshot_id,
         (SELECT count(*)::text FROM fund_snapshots WHERE fund_id = $1 AND type = 'CURRENT_FORECAST_V2') AS forecast_count,
         (SELECT count(*)::text FROM current_forecast_recompute_commands WHERE fund_id = $1 AND idempotency_key = $2) AS command_count,
         (SELECT count(*)::text FROM substrate_shadow_reconciliations WHERE fund_id = $1) AS reconciliation_count,
         forecast.payload AS forecast_payload
       FROM financial_facts_snapshots AS facts
       JOIN current_plan_versions AS plan ON plan.id = $3 AND plan.fund_id = facts.fund_id
       JOIN LATERAL (
         SELECT payload FROM fund_snapshots
         WHERE fund_id = facts.fund_id AND type = 'CURRENT_FORECAST_V2'
         ORDER BY id DESC LIMIT 1
       ) AS forecast ON true
       WHERE facts.fund_id = $1 AND facts.id = $4`,
      [input.fundId, FORECAST_KEY, Number(planId), snapshotId]
    );
    assert.equal(persisted.rows.length, 1);
    const row = persisted.rows[0]!;
    assert.equal(row.facts_snapshot_id, snapshotId);
    assert.equal(row.plan_facts_snapshot_id, snapshotId);
    // Manual shadow recompute persists a base forecast and its independent comparison.
    assert.equal(row.forecast_count, '2');
    assert.equal(row.command_count, '1');
    assert.equal(row.reconciliation_count, '1');
    assert.equal(row.forecast_payload['financialFactsSnapshotId'], String(snapshotId));
    assert.equal(row.forecast_payload['currentPlanVersionId'], planId);
    assert.deepEqual(row.forecast_payload['basisRef'], publication.basisRef);

    await writeFile(
      path.join(input.artifactDir, 'connected-actuals-result.json'),
      `${JSON.stringify(
        {
          fundId: input.fundId,
          factsSnapshotId: snapshotId,
          currentPlanVersionId: planId,
          shadowReconciliationId: reconciliationId,
          forecastSnapshots: Number(row.forecast_count),
          recomputeCommands: Number(row.command_count),
          replayed: replay.body['replayed'],
          basisRef: publication.basisRef,
          metrics: metricsText.replace(/\s+/g, ' ').trim(),
          screenshotPath,
        },
        null,
        2
      )}\n`
    );
    await context.close();
  } catch (error) {
    await mkdir(input.artifactDir, { recursive: true });
    await writeFile(
      path.join(input.artifactDir, 'browser-failure.json'),
      JSON.stringify({ error: String(error), browserErrors, url: page?.url() }, null, 2)
    );
    await page
      ?.screenshot({ path: path.join(input.artifactDir, 'browser-failure.png'), timeout: 5000 })
      .catch(() => undefined);
    throw error;
  } finally {
    setReady?.(false);
    try {
      const cleanup = await Promise.allSettled([
        browser?.close(),
        stopRouteServices?.(),
        server?.listening ? closeServer(server) : undefined,
        providers?.teardown?.(),
      ]);
      cleanup.push(...(await Promise.allSettled([runtimePool?.end()])));
      cleanupErrors = cleanup.flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : []
      );
    } finally {
      for (const key of Object.keys(process.env)) delete process.env[key];
      Object.assign(process.env, originalEnv);
    }
  }
  if (cleanupErrors.length)
    throw new AggregateError(cleanupErrors, 'Connected demo cleanup failed');
}
