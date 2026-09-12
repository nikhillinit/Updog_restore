import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  test as base,
  expect,
  type Locator,
  type Page,
  type Request,
  type Route,
} from '@playwright/test';
import { Pool } from 'pg';
import { z } from 'zod';
import {
  FundScenarioCapitalSourceResponseV1Schema,
  FundScenarioCapitalDetailResponseV1Schema,
} from '../../../shared/contracts/fund-scenario-sets-v1.contract';
import { FundScenarioCapitalComparisonV1Schema } from '../../../shared/contracts/fund-scenario-comparison-v1.contract';

const ConfigSchema = z
  .object({
    schemaVersion: z.literal('f115-capital-e2e-config/1.0.0'),
    runId: z.string().min(1),
    evidenceDir: z.string().min(1),
    baseURL: z.literal('http://127.0.0.1:5173'),
    databaseUrl: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(1),
    userId: z.number().int().positive(),
    fundId: z.number().int().positive(),
    expectedCommit: z.string().regex(/^[a-f0-9]{40}$/),
    secondaryFundId: z.number().int().positive(),
  })
  .strict();

export type CapitalBrowserConfig = z.infer<typeof ConfigSchema>;
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const scenarioURL = (fundId: number, suffix = '') =>
  `/api/funds/${fundId}/scenario-sets${suffix}?representation=capital-plan-v1`;

export interface RawRow {
  id: string;
  row: string;
  rowBinary: string;
}
export interface DatabaseSnapshot {
  tables: Record<string, RawRow[]>;
  payloads: Array<{ table: string; id: string; text: string; binary: string }>;
  sha256: string;
}
export interface XhrResult {
  status: number;
  text: string;
}
export interface RequestIdentity {
  method: string;
  url: string;
  body: string;
  bodyHash: string;
  idempotencyKey: string | null;
  hasAuthorization: boolean;
}

// The serial worker retains the server's global window across fresh browser contexts.
let apiRequestSequence = 0;
let apiBudget:
  | { remaining: number; resetAt: number; observedAt: string; headers: Record<string, string> }
  | undefined;

/** Use actual keyboard events, including Tab traversal, for the keyboard acceptance path. */
export class CapitalKeyboard {
  constructor(readonly page: Page) {}

  async reach(control: Locator) {
    await expect(control).toBeVisible();
    for (let attempt = 0; attempt < 250; attempt++) {
      const direction = await control.evaluate((element) => {
        const active = document.activeElement;
        if (element === active) return null;
        return active && element.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING
          ? 'Shift+Tab'
          : 'Tab';
      });
      if (direction === null) return;
      await this.page.keyboard.press(direction);
    }
    throw new Error('Keyboard could not reach the requested visible control');
  }

  async activate(control: Locator) {
    await this.reach(control);
    await this.page.keyboard.press('Enter');
  }

  async fill(control: Locator, value: string) {
    await this.reach(control);
    await this.page.keyboard.press('ControlOrMeta+A');
    await this.page.keyboard.insertText(value);
    if (!value) await this.page.keyboard.press('Backspace');
    await expect(control).toHaveValue(value);
  }

  async select(control: Locator, value: string) {
    const label = await control.evaluate(
      (element, selected) =>
        Array.from((element as HTMLSelectElement).options).find(
          (option) => option.value === selected
        )?.label ?? null,
      value
    );
    expect(label, `Available labeled select option ${value}`).toBeTruthy();
    await this.reach(control);
    // Native typeahead commits trusted input/change events in headless macOS Chromium.
    if ((await control.inputValue()) !== value) await this.page.keyboard.type(label!);
    await expect(control).toHaveValue(value);
    await this.page.keyboard.press('Tab');
    await expect(control).toHaveValue(value);
  }

  async check(control: Locator, checked = true) {
    await this.reach(control);
    if ((await control.isChecked()) !== checked) await this.page.keyboard.press('Space');
    await expect(control).toBeChecked({ checked });
  }
}

