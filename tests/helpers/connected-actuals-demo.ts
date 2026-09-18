import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import path from 'node:path';

import { Pool } from 'pg';
import {
  ActualMetricsV2Schema,
  ActualsPreviewResponseV1Schema,
  ActualsPublishReceiptSchema,
  type ActualsPublishRequestV1,
} from '../../shared/contracts/lp-reporting/actuals-pilot.contract';
import {
  ActualsDraftDetailResponseV1Schema,
  ActualsDraftSaveResponseV1Schema,
} from '../../shared/contracts/lp-reporting/actuals-draft.contract';
import {
  ActualsRestatementPreviewResponseV1Schema,
  ActualsRestatementReceiptV1Schema,
  ActualsRestatementTargetsResponseV1Schema,
} from '../../shared/contracts/lp-reporting/actuals-restatement.contract';
import {
  FinancialFactsBasisRefSchema,
  FinancialFactsPayloadV5Schema,
  FinancialFactsPayloadV6Schema,
} from '../../shared/contracts/financial-facts-snapshot-v1.contract';

interface ConnectedActualsDemoInput {
  pool: Pool;
  connectionString: string;
  fundId: number;
  actorId: number;
  fixture: { request: ActualsPublishRequestV1 };
  artifactDir: string;
}

interface ApiResult {
  status: number;
  body: Record<string, unknown>;
}

const LOGIN_PASSWORD = 'connected-actuals-demo-password';
const PLAN_KEY = '30000000-0000-4000-8000-000000000001';
const FORECAST_KEY = 'connected-actuals-forecast-1';

export function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) =>
      error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING'
        ? reject(error)
        : resolve()
    );
  });
}