export class CapitalBrowser {
  readonly keyboard: CapitalKeyboard;
  readonly requests: Array<{
    sequence: number;
    method: string;
    path: string;
    observedAt: string;
    authorization: boolean;
    fallback: boolean;
    response?: {
      status: number;
      observedAt: string;
      rateLimitHeaders: Record<string, string>;
      body?: string;
      bodyHash?: string;
      bodyTruncated?: boolean;
      bodyCaptureError?: boolean;
    };
  }> = [];
  readonly responseCaptures: Promise<void>[] = [];
  readonly apiBudgetWaits: Array<{
    demand: number;
    remaining: number;
    resetAt: number;
    observedAt: string;
    headers: Record<string, string>;
    startedAt: string;
    finishedAt: string;
    scheduledWaitMs: number;
    waitMs: number;
  }> = [];
  unrecordedRequests = 0;

  constructor(
    readonly page: Page,
    readonly config: CapitalBrowserConfig,
    readonly pool: Pool,
    readonly extendForBudgetWait: (waitMs: number) => void
  ) {
    this.keyboard = new CapitalKeyboard(page);
    const records = new WeakMap<Request, (typeof this.requests)[number]>();
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin !== config.baseURL || !url.pathname.startsWith('/api/')) return;
      const sequence = ++apiRequestSequence;
      if (apiBudget && Date.now() < apiBudget.resetAt) apiBudget.remaining--;
      if (this.requests.length >= 2500) {
        this.unrecordedRequests++;
        return;
      }
      const headers = request.headers();
      const record = {
        sequence,
        method: request.method(),
        path: url.pathname,
        observedAt: new Date().toISOString(),
        authorization: Boolean(headers['authorization']),
        fallback: Boolean(
          headers['x-user-id'] || headers['x-dev-user'] || headers['x-dev-user-id']
        ),
      };
      this.requests.push(record);
      records.set(request, record);
    });
    page.on('response', (response) => {
      const record = records.get(response.request());
      if (!record) return;
      record.response = {
        status: response.status(),
        observedAt: new Date().toISOString(),
        rateLimitHeaders: Object.fromEntries(
          Object.entries(response.headers()).filter(([name]) =>
            /^(?:x-)?ratelimit-(?:limit|remaining|reset|policy)$|^retry-after$/.test(name)
          )
        ),
      };
      const headers = record.response.rateLimitHeaders;
      const remaining = Number(headers['x-ratelimit-remaining']);
      const resetAt = Number(headers['x-ratelimit-reset']) * 1000;
      if (
        headers['x-ratelimit-limit'] === '60' &&
        Number.isInteger(remaining) &&
        Number.isFinite(resetAt) &&
        resetAt > Date.now()
      ) {
        const afterSubsequentRequests = remaining - (apiRequestSequence - record.sequence);
        if (!apiBudget || resetAt > apiBudget.resetAt) {
          apiBudget = {
            remaining: afterSubsequentRequests,
            resetAt,
            observedAt: record.response.observedAt,
            headers,
          };
        } else if (resetAt === apiBudget.resetAt && afterSubsequentRequests < apiBudget.remaining) {
          apiBudget = {
            remaining: afterSubsequentRequests,
            resetAt,
            observedAt: record.response.observedAt,
            headers,
          };
        }
      }
      if (
        response.status() === 429 &&
        /^\/api\/funds\/\d+\/scenario-sets(?:\/|$)/.test(record.path)
      ) {
        this.responseCaptures.push(
          response.text().then(
            (body) => {
              record.response!.bodyHash = sha256(body);
              record.response!.bodyTruncated = body.length > 8192;
              record.response!.body = [config.password, config.databaseUrl].reduce(
                (redacted, secret) => redacted.replaceAll(secret, '[redacted]'),
                body.slice(0, 8192)
              );
            },
            () => {
              record.response!.bodyCaptureError = true;
            }
          )
        );
      }
    });
  }

  private assertFund(fundId: number) {
    if (![this.config.fundId, this.config.secondaryFundId].includes(fundId)) {
      throw new Error('Database operation outside runner-owned funds');
    }
  }

  async waitForApiBudget(demand: number) {
    if (!Number.isInteger(demand) || demand < 1 || demand > 60)
      throw new Error(`Scripted API action exceeds the observed 60-request window: ${demand}`);
    while (apiBudget && apiBudget.remaining < demand && Date.now() < apiBudget.resetAt + 250) {
      const observed = { ...apiBudget };
      const waitMs = observed.resetAt + 250 - Date.now();
      const startedAt = new Date().toISOString();
      const started = performance.now();
      this.extendForBudgetWait(waitMs);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      const elapsed = performance.now() - started;
      this.extendForBudgetWait(elapsed - waitMs);
      this.apiBudgetWaits.push({
        demand,
        ...observed,
        startedAt,
        finishedAt: new Date().toISOString(),
        scheduledWaitMs: waitMs,
        waitMs: elapsed,
      });
      if (apiBudget?.resetAt === observed.resetAt) apiBudget = undefined;
    }
  }

  async waitForScenarioBudget(
    fundId: number,
    action: 'navigate' | 'mutate',
    willIncludeArchived = false
  ) {
    this.assertFund(fundId);
    const archivedControl = this.page.getByRole('checkbox', {
      name: 'Include archived capital plans',
      exact: true,
    });
    const includeArchived =
      willIncludeArchived ||
      ((await archivedControl.count()) > 0 && (await archivedControl.isChecked()));
    const result = await this.pool.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM fund_scenario_sets WHERE fund_id = $1 AND (archived_at IS NULL OR $2::boolean)',
      [fundId, includeArchived]
    );
    const count = result.rows[0]!.count;
    await this.waitForApiBudget(action === 'navigate' ? 20 + 3 * count : 15 + 3 * (count + 1));
  }

  async reload() {
    const match = new URL(this.page.url()).pathname.match(/^\/fund-model-results\/(\d+)\//);
    await this.waitForScenarioBudget(match ? Number(match[1]) : this.config.fundId, 'navigate');
    await this.page.reload();
  }

  async login() {
    await this.waitForScenarioBudget(this.config.fundId, 'navigate');
    await this.page.goto(`${this.config.baseURL}/login`);
    await this.keyboard.fill(
      this.page.getByLabel('Username', { exact: true }),
      this.config.username
    );
    await this.keyboard.fill(
      this.page.getByLabel('Password', { exact: true }),
      this.config.password
    );
    await this.waitForScenarioBudget(this.config.fundId, 'navigate');
    const login = this.page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/auth/login' &&
        response.request().method() === 'POST'
    );
    await this.keyboard.activate(this.page.getByRole('button', { name: 'Sign in', exact: true }));
    expect((await login).status()).toBe(200);
    await this.page.waitForURL((url) => url.pathname !== '/login');
    await this.reload();
    const session = await this.xhr('/api/auth/session');
    expect(session.status).toBe(200);
    const user = JSON.parse(session.text).user as { id: string; role: string; fundIds: number[] };
    expect(user.id).toBe(String(this.config.userId));
    expect(user.role).toBe('partner');
    expect(user.fundIds).toEqual(
      expect.arrayContaining([this.config.fundId, this.config.secondaryFundId])
    );
    const cookies = await this.page.context().cookies(this.config.baseURL);
    expect(cookies.find((cookie) => cookie.name === 'updog.session')?.httpOnly).toBe(true);
    expect(cookies.some((cookie) => cookie.name === 'updog.csrf' && !cookie.httpOnly)).toBe(true);
    await this.page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write'], { origin: this.config.baseURL });
    await this.workspace();
  }

  async workspace(fundId = this.config.fundId) {
    this.assertFund(fundId);
    await this.waitForScenarioBudget(fundId, 'navigate');
    await this.page.goto(`${this.config.baseURL}/fund-model-results/${fundId}/scenarios`);
    await expect(
      this.page.getByRole('button', { name: 'New capital planning scenario', exact: true })
    ).toBeVisible();
  }

  dialog() {
    return this.page.getByRole('dialog', { name: 'New capital planning scenario' });
  }

  async openDraft(name?: string) {
    await this.waitForApiBudget(4);
    await this.keyboard.activate(
      this.page.getByRole('button', { name: 'New capital planning scenario', exact: true })
    );
    const dialog = this.dialog();
    await expect(dialog).toBeVisible();
    if (name !== undefined) {
      await this.keyboard.activate(
        dialog.getByRole('button', { name: 'New empty draft', exact: true })
      );
      await this.keyboard.fill(dialog.getByLabel('Scenario name', { exact: true }), name);
    }
    const source = dialog.getByRole('region', { name: 'Source and budget', exact: true });
    if (await source.isVisible())
      await expect(source.getByText(/Source \d+, version/)).toBeVisible();
    return dialog;
  }

  async source(fundId = this.config.fundId) {
    const response = await this.xhr(scenarioURL(fundId, '/source-config'));
    expect(response.status).toBe(200);
    return FundScenarioCapitalSourceResponseV1Schema.parse(JSON.parse(response.text));
  }

  async detail(setId: string, fundId = this.config.fundId) {
    const response = await this.xhr(scenarioURL(fundId, `/${setId}`));
    expect(response.status).toBe(200);
    return FundScenarioCapitalDetailResponseV1Schema.parse(JSON.parse(response.text));
  }

  async comparison(setId: string, fundId = this.config.fundId) {
    const response = await this.xhr(scenarioURL(fundId, `/${setId}/comparison`));
    expect(response.status).toBe(200);
    return FundScenarioCapitalComparisonV1Schema.parse(JSON.parse(response.text));
  }

  /** Native XHR avoids the application's fetch wrapper, which adds CSRF automatically. */
  async xhr(
    url: string,
    options: {
      method?: string;
      body?: string;
      csrf?: 'missing' | 'invalid' | 'valid';
      key?: string;
    } = {}
  ): Promise<XhrResult> {
    await this.waitForApiBudget(1);
    return this.page.evaluate(
      ({ requestURL, requestOptions }) =>
        new Promise<{ status: number; text: string }>((resolve, reject) => {
          const request = new XMLHttpRequest();
          request.open(requestOptions.method ?? 'GET', requestURL);
          request.withCredentials = true;
          request.setRequestHeader('Content-Type', 'application/json');
          if (requestOptions.key) request.setRequestHeader('Idempotency-Key', requestOptions.key);
          if (requestOptions.csrf === 'invalid')
            request.setRequestHeader('X-CSRF-Token', 'invalid-synthetic-session-csrf');
          if (requestOptions.csrf === 'valid') {
            const cookie = document.cookie
              .split('; ')
              .find((entry) => entry.startsWith('updog.csrf='));
            if (!cookie) {
              reject(new Error('Session CSRF cookie missing'));
              return;
            }
            request.setRequestHeader(
              'X-CSRF-Token',
              decodeURIComponent(cookie.slice('updog.csrf='.length))
            );
          }
          request.onload = () => resolve({ status: request.status, text: request.responseText });
          request.onerror = () => reject(new Error('Real XHR transport failed'));
          request.send(requestOptions.body ?? null);
        }),
      { requestURL: url, requestOptions: options }
    );
  }

  async snapshot(fundId = this.config.fundId): Promise<DatabaseSnapshot> {
    this.assertFund(fundId);
    const tables: Record<string, RawRow[]> = {};
    const predicates: Record<string, string> = {
      fund_scenario_sets: 't.fund_id = $1',
      fund_scenario_variants:
        't.scenario_set_id IN (SELECT id FROM fund_scenario_sets WHERE fund_id = $1)',
      fund_scenario_calculation_runs: 't.fund_id = $1',
      fund_snapshots: 't.fund_id = $1',
      fund_scenario_set_events: 't.fund_id = $1',
    };
    for (const [table, predicate] of Object.entries(predicates)) {
      const rows = await this.pool.query<RawRow>(
        `SELECT id::text AS id, row_to_json(t)::text AS row, encode(jsonb_send(to_jsonb(t)), 'hex') AS "rowBinary" FROM ${table} t WHERE ${predicate} ORDER BY id`,
        [fundId]
      );
      tables[table] = rows.rows;
    }
    const payloads: DatabaseSnapshot['payloads'] = [];
    for (const [table, column] of [
      ['fund_scenario_variants', 'override_payload'],
      ['fund_snapshots', 'payload'],
    ] as const) {
      const rows = await this.pool.query<{ id: string; text: string; binary: string }>(
        `SELECT id::text AS id, ${column}::text AS text, encode(jsonb_send(${column}), 'hex') AS binary FROM ${table} t WHERE ${predicates[table]} ORDER BY id`,
        [fundId]
      );
      payloads.push(...rows.rows.map((row) => ({ table, ...row })));
    }
    return { tables, payloads, sha256: sha256(JSON.stringify({ tables, payloads })) };
  }

  async publication(
    fundId: number,
    expected: { id: number; version: number },
    mutate: (raw: Record<string, unknown>) => void
  ) {
    this.assertFund(fundId);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM funds WHERE id = $1 FOR UPDATE', [fundId]);
      const current = await client.query<{
        id: number;
        version: number;
        config: Record<string, unknown>;
        bytes: string;
      }>(
        `SELECT id, version, config, encode(jsonb_send(config), 'hex') AS bytes FROM fundconfigs WHERE fund_id = $1 AND is_published = true FOR UPDATE`,
        [fundId]
      );
      expect(current.rows).toHaveLength(1);
      const original = current.rows[0]!;
      expect({ id: original.id, version: original.version }).toEqual(expected);
      const nextRaw = structuredClone(original.config);
      mutate(nextRaw);
      const updated = await client.query(
        'UPDATE fundconfigs SET is_published = false WHERE id = $1 AND version = $2 AND is_published = true',
        [expected.id, expected.version]
      );
      expect(updated.rowCount).toBe(1);
      const inserted = await client.query<{ id: number; version: number; publishedAt: Date }>(
        `INSERT INTO fundconfigs (fund_id, version, config, is_draft, is_published, published_at) VALUES ($1, $2, $3::jsonb, false, true, clock_timestamp()) RETURNING id, version, published_at AS "publishedAt"`,
        [fundId, original.version + 1, JSON.stringify(nextRaw)]
      );
      const retained = await client.query<{ bytes: string }>(
        `SELECT encode(jsonb_send(config), 'hex') AS bytes FROM fundconfigs WHERE id = $1`,
        [original.id]
      );
      expect(retained.rows[0]?.bytes).toBe(original.bytes);
      await client.query('COMMIT');
      return {
        ...inserted.rows[0]!,
        originalId: original.id,
        originalRawHash: sha256(original.bytes),
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  requestIdentity(request: Request): RequestIdentity {
    const body = request.postData() ?? '';
    return {
      method: request.method(),
      url: request.url(),
      body,
      bodyHash: sha256(body),
      idempotencyKey: request.headers()['idempotency-key'] ?? null,
      hasAuthorization: Boolean(request.headers()['authorization']),
    };
  }

  async dropCommittedResponse(
    url: string,
    kind: 'create' | 'calculate',
    fundId = this.config.fundId
  ) {
    let resolve!: (value: Awaited<ReturnType<typeof capture>>) => void;
    let reject!: (reason: unknown) => void;
    const observed = new Promise<Awaited<ReturnType<typeof capture>>>((done, fail) => {
      resolve = done;
      reject = fail;
    });
    const capture = async (route: Route) => {
      const request = this.requestIdentity(route.request());
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      const body = await response.text();
      const parsed = JSON.parse(body) as Record<string, unknown>;
      const database = await this.snapshot(fundId);
      if (kind === 'create') {
        expect(request.idempotencyKey).not.toBeNull();
        const committed = database.tables['fund_scenario_sets']!.map(
          (row) => JSON.parse(row.row) as Record<string, unknown>
        ).filter((row) => row['idempotency_key'] === request.idempotencyKey);
        expect(committed).toHaveLength(1);
        expect(committed[0]?.['id']).toBe(parsed['scenarioSetId']);
        expect(committed[0]?.['idempotency_request_hash']).toMatch(/^[a-f0-9]{64}$/);
        const submitted = JSON.parse(request.body) as { variants: Array<{ variantId: string }> };
        const variants = database.tables['fund_scenario_variants']!.map(
          (row) => JSON.parse(row.row) as { id: string; scenario_set_id: string }
        ).filter((row) => row['scenario_set_id'] === parsed['scenarioSetId']);
        expect(variants.map((variant) => variant.id).sort()).toEqual(
          submitted.variants.map((variant) => variant.variantId).sort()
        );
      } else {
        expect(request.body).toBe('');
        expect(request.idempotencyKey).toBeNull();
        const runs = database.tables['fund_scenario_calculation_runs']!.map(
          (row) => JSON.parse(row.row) as Record<string, unknown>
        ).filter((row) => row['snapshot_id'] === parsed['snapshotId']);
        expect(runs).toHaveLength(1);
        expect(runs[0]?.['status']).toBe('completed');
        expect(runs[0]?.['input_hash']).toMatch(/^[a-f0-9]{64}$/);
        expect(
          database.tables['fund_snapshots']!.some((row) => row.id === String(parsed['snapshotId']))
        ).toBe(true);
        const snapshot = database.payloads.find(
          (row) => row.table === 'fund_snapshots' && row.id === String(parsed['snapshotId'])
        );
        expect(snapshot).toBeDefined();
        expect(JSON.parse(snapshot!.text)).toEqual(parsed['payload']);
      }
      const commitObservedAt = performance.now();
      const responseDroppedAt = performance.now();
      expect(responseDroppedAt).toBeGreaterThan(commitObservedAt);
      await route.abort('failed');
      await this.page.unroute(url, handler);
      return {
        request,
        status: response.status(),
        response: body,
        responseHash: sha256(body),
        database,
        commitObservedAt,
        responseDroppedAt,
      };
    };
    const handler = async (route: Route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      try {
        resolve(await capture(route));
      } catch (error) {
        reject(error);
        await route.abort('failed').catch(() => undefined);
      }
    };
    await this.page.route(url, handler);
    return { observed };
  }

  async receipt(label: string, data: unknown) {
    const serialized = JSON.stringify(data, null, 2);
    for (const secret of [this.config.password, this.config.databaseUrl]) {
      if (serialized.includes(secret))
        throw new Error('Private runner value rejected from evidence');
    }
    const directory = path.join(this.config.evidenceDir, 'browser');
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, `${label}-${randomUUID()}.json`);
    await writeFile(file, `${serialized}\n`, { mode: 0o600 });
    return file;
  }

  assertSessionTransport() {
    expect(this.unrecordedRequests).toBe(0);
    const funds = this.requests.filter((request) => request.path.startsWith('/api/funds/'));
    expect(funds.length).toBeGreaterThan(0);
    expect(funds.every((request) => !request.authorization && !request.fallback)).toBe(true);
  }
}

export const test = base.extend<{ capital: CapitalBrowser }>({
  capital: async ({ page }, provide, testInfo) => {
    const filename = process.env['F115_CAPITAL_E2E_CONFIG'];
    if (!filename || !path.isAbsolute(filename))
      throw new Error('Dedicated runner private config is required');
    const metadata = await stat(filename);
    if ((metadata.mode & 0o777) !== 0o600)
      throw new Error('Runner private config must be mode 0600');
    const templateConfig = ConfigSchema.parse(JSON.parse(await readFile(filename, 'utf8')));
    const config = { ...templateConfig };
    expect(config.fundId).not.toBe(config.secondaryFundId);
    const pool = new Pool({
      connectionString: config.databaseUrl,
      max: 2,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 10_000,
    });
    const capital = new CapitalBrowser(page, config, pool, (waitMs) => {
      testInfo.setTimeout(testInfo.timeout + waitMs);
    });
    const caseSeed: Array<{
      templateFundId: number;
      fundId: number;
      templateSourceConfigId: number;
      sourceConfigId: number;
      templateFundFieldsHash: string;
      fundFieldsHash: string;
      templateSourceRawHash: string;
      sourceRawHash: string;
      templatePublishedAt: string;
      publishedAt: string;
      grant: { user_id: number; fund_id: number };
    }> = [];
    let caseSeedCommitted = false;
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const templateFundId of [templateConfig.fundId, templateConfig.secondaryFundId]) {
          const original = await client.query<{
            sourceConfigId: number;
            fundFieldsBinary: string;
            sourceRawBinary: string;
            publishedAt: string;
          }>(
            `SELECT c.id AS "sourceConfigId",
                    encode(jsonb_send(to_jsonb(f) - 'id'), 'hex') AS "fundFieldsBinary",
                    encode(jsonb_send(c.config), 'hex') AS "sourceRawBinary",
                    c.published_at::text AS "publishedAt"
             FROM funds f JOIN fundconfigs c ON c.fund_id = f.id
             JOIN user_fund_grants g ON g.fund_id = f.id AND g.user_id = $2
             WHERE f.id = $1 AND c.version = 1 AND c.is_published = true AND c.is_draft = false`,
            [templateFundId, config.userId]
          );
          expect(original.rowCount).toBe(1);
          const template = original.rows[0]!;
          const fund = await client.query<{ id: number; fundFieldsBinary: string }>(
            `WITH clone AS MATERIALIZED (
               SELECT to_jsonb(f) || jsonb_build_object(
                 'id', nextval(pg_get_serial_sequence('funds', 'id'))
               ) AS fields FROM funds f WHERE f.id = $1
             )
             INSERT INTO funds SELECT (jsonb_populate_record(NULL::funds, fields)).* FROM clone
             RETURNING id, encode(jsonb_send(to_jsonb(funds) - 'id'), 'hex') AS "fundFieldsBinary"`,
            [templateFundId]
          );
          expect(fund.rowCount).toBe(1);
          expect(fund.rows[0]!.fundFieldsBinary).toBe(template.fundFieldsBinary);
          const source = await client.query<{
            id: number;
            fund_id: number;
            sourceRawBinary: string;
            publishedAt: string;
          }>(
            `WITH clone AS MATERIALIZED (
               SELECT to_jsonb(c) || jsonb_build_object(
                 'id', nextval(pg_get_serial_sequence('fundconfigs', 'id')), 'fund_id', $2::integer
               ) AS fields FROM fundconfigs c WHERE c.id = $1
             )
             INSERT INTO fundconfigs
             SELECT (jsonb_populate_record(NULL::fundconfigs, fields)).* FROM clone
             RETURNING id, fund_id, encode(jsonb_send(config), 'hex') AS "sourceRawBinary",
                       published_at::text AS "publishedAt"`,
            [template.sourceConfigId, fund.rows[0]!.id]
          );
          expect(source.rowCount).toBe(1);
          expect(source.rows[0]!.fund_id).toBe(fund.rows[0]!.id);
          expect(source.rows[0]!.sourceRawBinary).toBe(template.sourceRawBinary);
          expect(source.rows[0]!.publishedAt).toBe(template.publishedAt);
          const grant = await client.query<{ user_id: number; fund_id: number }>(
            'INSERT INTO user_fund_grants(user_id, fund_id) VALUES ($1, $2) RETURNING user_id, fund_id',
            [config.userId, fund.rows[0]!.id]
          );
          expect(grant.rows).toEqual([{ user_id: config.userId, fund_id: fund.rows[0]!.id }]);
          caseSeed.push({
            templateFundId,
            fundId: fund.rows[0]!.id,
            templateSourceConfigId: template.sourceConfigId,
            sourceConfigId: source.rows[0]!.id,
            templateFundFieldsHash: sha256(template.fundFieldsBinary),
            fundFieldsHash: sha256(fund.rows[0]!.fundFieldsBinary),
            templateSourceRawHash: sha256(template.sourceRawBinary),
            sourceRawHash: sha256(source.rows[0]!.sourceRawBinary),
            templatePublishedAt: template.publishedAt,
            publishedAt: source.rows[0]!.publishedAt,
            grant: grant.rows[0]!,
          });
        }
        await client.query('COMMIT');
        caseSeedCommitted = true;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      config.fundId = caseSeed[0]!.fundId;
      config.secondaryFundId = caseSeed[1]!.fundId;
      await capital.login();
      await provide(capital);
      capital.assertSessionTransport();
    } finally {
      try {
        await Promise.all(capital.responseCaptures);
        await capital.receipt('test', {
          title: testInfo.title,
          status: testInfo.status,
          expectedStatus: testInfo.expectedStatus,
          expectedCommit: config.expectedCommit,
          runId: config.runId,
          fundId: config.fundId,
          secondaryFundId: config.secondaryFundId,
          caseSeedCommitted,
          caseSeed,
          requests: capital.requests,
          unrecordedRequests: capital.unrecordedRequests,
          apiBudgetWaits: capital.apiBudgetWaits,
        });
      } finally {
        await pool.end();
      }
    }
  },
});

export { expect };