async function api(
  page: import('playwright').Page,
  url: string,
  init: { method: string; idempotencyKey?: string; ifMatch?: string; body?: unknown } = {
    method: 'GET',
  }
): Promise<ApiResult> {
  return page.evaluate(
    async ({ requestUrl, requestInit }) => {
      const response = await fetch(requestUrl, {
        method: requestInit.method,
        headers: {
          'Content-Type': 'application/json',
          ...(requestInit.idempotencyKey ? { 'Idempotency-Key': requestInit.idempotencyKey } : {}),
          ...(requestInit.ifMatch ? { 'If-Match': requestInit.ifMatch } : {}),
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
  let primaryFailure: [] | [unknown] = [];
  const setNotReady = () => {
    setReady?.(false);
  };

  try {
    assert.equal(process.env['RUN_CONNECTED_ACTUALS_DEMO'], '1');
    assert.equal(process.env['DATABASE_URL'], input.connectionString);
    const databaseUrl = new URL(input.connectionString);
    assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(databaseUrl.hostname));
    assert.equal(input.pool.options.connectionString, input.connectionString);
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
      ACTUALS_PILOT_PUBLISH_ENABLED: 'false',
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

    assert.ok(db.pool instanceof Pool, 'Connected server must use PostgreSQL pool');
    const connectedPool = db.pool as Pool;
    runtimePool = connectedPool;
    assert.equal(connectedPool.options.connectionString, input.connectionString);
    const identitySql = 'SELECT current_database(), inet_server_addr()::text, inet_server_port()';
    assert.deepEqual(
      (await connectedPool.query(identitySql)).rows,
      (await input.pool.query(identitySql)).rows
    );
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
    page.setDefaultTimeout(10_000);

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
    const actualsUrl = `/api/funds/${input.fundId}/imports/actuals`;
    const sourceNote = 'Synthetic internal acceptance portfolio; no real Fund I source data.';
    const originalBytes = Buffer.from(input.fixture.request.ledger.payload, 'base64');
    const incompleteBytes = Buffer.from(
      originalBytes
        .toString()
        .replace('portfolio_investment,2026-03-15', 'portfolio_investment,')
        .replace('Acme Labs,main,initial', 'Acme Labs,unresolved-vehicle,initial')
    );
    const fileInput = (buffer: Buffer) => ({
      name: input.fixture.request.ledger.fileName,
      mimeType: 'text/csv',
      buffer,
    });
    const counts = async () => {
      const result: Record<string, number> = {};
      for (const table of [
        'actuals_draft_revisions',
        'source_artifacts',
        'cash_flow_events',
        'valuation_marks',
        'financial_facts_snapshots',
        'actuals_restatement_commands',
        'actuals_restatement_items',
      ]) {
        const rows = await input.pool.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM ${table} WHERE fund_id = $1`,
          [input.fundId]
        );
        result[table] = Number(rows.rows[0]!.count);
      }
      return result;
    };
    const previewLedger = async (payload: string) => {
      const result = await api(page!, `${actualsUrl}/dry-run`, {
        method: 'POST',
        body: {
          contractVersion: 'actuals-preview-request/1.0.0',
          templateVersion: input.fixture.request.ledger.templateVersion,
          asOfDate: input.fixture.request.asOfDate,
          fileName: input.fixture.request.ledger.fileName,
          payload,
        },
      });
      assert.equal(result.status, 200, JSON.stringify(result.body));
      return ActualsPreviewResponseV1Schema.parse(result.body);
    };
    const previewFile = async (payload: string) => {
      const preview = await previewLedger(payload);
      assert.equal(preview.canPublish, true, JSON.stringify(preview));
      return {
        ...input.fixture.request.ledger,
        payload,
        expectedPayloadSha256: preview.payloadSha256,
        expectedCanonicalRowsHash: preview.canonicalRowsHash,
        expectedPreviewHash: preview.previewHash,
      };
    };

    await page.locator('#actuals-ledger-file').setInputFiles(fileInput(incompleteBytes));
    await page.getByText('Draft versions and corrections', { exact: true }).click();
    await page.getByLabel('Draft data qualification').selectOption('synthetic');
    await page.getByLabel('Draft source note').fill(sourceNote);
    await page
      .getByLabel('Reason for this version')
      .fill('Preserve unresolved vehicle and missing date.');
    const saveDraft = async () => {
      const response = page!.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === `${actualsUrl}/draft-revisions` &&
          r.request().method() === 'POST'
      );
      await page!.getByRole('button', { name: 'Save draft revision', exact: true }).click();
      const saved = await response;
      assert.equal(saved.status(), 201, await saved.text());
      const parsed = ActualsDraftSaveResponseV1Schema.parse(await saved.json());
      await page!
        .getByText(`Saved draft version ${parsed.revision.revision}.`, { exact: true })
        .waitFor();
      return parsed;
    };
    const firstDraft = await saveDraft();
    assert.equal(firstDraft.revision.revision, 1);
    assert.equal(firstDraft.revision.classification, 'synthetic');
    assert.equal(firstDraft.revision.sourceNote, sourceNote);
    assert.equal(
      firstDraft.revision.ledger.payloadSha256,
      createHash('sha256').update(incompleteBytes).digest('hex')
    );
    const draftDetail = await api(page, `${actualsUrl}/draft-revisions/1`);
    assert.equal(draftDetail.status, 200);
    const detail = ActualsDraftDetailResponseV1Schema.parse(draftDetail.body);
    assert.equal(detail.ledger.payload, incompleteBytes.toString('base64'));
    assert.equal(
      detail.revision.ledger.sourceArtifactId,
      firstDraft.revision.ledger.sourceArtifactId
    );
    assert.equal(detail.valuation?.payload, input.fixture.request.valuation?.payload);

    // Create a stale preview, then restore: GET must preserve bytes without appending history.
    await page.locator('#actuals-ledger-file').setInputFiles(fileInput(originalBytes));
    await page.getByRole('button', { name: 'Preview actuals', exact: true }).click();
    await page.getByTestId('actuals-preview-summary').waitFor();
    await page.locator('#actuals-evidence-note').fill('Stale evidence must be cleared by restore.');
    const beforeRestore = await counts();
    await page.getByRole('button', { name: 'Use version 1', exact: true }).click();
    await page
      .getByText('Loaded version 1. Preview again before publishing.', { exact: true })
      .waitFor();
    assert.equal(await page.getByTestId('actuals-preview-summary').count(), 0);
    assert.deepEqual(await counts(), beforeRestore);
    const secondDraft = await saveDraft();
    assert.equal(secondDraft.revision.revision, 2);
    assert.equal(secondDraft.revision.priorRevision, 1);
    assert.equal(secondDraft.revision.priorRevisionHash, firstDraft.revision.revisionHash);
    assert.equal(secondDraft.revision.classification, 'synthetic');
    assert.equal(secondDraft.revision.sourceNote, sourceNote);
    assert.equal(
      secondDraft.revision.ledger.payloadSha256,
      firstDraft.revision.ledger.payloadSha256
    );
    assert.equal((await counts())['actuals_draft_revisions'], 2);

    const missingDate = await previewLedger(incompleteBytes.toString('base64'));
    assert.ok(missingDate.issues.some((issue) => issue.column === 'effective_date'));
    const unresolvedVehicle = await previewLedger(
      Buffer.from(
        incompleteBytes
          .toString()
          .replace('portfolio_investment,,', 'portfolio_investment,2026-03-15,')
      ).toString('base64')
    );
    assert.ok(
      unresolvedVehicle.issues.some(
        (issue) => issue.code === 'VEHICLE_NOT_FOUND' && issue.column === 'vehicle_slug'
      )
    );
    await page.getByRole('button', { name: 'Preview actuals', exact: true }).click();
    await page.getByTestId('actuals-preview-summary').waitFor();
    assert.equal(await page.locator('#actuals-evidence-note').count(), 0);
    await page.locator('#actuals-ledger-file').setInputFiles(fileInput(originalBytes));
    await page.getByRole('button', { name: 'Preview actuals', exact: true }).click();
    await page.getByTestId('actuals-preview-summary').waitFor();
    assert.equal(await page.locator('#actuals-evidence-note').inputValue(), '');
    await page.getByLabel('Inception to date', { exact: true }).check();
    await page
      .locator('#actuals-evidence-note')
      .fill('Synthetic inception-to-cutoff coverage; no real Fund I claim.');

    const absentCommand = {
      method: 'POST',
      idempotencyKey: '40000000-0000-4000-8000-000000000001',
      ifMatch: '"financial-facts:none"',
      body: input.fixture.request,
    };
    const beforeDisabled = await counts();
    for (let attempt = 0; attempt < 2; attempt++) {
      const disabled = await api(page, `${actualsUrl}/publish`, absentCommand);
      assert.equal(disabled.status, 409, JSON.stringify(disabled.body));
      assert.equal(disabled.body['code'], 'ACTUALS_PUBLICATION_DISABLED');
    }
    assert.deepEqual(await counts(), beforeDisabled);
    Object.assign(process.env, { ACTUALS_PILOT_PUBLISH_ENABLED: 'true' });
    const incompleteCoverage = await api(page, `${actualsUrl}/publish`, {
      ...absentCommand,
      body: {
        ...input.fixture.request,
        coverage: { ...input.fixture.request.coverage, ledger: 'incremental_since_prior_head' },
      },
    });
    assert.equal(incompleteCoverage.status, 422, JSON.stringify(incompleteCoverage.body));
    assert.equal(incompleteCoverage.body['code'], 'INCOMPLETE_COVERAGE');
    assert.deepEqual(await counts(), beforeDisabled);
    const publicationResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `${actualsUrl}/publish` &&
        response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Publish actuals', exact: true }).click();
    const published = await publicationResponse;
    assert.equal(published.status(), 201, await published.text());
    const publication = ActualsPublishReceiptSchema.parse(await published.json());
    const appendCommand = {
      method: 'POST',
      idempotencyKey: published.request().headers()['idempotency-key']!,
      ifMatch: published.request().headers()['if-match']!,
      body: published.request().postDataJSON() as unknown,
    };

    const receipt = page.getByTestId('actuals-publish-receipt');
    await receipt.waitFor();
    const identityText = await page.getByTestId('actuals-publish-receipt-identity').innerText();
    let snapshotId = Number(identityText.match(/Snapshot (\d+);/)?.[1]);
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

    await page.setViewportSize({ width: 390, height: 844 });
    await receipt.scrollIntoViewIfNeeded();
    assert.ok(await page.getByTestId('actuals-publish-receipt-identity').isVisible());
    assert.ok(await metricsReadback.isVisible());
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => document.activeElement !== document.body));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({
      path: path.join(input.artifactDir, 'connected-actuals-mobile.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 720 });

    const oracle = async (receiptToCheck: typeof publication, paidIn: string, deployed: string) => {
      const persisted = await input.pool.query<{ payload: unknown }>(
        'SELECT payload FROM financial_facts_snapshots WHERE fund_id = $1 AND id = $2',
        [input.fundId, receiptToCheck.facts.snapshotId]
      );
      const parsed = FinancialFactsPayloadV6Schema.safeParse(persisted.rows[0]!.payload);
      const payload = parsed.success
        ? parsed.data
        : FinancialFactsPayloadV5Schema.parse(persisted.rows[0]!.payload);
      const expectedMoney = {
        paidInCapital: paidIn,
        deployedCapital: deployed,
        managementFeesPaid: '2000.000000',
        realizedFundProceeds: '8000.000000',
        distributionsToPartners: '3000.000000',
        portfolioFmv: '55000.000000',
        followOnDeployedCapital: '10000.000000',
      };
      for (const field of Object.keys(expectedMoney) as Array<keyof typeof expectedMoney>) {
        assert.equal(payload.capitalActuals[field].value, expectedMoney[field], field);
      }
      for (const field of ['nav', 'rvpi', 'tvpi'] as const) {
        assert.equal(payload.capitalActuals[field].availability, 'unavailable');
        assert.equal(payload.capitalActuals[field].value, null);
      }
      const latest = await api(
        page!,
        `/api/funds/${input.fundId}/financial-facts/latest-reference`
      );
      assert.equal(latest.status, 200);
      const head = latest.body['head'] as Record<string, unknown>;
      assert.deepEqual(
        FinancialFactsBasisRefSchema.parse(head['basisRef']),
        receiptToCheck.basisRef
      );
      const metrics = await api(
        page!,
        `/api/funds/${input.fundId}/actuals/metrics?factsSnapshotId=${receiptToCheck.facts.snapshotId}`
      );
      assert.equal(metrics.status, 200);
      assert.equal(metrics.body['financialFactsSnapshotId'], receiptToCheck.basisRef.snapshotId);
      assert.equal(metrics.body['snapshotInputHash'], receiptToCheck.basisRef.snapshotInputHash);
      const actualMetrics = ActualMetricsV2Schema.parse(metrics.body);
      assert.equal(actualMetrics.snapshotStatus, 'resolved');
      assert.equal(actualMetrics.fundId, receiptToCheck.basisRef.fundId);
      assert.equal(actualMetrics.asOfDate, receiptToCheck.basisRef.asOfDate);
      assert.equal(actualMetrics.knowledgeCutoff, receiptToCheck.basisRef.knowledgeCutoff);
      assert.equal(actualMetrics.capital.paidIn.value, paidIn);
      assert.equal(actualMetrics.capital.deployed.value, deployed);
      assert.equal(actualMetrics.expenses.managementFeesPaid.value, '2000.000000');
      assert.equal(actualMetrics.value.portfolioFmv.value, '55000.000000');
      for (const value of [
        actualMetrics.value.nav,
        actualMetrics.performance.rvpi,
        actualMetrics.performance.tvpi,
      ]) {
        assert.equal(value.availability, 'unavailable');
        assert.equal(value.value, null);
      }

      return payload;
    };
    // The isolated lifecycle spans two user sessions' worth of the 20/hour quota.
    // Reset only this disposable process's actor bucket between acceptance phases.
    const { actualsPilotLimiter } = await import('../../server/routes/lp-reporting/imports');
    actualsPilotLimiter.resetKey(`actuals-pilot:${input.actorId}`);
    await oracle(publication, '100000.000000', '50000.000000');
    const originalEvents = (
      await input.pool.query('SELECT * FROM cash_flow_events WHERE fund_id = $1 ORDER BY id', [
        input.fundId,
      ])
    ).rows;
    const targetResponse = await api(
      page,
      `${actualsUrl}/restatements/targets?expectedBasis=${encodeURIComponent(JSON.stringify(publication.basisRef))}&limit=100`
    );
    assert.equal(targetResponse.status, 200, JSON.stringify(targetResponse.body));
    const targets = ActualsRestatementTargetsResponseV1Schema.parse(targetResponse.body);
    assert.deepEqual(targets.basisRef, publication.basisRef);
    const target = targets.targets.find((row) => row.sourceExternalRef === 'pg-investment-1');
    assert.ok(target);
    const replacementRow = originalBytes
      .toString()
      .trimEnd()
      .split('\n')[2]!
      .replace('40000.00', '25000.00')
      .replace('pg-investment-1', 'connected-correction');
    const correctionPayload = Buffer.from(
      `${originalBytes.toString().split('\n')[0]}\n${replacementRow}\n`
    ).toString('base64');
    const replacementPreview = await previewLedger(correctionPayload);
    const correctionRequest = {
      contractVersion: 'actuals-restatement/1.0.0',
      expectedBasis: publication.basisRef,
      expectedETag: publication.facts.etag,
      ledger: await previewFile(correctionPayload),
      valuation: null,
      items: [
        {
          target: target.identity,
          originalPublication: target.originalPublication,
          replacementExternalRef: 'connected-correction',
          expectedReplacementContentHash: replacementPreview.rows[0]!.rowContentHash,
        },
      ],
      reason: 'Synthetic correction: initial investment 40k to 25k; deployed falls by 15k.',
    };
    const correctionPreviewResponse = await api(page, `${actualsUrl}/restatements/dry-run`, {
      method: 'POST',
      body: correctionRequest,
    });
    assert.equal(
      correctionPreviewResponse.status,
      200,
      JSON.stringify(correctionPreviewResponse.body)
    );
    const correctionPreview = ActualsRestatementPreviewResponseV1Schema.parse(
      correctionPreviewResponse.body
    );
    assert.equal(correctionPreview.canPublish, true, JSON.stringify(correctionPreview));
    assert.deepEqual(correctionPreview.basisRef, publication.basisRef);
    const correctionCommand = {
      method: 'POST',
      idempotencyKey: '40000000-0000-4000-8000-000000000002',
      ifMatch: publication.facts.etag,
      body: { ...correctionRequest, expectedPreviewHash: correctionPreview.previewHash },
    };
    const correctedResponse = await api(
      page,
      `${actualsUrl}/restatements/publish`,
      correctionCommand
    );
    assert.equal(correctedResponse.status, 201, JSON.stringify(correctedResponse.body));
    const corrected = ActualsRestatementReceiptV1Schema.parse(correctedResponse.body);
    await oracle(corrected, '100000.000000', '35000.000000');
    const beforeRefusals = await counts();
    assert.equal(beforeRefusals['cash_flow_events'], 7);
    assert.equal(beforeRefusals['financial_facts_snapshots'], 2);
    assert.equal(beforeRefusals['actuals_restatement_commands'], 1);
    assert.equal(beforeRefusals['actuals_restatement_items'], 1);
    const stale = await api(page, `${actualsUrl}/restatements/publish`, {
      ...correctionCommand,
      idempotencyKey: '40000000-0000-4000-8000-000000000003',
    });
    assert.equal(stale.status, 412, JSON.stringify(stale.body));
    assert.equal(stale.body['code'], 'FACTS_HEAD_PRECONDITION_FAILED');
    assert.deepEqual(await counts(), beforeRefusals);
    Object.assign(process.env, { ACTUALS_PILOT_PUBLISH_ENABLED: 'false' });
    for (const [endpoint, command, expectedReceipt] of [
      ['publish', appendCommand, publication],
      ['restatements/publish', correctionCommand, corrected],
    ] as const) {
      const replayed = await api(page, `${actualsUrl}/${endpoint}`, command);
      assert.equal(replayed.status, 200, JSON.stringify(replayed.body));
      assert.deepEqual(ActualsPublishReceiptSchema.parse(replayed.body), expectedReceipt);
      const changedBody =
        endpoint === 'publish'
          ? {
              ...(command.body as ActualsPublishRequestV1),
              coverage: { ...input.fixture.request.coverage, evidenceNote: 'Changed body.' },
            }
          : { ...correctionCommand.body, reason: 'Changed body.' };
      const changed = await api(page, `${actualsUrl}/${endpoint}`, {
        ...command,
        body: changedBody,
      });
      assert.equal(changed.status, 409, JSON.stringify(changed.body));
      assert.equal(changed.body['code'], 'IDEMPOTENCY_KEY_REUSED');
    }
    assert.deepEqual(await counts(), beforeRefusals);
    const absentRetry = await api(page, `${actualsUrl}/publish`, absentCommand);
    assert.equal(absentRetry.status, 409);
    assert.equal(absentRetry.body['code'], 'ACTUALS_PUBLICATION_DISABLED');
    assert.deepEqual(await counts(), beforeRefusals);
    Object.assign(process.env, { ACTUALS_PILOT_PUBLISH_ENABLED: 'true' });
    const nextPayload = Buffer.from(
      `${originalBytes.toString().split('\n')[0]}\nsettled_contribution,2026-03-20,5000.00,USD,,main,,Synthetic append,,,,connected-append\n`
    ).toString('base64');
    const nextAppendCommand = {
      method: 'POST',
      idempotencyKey: '40000000-0000-4000-8000-000000000004',
      ifMatch: corrected.facts.etag,
      body: {
        ...input.fixture.request,
        ledger: await previewFile(nextPayload),
        valuation: null,
        coverage: {
          ledger: 'incremental_since_prior_head',
          priorFactsSnapshotId: corrected.facts.snapshotId,
          evidenceNote: 'Synthetic append adds 5k paid-in; corrected investment remains 25k.',
        },
      },
    };
    const nextAppend = await api(page, `${actualsUrl}/publish`, nextAppendCommand);
    assert.equal(nextAppend.status, 201, JSON.stringify(nextAppend.body));
    const appended = ActualsPublishReceiptSchema.parse(nextAppend.body);
    const finalPayload = FinancialFactsPayloadV6Schema.parse(
      await oracle(appended, '105000.000000', '35000.000000')
    );
    assert.equal(finalPayload.effectiveBasis.corrections.length, 1);
    assert.equal(finalPayload.effectiveBasis.ledgerRecordIds.length, 7);
    assert.ok(!finalPayload.effectiveBasis.ledgerRecordIds.includes(target.identity.recordId));
    assert.deepEqual(
      (
        await input.pool.query(
          'SELECT * FROM cash_flow_events WHERE fund_id = $1 ORDER BY id LIMIT 6',
          [input.fundId]
        )
      ).rows,
      originalEvents
    );
    const finalCounts = await counts();
    assert.equal(finalCounts['cash_flow_events'], 8);
    assert.equal(finalCounts['valuation_marks'], 1);
    assert.equal(finalCounts['financial_facts_snapshots'], 3);
    assert.equal(finalCounts['actuals_restatement_commands'], 1);
    assert.equal(finalCounts['actuals_restatement_items'], 1);
    assert.deepEqual(
      (
        await input.pool.query(
          'SELECT id, supersedes_snapshot_id FROM financial_facts_snapshots WHERE fund_id = $1 ORDER BY id',
          [input.fundId]
        )
      ).rows,
      [
        { id: publication.facts.snapshotId, supersedes_snapshot_id: null },
        { id: corrected.facts.snapshotId, supersedes_snapshot_id: publication.facts.snapshotId },
        { id: appended.facts.snapshotId, supersedes_snapshot_id: corrected.facts.snapshotId },
      ]
    );
    Object.assign(process.env, { ACTUALS_PILOT_PUBLISH_ENABLED: 'false' });
    const appendedReplay = await api(page, `${actualsUrl}/publish`, nextAppendCommand);
    assert.equal(appendedReplay.status, 200, JSON.stringify(appendedReplay.body));
    assert.deepEqual(ActualsPublishReceiptSchema.parse(appendedReplay.body), appended);
    assert.deepEqual(await counts(), finalCounts);
    snapshotId = appended.facts.snapshotId;
    await page.getByText('Correct published actuals', { exact: true }).click();
    await page.getByRole('button', { name: 'Refresh published basis', exact: true }).click();
    const currentConsumers = page.getByRole('region', {
      name: 'Current-head consumer availability',
      exact: true,
    });
    await currentConsumers.getByText(/Current head differs/).waitFor();
    assert.match(
      await currentConsumers.innerText(),
      new RegExp(`Current head snapshot ${snapshotId}`)
    );
    assert.match(
      await page.getByTestId('actuals-publish-receipt-identity').innerText(),
      new RegExp(`Snapshot ${publication.facts.snapshotId};`)
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await currentConsumers.screenshot({
      path: path.join(input.artifactDir, 'connected-current-consumers-mobile.png'),
    });
    await page.setViewportSize({ width: 1280, height: 720 });

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
    assert.deepEqual(
      FinancialFactsBasisRefSchema.parse(row.forecast_payload['basisRef']),
      appended.basisRef
    );

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
          basisRef: appended.basisRef,
          draftRevisions: [firstDraft.revision, secondDraft.revision],
          initialBasis: publication.basisRef,
          correctedBasis: corrected.basisRef,
          persistedCounts: finalCounts,
          scope:
            'Synthetic software acceptance. Manual recompute is not activation or organic soak.',
          rateLimitWindowReset:
            'Only the disposable actor bucket resets between lifecycle phases; this is not continuous sub-hour rate-limit UX proof.',
          initialReceiptMetricsText: metricsText.replace(/\s+/g, ' ').trim(),
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
    primaryFailure = [error];
  } finally {
    try {
      const cleanup = await Promise.allSettled([
        Promise.resolve().then(setNotReady),
        Promise.resolve().then(() => browser?.close()),
        Promise.resolve().then(() => stopRouteServices?.()),
        Promise.resolve().then(() => (server ? closeServer(server) : undefined)),
        Promise.resolve().then(() => providers?.teardown?.()),
      ]);
      cleanup.push(
        ...(await Promise.allSettled([Promise.resolve().then(() => runtimePool?.end())]))
      );
      cleanupErrors = cleanup.flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : []
      );
    } finally {
      for (const key of Object.keys(process.env)) delete process.env[key];
      Object.assign(process.env, originalEnv);
    }
  }
  if (primaryFailure.length && cleanupErrors.length)
    throw new AggregateError(
      [...primaryFailure, ...cleanupErrors],
      'Connected demo failed and cleanup failed'
    );
  if (primaryFailure.length) throw primaryFailure[0];
  if (cleanupErrors.length)
    throw new AggregateError(cleanupErrors, 'Connected demo cleanup failed');
}
