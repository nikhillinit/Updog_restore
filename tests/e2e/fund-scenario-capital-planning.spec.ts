import { randomUUID } from 'node:crypto';
import type { Locator } from '@playwright/test';
import type { TaskResponse } from '../../shared/contracts/operating-objects/task.contract';
import type {
  CapitalPlanningMemoV1,
  AggregatePreferenceInputV1,
} from '../../shared/contracts/capital-planning-v1.contract';
import { CreateFundScenarioSetV3Schema } from '../../shared/contracts/fund-scenario-sets-v1.contract';
import { FundScenarioCapitalComparisonV2Schema } from '../../shared/contracts/fund-scenario-comparison-v1.contract';
import frozen from '../fixtures/capital-planning/workspace-b8.json' with { type: 'json' };
import {
  test,
  expect,
  scenarioURL,
  sha256,
  CapitalBrowser,
  type DatabaseSnapshot,
} from './fixtures/fund-scenario-capital-planning';

// The runner keeps one worker; each fund-scoped case can fail independently.
test.describe.configure({ mode: 'default' });
test.setTimeout(240_000);

test('TASK-LIFECYCLE: real edits replay after response loss, recover conflicts, complete and link evidence', async ({
  capital,
}) => {
  const { page, config, keyboard } = capital;
  const tasksURL = `/api/funds/${config.fundId}/tasks`;
  await page.goto(`${config.baseURL}/fund-model-results/${config.fundId}/operations`);
  await keyboard.fill(page.locator('#new-task-title'), 'Synthetic task lifecycle');
  await keyboard.fill(page.locator('#new-task-owner'), String(config.userId));
  const createdResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === tasksURL && response.request().method() === 'POST'
  );
  await keyboard.activate(page.getByRole('button', { name: 'Create task', exact: true }));
  const created = await createdResponse;
  expect(created.status()).toBe(201);
  const task = (await created.json()) as TaskResponse;
  const taskURL = `${tasksURL}/${task.id}`;
  const row = page.getByTestId(`task-row-${task.id}`);
  const patchResponse = () =>
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === taskURL && response.request().method() === 'PATCH'
    );
  await keyboard.activate(row.getByRole('button', { name: 'Edit task', exact: true }));
  await expect(page.locator(`#task-${task.id}-title`)).toBeFocused();
  await keyboard.fill(page.locator(`#task-${task.id}-title`), 'Edited after response loss');
  await keyboard.fill(page.locator(`#task-${task.id}-description`), 'Preserve this exact command.');
  await keyboard.fill(page.locator(`#task-${task.id}-owner`), '');
  const dueDate = page.locator(`#task-${task.id}-due-date`);
  await keyboard.reach(dueDate);
  await dueDate.fill('2026-09-30');
  await expect(dueDate).toHaveValue('2026-09-30');
  await keyboard.select(page.locator(`#task-${task.id}-status`), 'in_progress');

  let committed: { body: string; requestBody: string; etag: string; key: string } | undefined;
  let captureNextPatch = true;
  const interceptedURL = `**${taskURL}`;
  await page.route(interceptedURL, async (route) => {
    if (route.request().method() !== 'PATCH' || !captureNextPatch) return route.continue();
    captureNextPatch = false;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    committed = {
      body: await response.text(),
      requestBody: route.request().postData()!,
      etag: route.request().headers()['if-match']!,
      key: route.request().headers()['idempotency-key']!,
    };
    await route.abort('failed');
  });
  const lost = page.waitForEvent('requestfailed', {
    predicate: (request) =>
      new URL(request.url()).pathname === taskURL && request.method() === 'PATCH',
  });
  await keyboard.activate(row.getByRole('button', { name: 'Save task', exact: true }));
  await lost;
  await expect(row.getByRole('button', { name: 'Save task', exact: true })).toBeEnabled();
  if (!committed) throw new Error('Task response was not committed before loss.');
  const receiptBeforeRetry = await capital.pool.query(
    'SELECT response_body FROM task_update_commands WHERE fund_id=$1 AND task_id=$2 AND idempotency_key=$3',
    [config.fundId, task.id, committed.key]
  );
  expect(receiptBeforeRetry.rows).toEqual([{ response_body: JSON.parse(committed.body) }]);
  await keyboard.fill(page.locator(`#task-${task.id}-title`), task.title);
  const replayPromise = patchResponse();
  await keyboard.activate(row.getByRole('button', { name: 'Save task', exact: true }));
  const replay = await replayPromise;
  expect(replay.status()).toBe(200);
  expect(await replay.text()).toBe(committed.body);
  expect(replay.request().postData()).toBe(committed.requestBody);
  expect(replay.request().headers()['if-match']).toBe(committed.etag);
  expect(replay.request().headers()['idempotency-key']).toBe(committed.key);
  expect(
    (
      await capital.pool.query(
        'SELECT response_body FROM task_update_commands WHERE fund_id=$1 AND task_id=$2 AND idempotency_key=$3',
        [config.fundId, task.id, committed.key]
      )
    ).rows
  ).toEqual(receiptBeforeRetry.rows);
  await page.unroute(interceptedURL);
  await expect(
    row.getByRole('heading', { name: 'Edited after response loss', exact: true })
  ).toBeVisible();
  await expect(row.getByText('No owner assigned', { exact: true })).toBeVisible();
  await expect(page.locator(`#task-${task.id}-title`)).toHaveValue(task.title);
  await expect(
    row.getByText('Previous save confirmed. Review your remaining edits, then save again.')
  ).toBeVisible();
  const reversionPromise = patchResponse();
  await keyboard.activate(row.getByRole('button', { name: 'Save task', exact: true }));
  const reversion = await reversionPromise;
  expect(reversion.status()).toBe(200);
  expect(JSON.parse(reversion.request().postData()!)).toEqual({ title: task.title });
  expect(reversion.request().headers()['idempotency-key']).not.toBe(committed.key);
  expect(reversion.request().headers()['if-match']).toBe(JSON.parse(committed.body).etag);
  const revertedTask = (await reversion.json()) as TaskResponse;
  expect(revertedTask.title).toBe(task.title);
  await expect(row.getByRole('button', { name: 'Edit task', exact: true })).toBeFocused();

  await keyboard.activate(row.getByRole('button', { name: 'Edit task', exact: true }));
  await keyboard.fill(page.locator(`#task-${task.id}-title`), 'Retained conflict draft');
  await keyboard.fill(page.locator(`#task-${task.id}-owner`), String(config.userId));
  await capital.waitForApiBudget(1);
  const concurrent = await page.evaluate(
    async ({ url, etag, key }) => {
      const csrf = document.cookie.split('; ').find((cookie) => cookie.startsWith('updog.csrf='));
      if (!csrf) throw new Error('Session CSRF cookie missing');
      const response = await fetch(url, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': decodeURIComponent(csrf.slice('updog.csrf='.length)),
          'If-Match': etag,
          'Idempotency-Key': key,
        },
        body: JSON.stringify({ description: 'Concurrent writer retained until explicit retry.' }),
      });
      return { status: response.status, body: await response.json() };
    },
    { url: taskURL, etag: revertedTask.etag, key: randomUUID() }
  );
  expect(concurrent.status).toBe(200);
  const conflictPromise = patchResponse();
  await keyboard.activate(row.getByRole('button', { name: 'Save task', exact: true }));
  const conflict = await conflictPromise;
  expect(conflict.status()).toBe(412);
  await expect(page.locator(`#task-${task.id}-title`)).toHaveValue('Retained conflict draft');
  await expect(row.getByRole('button', { name: 'Save task', exact: true })).toBeDisabled();
  await keyboard.activate(row.getByRole('button', { name: 'Refresh task version', exact: true }));
  await expect(row.getByRole('button', { name: 'Save task', exact: true })).toBeEnabled();
  await expect(page.locator(`#task-${task.id}-title`)).toHaveValue('Retained conflict draft');
  await expect(page.locator(`#task-${task.id}-description`)).toHaveValue(
    concurrent.body.description
  );
  const recoveredPromise = patchResponse();
  await keyboard.activate(row.getByRole('button', { name: 'Save task', exact: true }));
  const recovered = await recoveredPromise;
  expect(recovered.status()).toBe(200);
  expect(JSON.parse(recovered.request().postData()!)).toEqual({
    title: 'Retained conflict draft',
    ownerId: config.userId,
  });
  expect((await recovered.json()).description).toBe(concurrent.body.description);
  expect(recovered.request().headers()['if-match']).toBe(concurrent.body.etag);
  expect(recovered.request().headers()['idempotency-key']).not.toBe(
    conflict.request().headers()['idempotency-key']
  );
  await expect(row.getByText(`Owner: User #${config.userId}`, { exact: true })).toBeVisible();
  const completedPromise = patchResponse();
  await keyboard.activate(row.getByRole('button', { name: 'Complete task', exact: true }));
  const completed = await completedPromise;
  expect(completed.status()).toBe(200);
  expect((await completed.json()).status).toBe('done');
  expect((await completed.json()).description).toBe(concurrent.body.description);

  // Synthetic target rows exercise linking only; they do not certify an analysis projection.
  const targetKey = randomUUID();
  const target = await capital.pool.query<{ id: number }>(
    `WITH facts AS (
      INSERT INTO financial_facts_snapshots (
        fund_id, policy_version, payload_schema_id, as_of_date, knowledge_cutoff,
        vehicle_scope, vehicle_ids, selection_set_hash, source_facts_input_hash,
        snapshot_input_hash, payload, consumer_evaluations, idempotency_key, request_hash
      ) VALUES ($1, 'financial-facts-policy/1.2.0', 'financial-facts-payload/3', '2026-06-30', NOW(),
        'fund_all', '[]'::jsonb, $4::text, $4::text, $4::text, '{}'::jsonb, '[]'::jsonb,
        $3::text, $4::text) RETURNING id
    ) INSERT INTO internal_analysis_references (
      fund_id, period_kind, period_start, period_end, knowledge_cutoff,
      financial_facts_snapshot_id, created_by, idempotency_key, request_hash
    ) SELECT $1, 'quarterly', '2026-04-01', '2026-06-30', NOW(), id, $2, $3::text, $4::text FROM facts RETURNING id`,
    [config.fundId, config.userId, targetKey, sha256(targetKey)]
  );
  const targetId = target.rows[0]!.id;
  await keyboard.activate(page.getByTestId(`task-evidence-toggle-${task.id}`));
  await keyboard.fill(page.locator(`#task-${task.id}-evidence-id`), String(targetId));
  const linkedPromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `${taskURL}/evidence-links` &&
      response.request().method() === 'POST'
  );
  await keyboard.activate(row.getByRole('button', { name: 'Link evidence', exact: true }));
  const linked = await linkedPromise;
  expect(linked.status()).toBe(201);
  expect((await linked.json()).target).toEqual({ kind: 'analysis_reference', id: targetId });
  await capital.reload();
  await expect(
    row.getByRole('heading', { name: 'Retained conflict draft', exact: true })
  ).toBeVisible();
  await expect(row.getByRole('button', { name: 'Complete task', exact: true })).toHaveCount(0);
  await expect(row.getByText(concurrent.body.description, { exact: true })).toBeVisible();
  await keyboard.activate(page.getByTestId(`task-evidence-toggle-${task.id}`));
  await expect(row.getByText(`Analysis reference #${targetId}`, { exact: true })).toBeVisible();
  await capital.receipt('task-lifecycle', {
    taskId: task.id,
    originalCommand: committed,
    revertedTask,
    replayedResponse: await replay.text(),
    conflictStatus: conflict.status(),
    finalTask: await completed.json(),
    evidenceTarget: {
      kind: 'analysis_reference',
      id: targetId,
      origin: 'SYNTHETIC_DATABASE_FIXTURE',
    },
  });
});

test('CORRECTED-V2: explicit assumptions, history ownership, saved comparison and replay', async ({
  capital,
  browser,
}) => {
  await capital.workspace();
  const source = await capital.source();
  await capital.publication(
    capital.config.fundId,
    {
      id: source.projection.sourceConfigId,
      version: source.projection.sourceConfigVersion,
    },
    (raw) => {
      const profiles = raw['pipelineProfiles'] as { stages: Record<string, unknown>[] }[];
      profiles[0]!.stages.push({
        ...profiles[0]!.stages[0],
        id: 's1',
        name: 'Series A',
        monthsToGraduate: 12,
      });
    }
  );
  await capital.reload();
  await expect(
    capital.page.getByRole('button', { name: 'New capital planning scenario', exact: true })
  ).toBeVisible({ timeout: 60_000 });
  const dialog = await capital.openDraft('Corrected history plan');
  await capital.receipt(
    'corrected-dialog-label',
    await capital.page.locator('[role="dialog"]').evaluateAll((nodes) =>
      nodes.map((node) => ({
        label: node.getAttribute('aria-label'),
        labelledBy: node.getAttribute('aria-labelledby'),
        heading: node.querySelector('h2')?.outerHTML,
        labelTarget: document.getElementById(node.getAttribute('aria-labelledby') ?? '')?.outerHTML,
      }))
    )
  );
  await capital.keyboard.select(
    dialog.getByRole('combobox', { name: 'Calculation method', exact: true }),
    'corrected'
  );
  await expect(dialog.getByLabel('Solve mode', { exact: true })).toHaveValue('');
  await capital.keyboard.select(dialog.getByLabel('Solve mode', { exact: true }), 'fixed_fund');
  await declarations(capital, capital.config.fundId);
  await step(capital, 'Allocations');
  for (const [label, value] of [
    ['Source allocation', 'a1'],
    ['Pipeline profile', 'p1'],
    ['Entry stage', 's0'],
    ['Schedule anchor', 'entry_deployment_month'],
    ['Initial deployment cadence', 'uniform_monthly_over_deployment_period'],
  ] as const)
    await capital.keyboard.select(dialog.getByLabel(label, { exact: true }), value);
  for (const [label, value] of [
    ['Allocation name', 'Seed'],
    ['Entry round', 'Seed'],
    ['Initial investment dollar weight (ratio)', '1'],
    ['Initial check (USD)', '1'],
    ['Deployment period (years)', '1'],
  ] as const)
    await capital.keyboard.fill(dialog.getByLabel(label, { exact: true }), value);
  async function financing(pre: string, primary: string) {
    await capital.keyboard.fill(dialog.getByLabel('Valuation (USD)', { exact: true }), pre);
    await capital.keyboard.select(
      dialog.getByLabel('Valuation basis', { exact: true }),
      'pre_money'
    );
    await capital.keyboard.select(
      dialog.getByLabel('Primary capital denominator', { exact: true }),
      'total_primary_including_fund_check'
    );
    await capital.keyboard.fill(
      dialog.getByLabel('Total primary capital (USD)', { exact: true }),
      primary
    );
    await capital.keyboard.check(
      dialog.getByLabel('Primary capital only; excludes all secondary sales', { exact: true })
    );
  }
  await financing('9', '1');
  await step(capital, 'Follow-ons');
  await capital.keyboard.activate(
    dialog.getByRole('button', { name: 'Add follow-on round', exact: true })
  );
  for (const [label, value] of [
    ['Stage', 's1'],
    ['Follow-on eligibility', 'all'],
    ['Participation policy', 'homogeneous_conditional_probability'],
    ['Check policy', 'pro_rata'],
    ['Timing basis', 'interval_from_previous_round'],
    ['Pool basis', 'incremental_pre_money'],
  ] as const)
    await capital.keyboard.select(dialog.getByLabel(label, { exact: true }), value);
  for (const [label, value] of [
    ['Round label', 'Series A'],
    ['Graduation (ratio)', '0.5'],
    ['Conditional participation probability (ratio)', '0.5'],
    ['Pro-rata exercise (ratio)', '1'],
    ['Months after previous round', '12'],
    ['Incremental pool dilution (ratio)', '0'],
  ] as const)
    await capital.keyboard.fill(dialog.getByLabel(label, { exact: true }), value);
  await financing('20', '2');
  await step(capital, 'Assumption evidence');
  await capital.keyboard.activate(
    dialog.getByRole('button', { name: 'Add assumption evidence', exact: true })
  );
  const managerEvidence = dialog.getByRole('group', { name: 'Assumption evidence 1', exact: true });
  await capital.keyboard.fill(
    managerEvidence.getByLabel('Assumption input path', { exact: true }),
    'allocations[0].initialPoolShareRatio'
  );
  await capital.keyboard.select(
    managerEvidence.getByLabel('Evidence origin', { exact: true }),
    'manager_assumption'
  );
  await capital.keyboard.fill(
    managerEvidence.getByLabel('Source document (optional)', { exact: true }),
    'Synthetic manager policy'
  );
  await managerEvidence.getByLabel('Source date (optional)', { exact: true }).fill('2026-09-12');
  await capital.keyboard.activate(
    dialog.getByRole('button', { name: 'Add assumption evidence', exact: true })
  );
  const marketEvidence = dialog.getByRole('group', { name: 'Assumption evidence 2', exact: true });
  await capital.keyboard.fill(
    marketEvidence.getByLabel('Assumption input path', { exact: true }),
    'allocations[0].initialCheckUsd'
  );
  await capital.keyboard.select(
    marketEvidence.getByLabel('Evidence origin', { exact: true }),
    'market_observation'
  );
  for (const [label, value] of [
    ['publisher', 'Synthetic browser observation'],
    ['geography', 'US'],
    ['population', 'Synthetic seed cohort'],
    ['statistic Type', 'median'],
    ['measurement Basis', 'initial primary check'],
  ] as const)
    await capital.keyboard.fill(marketEvidence.getByLabel(label, { exact: true }), value);
  await marketEvidence.getByLabel('publication Date', { exact: true }).fill('2026-09-12');
  await marketEvidence.getByLabel('observation Cutoff', { exact: true }).fill('2026-06-30');
  await step(capital, 'Follow-ons');
  await capital.keyboard.activate(dialog.getByRole('button', { name: 'Add variant', exact: true }));
  await capital.keyboard.fill(
    dialog.getByLabel('Variant name', { exact: true }),
    'External primary target'
  );
  await capital.keyboard.select(
    dialog.getByLabel('Primary capital denominator', { exact: true }),
    'external_primary_excluding_fund_check'
  );
  await capital.keyboard.fill(
    dialog.getByLabel('External primary capital (USD)', { exact: true }),
    '2'
  );
  await capital.keyboard.check(
    dialog.getByLabel('Primary capital only; excludes all secondary sales', { exact: true })
  );
  await declarations(capital, capital.config.fundId);
  await capital.keyboard.select(
    dialog.getByLabel('Solve mode', { exact: true }),
    'fixed_portfolio'
  );
  await capital.keyboard.fill(
    dialog.getByLabel('Total expected company count', { exact: true }),
    '50'
  );
  await step(capital, 'Review');
  await capital.keyboard.activate(
    dialog.getByRole('button', { name: 'Review capital plan', exact: true })
  );
  const saveButton = dialog.getByRole('button', { name: 'Save capital scenario', exact: true });
  await expect(saveButton).toBeEnabled();
  await expect(dialog.getByText('capital-planning/2.0.0', { exact: true }).first()).toBeVisible();
  await capital.waitForScenarioBudget(capital.config.fundId, 'mutate');
  const savedResponse = capital.page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      new URL(r.url()).pathname === `/api/funds/${capital.config.fundId}/scenario-sets`
  );
  await capital.keyboard.activate(saveButton);
  const saved = await savedResponse;
  expect(saved.status()).toBe(201);
  const { scenarioSetId } = (await saved.json()) as { scenarioSetId: string };
  const card = capital.page.locator(`article[data-scenario-id="${scenarioSetId}"]`);
  await expect(card).toHaveAttribute('data-representation', 'capital-plan-v2');
  await expect(card).toBeVisible();
  await capital.waitForScenarioBudget(capital.config.fundId, 'mutate');
  const calculatedResponse = capital.page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      new URL(r.url()).pathname.endsWith(`/${scenarioSetId}/calculate`)
  );
  await capital.keyboard.activate(
    card.getByRole('button', { name: 'Calculate capital scenario', exact: true })
  );
  const calculated = await calculatedResponse;
  expect(calculated.status()).toBe(200);
  const calculationBytes = await calculated.text();
  const comparisonResponse = await capital.xhr(
    scenarioURL(capital.config.fundId, `/${scenarioSetId}/comparison`).replace(
      'capital-plan-v1',
      'capital-plan-v2'
    )
  );
  expect(comparisonResponse.status).toBe(200);
  const comparison = FundScenarioCapitalComparisonV2Schema.parse(
    JSON.parse(comparisonResponse.text)
  );
  const result = comparison.baseline!.result;
  const externalResult = comparison.variants[0]!.memo.result;
  expect(externalResult.construction.solution).toMatchObject({
    mode: 'fixed_portfolio',
    totalExpectedCompanyCount: '50.000000000000',
  });
  expect(externalResult.construction.budgetBridge.committedCapitalUsd).toBe(
    result.construction.budgetBridge.committedCapitalUsd
  );
  expect(externalResult.construction.allocations[0]!.rounds[0]!.paths).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        outcome: 'participated',
        ownershipRatio: '0.100000000000',
        checkUsd: '0.222222',
      }),
      expect.objectContaining({
        outcome: 'eligible_zero_election',
        ownershipRatio: '0.090909090909',
        checkUsd: '0.000000',
      }),
    ])
  );
  expect(result.construction.allocations[0]!.rounds[0]!.paths).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        outcome: 'participated',
        ownershipRatio: '0.100000000000',
        checkUsd: '0.200000',
      }),
      expect.objectContaining({
        outcome: 'eligible_zero_election',
        ownershipRatio: '0.090909090909',
        checkUsd: '0.000000',
      }),
      expect.objectContaining({
        outcome: 'non_graduation',
        state: 'stopped',
        ownershipRatio: '0.100000000000',
      }),
    ])
  );
  await expect(card.getByText(result.roundingPolicy, { exact: true }).first()).toBeVisible();
  await capital.keyboard.activate(
    card.getByText('Assumptions and provenance', { exact: true }).first()
  );
  for (const text of [
    'manager_assumption',
    'market_observation',
    'Synthetic manager policy',
    'Synthetic browser observation',
    '2026-06-30',
    'Synthetic seed cohort',
    'median',
    'initial primary check',
  ])
    await expect(card.getByText(text, { exact: true }).first()).toBeVisible();
  expect(result.input.assumptionEvidence).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        origin: 'manager_assumption',
        sourceDocument: 'Synthetic manager policy',
        sourceDate: '2026-09-12',
      }),
      expect.objectContaining({
        origin: 'market_observation',
        geography: 'US',
        publicationDate: '2026-09-12',
        observationCutoff: '2026-06-30',
        statisticType: 'median',
        measurementBasis: 'initial primary check',
      }),
    ])
  );

  await capital.keyboard.activate(
    card.getByRole('button', { name: 'Copy capital memo: Baseline', exact: true })
  );
  await expect
    .poll(() => capital.page.evaluate(() => navigator.clipboard.readText()))
    .toContain(result.roundingPolicy);
  const copied = await capital.page.evaluate(() => navigator.clipboard.readText());
  for (const text of [
    'manager_assumption',
    'market_observation',
    'Synthetic browser observation',
    '2026-06-30',
    'initial primary check',
  ])
    expect(copied).toContain(text);
  const before = await capital.snapshot();
  const replay = await capital.xhr(
    scenarioURL(capital.config.fundId, `/${scenarioSetId}/calculate`).replace(
      'capital-plan-v1',
      'capital-plan-v2'
    ),
    { method: 'POST', csrf: 'valid' }
  );
  expect(replay.status).toBe(200);
  expect(replay.text).toBe(calculationBytes);
  expect((await capital.snapshot()).sha256).toBe(before.sha256);
  await capital.page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      capital.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    )
    .toBe(true);
  await capital.receipt('corrected-v2-result', {
    scenarioSetId,
    result,
    comparisonResponse,
    replaySha256: sha256(replay.text),
  });

  const savedSource = await capital.source();
  for (const sessionNumber of [1, 2]) {
    const context = await browser.newContext();
    const fresh = new CapitalBrowser(
      await context.newPage(),
      capital.config,
      capital.pool,
      capital.extendForBudgetWait
    );
    const startedAt = new Date().toISOString();
    try {
      expect(await context.cookies()).toEqual([]);
      await fresh.login();
      const reopened = fresh.page.locator(`article[data-scenario-id="${scenarioSetId}"]`);
      await expect(reopened).toHaveAttribute('data-representation', 'capital-plan-v2');
      await expect(
        reopened.getByText(result.roundingPolicy, { exact: true }).first()
      ).toBeVisible();
      const freshSource = await fresh.source();
      expect(freshSource.projection).toEqual(savedSource.projection);
      expect(freshSource.sourceBundleHash).toBe(savedSource.sourceBundleHash);
      const comparisonAgain = await fresh.xhr(
        scenarioURL(fresh.config.fundId, `/${scenarioSetId}/comparison`).replace(
          'capital-plan-v1',
          'capital-plan-v2'
        )
      );
      expect(comparisonAgain.status).toBe(200);
      expect(FundScenarioCapitalComparisonV2Schema.parse(JSON.parse(comparisonAgain.text))).toEqual(
        comparison
      );
      const replayAgain = await fresh.xhr(
        scenarioURL(fresh.config.fundId, `/${scenarioSetId}/calculate`).replace(
          'capital-plan-v1',
          'capital-plan-v2'
        ),
        { method: 'POST', csrf: 'valid' }
      );
      expect(replayAgain.status).toBe(200);
      expect(replayAgain.text).toBe(calculationBytes);
      expect((await fresh.snapshot()).sha256).toBe(before.sha256);
      await Promise.all(fresh.responseCaptures);
      fresh.assertSessionTransport();
      await fresh.receipt('corrected-v2-fresh-session', {
        sessionNumber,
        startedAt,
        completedAt: new Date().toISOString(),
        ownerAcceptance: 'NOT_RECORDED',
        fundId: fresh.config.fundId,
        source: freshSource.projection,
        sourceBundleHash: freshSource.sourceBundleHash,
        scenarioSetId,
        comparison,
        replaySha256: sha256(replayAgain.text),
        requests: fresh.requests,
      });
    } finally {
      await context.close();
    }
  }
});

const expectedDisclosures = [
  frozen.calculate.payload.variants[0]!.result.construction.disclosures.timing,
  frozen.calculate.payload.variants[0]!.result.construction.disclosures.budget,
  frozen.companions.manual99.performance.disclosure,
  frozen.calculate.payload.variants[0]!.result.construction.disclosures.gp,
];

interface CapitalFactsOracle {
  sourceBundle: {
    gp: {
      resolved: { source: string; commitmentUsd: string };
      fundedFromFeesPct: {
        state: string;
        fact?: { rawValue: number };
        effectiveValue: string;
        defaultReason: string | null;
      };
    };
  };
  construction: {
    budget: {
      gpDeemedContributionUsd: string;
      feePopulation: string;
      availableConstructionCapitalUsd: string;
      lifetimeFeesUsd: string;
      lifetimeExpensesUsd: string;
    };
  };
}

async function visibleCapitalFacts(container: Locator, oracle: CapitalFactsOracle) {
  const gp = oracle.sourceBundle.gp;
  const budget = oracle.construction.budget;
  const exact = (value: string) => new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  const section = (title: string) =>
    container.locator('details').filter({
      has: container
        .page()
        .locator('summary')
        .filter({ hasText: exact(title) }),
    });
  const gpSection = section('GP source and deemed contribution');
  const budgetSection = section('Capital budget');
  const rows: Array<{ section: Locator; label: string; value: string; money?: boolean }> = [
    { section: gpSection, label: 'Resolved GP source', value: gp.resolved.source },
    {
      section: gpSection,
      label: 'Contractual GP commitment',
      value: gp.resolved.commitmentUsd,
      money: true,
    },
    {
      section: gpSection,
      label: 'Raw funded-from-fees fraction',
      value:
        gp.fundedFromFeesPct.state === 'present'
          ? String(gp.fundedFromFeesPct.fact?.rawValue)
          : 'Absent',
    },
    {
      section: gpSection,
      label: 'Effective funded-from-fees fraction',
      value: gp.fundedFromFeesPct.effectiveValue,
    },
    {
      section: gpSection,
      label: 'Fraction default reason',
      value: gp.fundedFromFeesPct.defaultReason ?? 'No default applied',
    },
    {
      section: budgetSection,
      label: 'GP deemed contribution deduction',
      value: budget.gpDeemedContributionUsd,
      money: true,
    },
    { section: budgetSection, label: 'Supported fee population', value: budget.feePopulation },
    {
      section: budgetSection,
      label: 'Available construction capital (A)',
      value: budget.availableConstructionCapitalUsd,
      money: true,
    },
    { section: budgetSection, label: 'Lifetime fees', value: budget.lifetimeFeesUsd, money: true },
    {
      section: budgetSection,
      label: 'Lifetime expenses',
      value: budget.lifetimeExpensesUsd,
      money: true,
    },
  ];
  for (const expected of rows) {
    const row = expected.section
      .locator('dt')
      .filter({ hasText: exact(expected.label) })
      .locator('..')
      .locator('dd');
    await expect(row).toBeVisible();
    if (expected.money) await expect(row).toContainText(`(USD ${expected.value})`);
    else await expect(row).toHaveText(expected.value);
  }
}

async function step(capital: CapitalBrowser, name: string) {
  await capital.keyboard.activate(
    capital.dialog().getByRole('button', { name: new RegExp(`^\\d\\. ${name}$`) })
  );
}

async function declarations(capital: CapitalBrowser, fundId: number, skipTime = false) {
  await step(capital, 'Source and budget');
  const units: Record<string, string> = {
    ...(fundId === capital.config.fundId
      ? frozen.calculate.payload.variants[0]!.result.sourceBundle.unitDeclarations
      : frozen.b4Cp032ZeroFraction.explicitZero.sourceBundle.unitDeclarations),
    'fundExpenses[0].monthlyAmount': 'usd',
    'fundExpenses[0].startMonth': 'fund_month_zero_based',
    'fundExpenses[0].endMonth': 'fund_month_zero_based',
  };
  // The timing fixture appends two dollar-denominated stages copied from its recorded entry.
  for (const stageIndex of [1, 2]) {
    for (const [field, unit] of Object.entries({
      roundSize: 'usd',
      valuation: 'usd',
      exitValuation: 'usd',
      esopPct: 'ratio',
      graduationRate: 'ratio',
    })) {
      units[`pipelineProfiles[0].stages[${stageIndex}].${field}`] = unit;
    }
  }
  const controls = capital.dialog().getByLabel(/^Source unit: /);
  await expect(controls).not.toHaveCount(0);
  const active = await controls.evaluateAll((elements) =>
    elements.map((element) => {
      const select = element as HTMLSelectElement;
      const label = Array.from(select.labels ?? [])
        .map((entry) => entry.textContent)
        .join(' ')
        .trim();
      return {
        label,
        path: label.slice('Source unit: '.length),
        options: Array.from(select.options).map((option) => option.value),
      };
    })
  );
  for (const declaration of active) {
    const unit = units[declaration.path];
    if (unit === undefined) throw new Error(`No explicit fixture unit for ${declaration.path}`);
    if (skipTime && unit.startsWith('fund_month')) continue;
    expect(declaration.options).toContain(unit);
    await capital.keyboard.select(
      capital.dialog().getByLabel(declaration.label, { exact: true }),
      unit
    );
  }
}

async function allocation(capital: CapitalBrowser, check = '1') {
  await step(capital, 'Allocations');
  const dialog = capital.dialog();
  for (const [label, value] of [
    ['Source allocation', 'a1'],
    ['Pipeline profile', 'p1'],
    ['Entry stage', 's0'],
  ] as const) {
    await capital.keyboard.select(dialog.getByLabel(label, { exact: true }), value);
  }
  for (const [label, value] of [
    ['Allocation name', 'Seed'],
    ['Entry round', 'Seed'],
    ['Budget share (ratio)', '1'],
    ['Initial check (USD)', check],
    ['Deployment period (years)', '1'],
  ] as const)
    await capital.keyboard.fill(dialog.getByLabel(label, { exact: true }), value);
}

async function guided(
  capital: CapitalBrowser,
  name: string,
  options: { fundId?: number; variants?: number; check?: string; skipTime?: boolean } = {}
) {
  const fundId = options.fundId ?? capital.config.fundId;
  await capital.openDraft(name);
  await declarations(capital, fundId, options.skipTime);
  await allocation(capital, options.check);
  for (let index = 1; index < (options.variants ?? 1); index++) {
    await capital.keyboard.activate(
      capital.dialog().getByRole('button', { name: 'Add variant', exact: true })
    );
    await capital.keyboard.fill(
      capital.dialog().getByLabel('Variant name', { exact: true }),
      `Alternative ${index}`
    );
    await capital.keyboard.fill(
      capital.dialog().getByLabel('Initial check (USD)', { exact: true }),
      String(index + 1)
    );
  }
  await declarations(capital, fundId, options.skipTime);
  await step(capital, 'Follow-ons');
  await expect(capital.dialog().getByText(/Graduation is conditional/)).toBeVisible();
  await step(capital, 'Optional companion');
  await expect(
    capital.dialog().getByText(/Companion unavailable: no performance case selected/)
  ).toBeVisible();
  await step(capital, 'Review');
}

async function review(capital: CapitalBrowser, oracle?: CapitalFactsOracle) {
  await step(capital, 'Review');
  const draftText = await capital.dialog().locator('pre').allTextContents();
  await capital.keyboard.activate(
    capital.dialog().getByRole('button', { name: 'Review capital plan', exact: true })
  );
  try {
    await expect(
      capital.dialog().getByRole('button', { name: 'Save capital scenario', exact: true })
    ).toBeEnabled();
  } catch (error) {
    await capital.receipt('failed-review', {
      draftText,
      dialogText: (await capital.dialog().innerText()).slice(0, 200_000),
      controls: await capital
        .dialog()
        .locator('input, select')
        .evaluateAll((controls) =>
          controls.map((control) => {
            const field = control as HTMLInputElement | HTMLSelectElement;
            return {
              id: field.id,
              value: field.value,
              invalid: field.getAttribute('aria-invalid'),
              describedBy: field.getAttribute('aria-describedby'),
            };
          })
        ),
    });
    throw error;
  }
  await expect(capital.dialog().getByRole('button', { name: /^Copy capital memo/ })).toHaveCount(0);
  const disclosures = capital
    .dialog()
    .getByRole('region', { name: 'Baseline', exact: true })
    .locator('details')
    .filter({ has: capital.page.locator('summary').filter({ hasText: /^Disclosures$/ }) });
  for (const disclosure of expectedDisclosures) {
    await expect(disclosures.getByText(disclosure, { exact: true })).toBeVisible();
  }
  if (oracle)
    await visibleCapitalFacts(
      capital.dialog().getByRole('region', { name: 'Baseline', exact: true }),
      oracle
    );
}

async function save(capital: CapitalBrowser, fundId = capital.config.fundId) {
  await capital.waitForScenarioBudget(fundId, 'mutate');
  const responsePromise = capital.page.waitForResponse(
    (response) =>
      response.url() === `${capital.config.baseURL}${scenarioURL(fundId)}` &&
      response.request().method() === 'POST'
  );
  await capital.keyboard.activate(
    capital.dialog().getByRole('button', { name: 'Save capital scenario', exact: true })
  );
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { scenarioSetId: string };
  await expect(capital.dialog()).toHaveCount(0);
  const card = capital.page.locator(
    `article[data-scenario-id="${body.scenarioSetId}"][data-representation="capital-plan-v1"]`
  );
  await expect(card).toBeVisible();
  return {
    id: body.scenarioSetId,
    card,
    request: capital.requestIdentity(response.request()),
    response: await response.text(),
  };
}

async function calculate(
  capital: CapitalBrowser,
  id: string,
  card: Locator,
  fundId = capital.config.fundId
) {
  await capital.waitForScenarioBudget(fundId, 'mutate');
  const responsePromise = capital.page.waitForResponse(
    (response) =>
      response.url() === `${capital.config.baseURL}${scenarioURL(fundId, `/${id}/calculate`)}` &&
      response.request().method() === 'POST'
  );
  await capital.keyboard.activate(
    card.getByRole('button', { name: 'Calculate capital scenario', exact: true })
  );
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  expect(capital.requestIdentity(response.request())).toMatchObject({
    body: '',
    idempotencyKey: null,
    hasAuthorization: false,
  });
  await expect(
    card.getByText('Capital calculation saved and reloaded.', { exact: true })
  ).toBeVisible();
  const comparison = await capital.comparison(id, fundId);
  expect(comparison.baseline).not.toBeNull();
  await expect(
    card.getByRole('button', {
      name: `Copy capital memo: ${comparison.baseline!.variantName}`,
      exact: true,
    })
  ).toBeVisible();
  return comparison;
}

async function copiedAndDownloaded(
  capital: CapitalBrowser,
  card: Locator,
  memo: CapitalPlanningMemoV1,
  oracle?: CapitalFactsOracle
) {
  const region = card.getByRole('region', { name: memo.variantName, exact: true });
  await expect(region).toBeVisible();
  const details = region.locator('details');
  for (let index = 0; index < (await details.count()); index++) {
    if (!(await details.nth(index).getAttribute('open'))) {
      // Boolean attributes serialize to an empty string; inspect the DOM property.
      if (!(await details.nth(index).evaluate((element) => (element as HTMLDetailsElement).open))) {
        await capital.keyboard.activate(details.nth(index).locator('summary'));
      }
    }
  }
  if (oracle) await visibleCapitalFacts(region, oracle);
  const visible = await details.evaluateAll((elements) =>
    elements.map((element) => {
      const title = element.querySelector('summary')!.textContent!;
      const rows = Array.from(element.querySelectorAll('dl > div')).map((row) => ({
        label: row.querySelector('dt')!.textContent!,
        value: row.querySelector('dd')!.textContent!,
      }));
      return { title, rows };
    })
  );
  const expectedCopy = visible
    .map(
      (section) =>
        `${section.title}\n${section.rows.map((row) => `${row.label}: ${row.value}`).join('\n')}`
    )
    .join('\n\n');
  await capital.keyboard.activate(
    region.getByRole('button', { name: `Copy capital memo: ${memo.variantName}`, exact: true })
  );
  await expect(region.getByText('Capital memo copied.', { exact: true })).toBeVisible();
  const copied = await capital.page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(expectedCopy);
  for (const disclosure of expectedDisclosures) expect(copied).toContain(disclosure);
  for (const label of [
    'Input support',
    'Lifetime capacity',
    'Allocation budget',
    'Reserve earmark',
    'Timing',
    'Staleness',
  ]) {
    expect(
      visible.find((section) => section.title === 'Verdict axes')?.rows.map((row) => row.label)
    ).toContain(label);
  }
  expect(copied).toContain(memo.result.sourceBundle.sourceBundleHash);
  expect(copied).toContain(memo.result.sourceBundle.interpretationVersion);
  expect(copied).toContain(memo.result.construction.methodVersion);
  expect(copied).toContain(`Count basis: ${memo.countBasis}`);
  expect(copied).toContain(memo.readState.sourceFreshness);
  const downloadPromise = capital.page.waitForEvent('download');
  await capital.keyboard.activate(
    region.getByRole('button', {
      name: `Download complete saved memo: ${memo.variantName}`,
      exact: true,
    })
  );
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const downloaded = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(downloaded).toEqual(memo);
  expect(downloaded.result.construction.monthlyDetail).toEqual(
    memo.result.construction.monthlyDetail
  );
  expect(download.suggestedFilename()).toBe(
    `capital-memo-${memo.scenarioSetId}-${memo.variantId}.json`
  );
  await capital.receipt('memo-parity', {
    scenarioSetId: memo.scenarioSetId,
    variantId: memo.variantId,
    visible,
    copied,
    downloaded,
    copiedHash: sha256(copied),
  });
  return copied;
}

async function persisted(
  capital: CapitalBrowser,
  id: string,
  memo: CapitalPlanningMemoV1,
  fundId = capital.config.fundId
) {
  const snapshot = await capital.snapshot(fundId);
  const set = snapshot.tables['fund_scenario_sets']!.find((row) => row.id === id);
  expect(set).toBeDefined();
  const variant = snapshot.payloads.find(
    (row) => row.table === 'fund_scenario_variants' && row.id === memo.variantId
  );
  expect(variant).toBeDefined();
  expect(JSON.parse(variant!.text).input).toEqual(memo.result.input);
  const runs = snapshot.tables['fund_scenario_calculation_runs']!.map(
    (row) => JSON.parse(row.row) as Record<string, unknown>
  ).filter((row) => row['scenario_set_id'] === id);
  expect(runs).toHaveLength(1);
  expect(runs[0]?.['status']).toBe('completed');
  expect(runs[0]?.['input_hash']).toMatch(/^[a-f0-9]{64}$/);
  const savedSnapshot = snapshot.payloads.find(
    (row) => row.table === 'fund_snapshots' && row.id === String(runs[0]?.['snapshot_id'])
  );
  expect(savedSnapshot).toBeDefined();
  expect(
    JSON.parse(savedSnapshot!.text).variants.find(
      (value: { variantId: string }) => value.variantId === memo.variantId
    ).result
  ).toEqual(memo.result);
  await capital.receipt('database', { fundId, scenarioSetId: id, snapshot });
  return snapshot;
}

function financialBytes(snapshot: DatabaseSnapshot, ids: string[]) {
  return snapshot.payloads.filter((payload) => ids.includes(payload.id));
}

test('CP-022 CP-041 UI-R3-001 UI-R3-002 UI-R3-005 UI-R3-009 UI-R3-010 UI-R3-011: keyboard create one through five variants, persisted compare, copy and responsive layout', async ({
  capital,
}, testInfo) => {
  // Allow active work for five end-to-end flows and four viewport checks, retaining pacing waits.
  test.setTimeout(testInfo.timeout + 120_000);
  const initialViewport = capital.page.viewportSize();
  expect(initialViewport).not.toBeNull();
  const initialReducedMotion = await capital.page.evaluate(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 820, height: 1180 },
    { width: 390, height: 844 },
  ]) {
    await capital.page.setViewportSize(viewport);
    await capital.page.emulateMedia({ reducedMotion: 'reduce' });
    expect(
      await capital.page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
    ).toBe(true);
    const dialog = await capital.openDraft();
    const sourceLabels = [];
    for (const path of [
      'economicsAssumptions.gpCommitmentModel.commitmentAmount',
      'economicsAssumptions.expenseModel.annualExpenses[0].amount',
    ]) {
      const label = dialog.getByText(`Source unit: ${path}`, { exact: true });
      await expect(label).toBeVisible();
      const bounds = await label.evaluate((element) => ({
        text: element.textContent,
        width: element.clientWidth,
        scroll: element.scrollWidth,
      }));
      expect(bounds.scroll).toBeLessThanOrEqual(bounds.width + 1);
      sourceLabels.push(bounds);
    }
    const modalLayout = await dialog.evaluate((element) => ({
      width: element.clientWidth,
      scroll: element.scrollWidth,
    }));
    expect(modalLayout.scroll).toBeLessThanOrEqual(modalLayout.width + 1);
    if (viewport.width === 820 || viewport.width === 390) {
      const label = 'Source unit: economicsAssumptions.expenseModel.annualExpenses[0].amount';
      await capital.keyboard.reach(dialog.getByLabel(label, { exact: true }));
      await expect(dialog.getByText(label, { exact: true })).toBeInViewport();
      await capital.page.screenshot({
        path: `${capital.config.evidenceDir}/modal-source-units-${viewport.width}x${viewport.height}.png`,
      });
    }
    await capital.keyboard.reach(dialog.getByLabel('Scenario name', { exact: true }));
    const controlFocus = await dialog
      .getByLabel('Scenario name', { exact: true })
      .evaluate((element) => ({
        focused: element === document.activeElement,
        shadow: getComputedStyle(element).boxShadow,
      }));
    expect(controlFocus.focused).toBe(true);
    expect(controlFocus.shadow).not.toBe('none');
    await capital.keyboard.activate(
      dialog.getByRole('button', { name: 'Close and keep draft', exact: true })
    );
    await expect(
      capital.page.getByRole('button', { name: 'New capital planning scenario', exact: true })
    ).toBeFocused();
    await capital.receipt('modal-viewport', {
      viewport,
      modalLayout,
      sourceLabels,
      controlFocus,
      reducedMotion: true,
      fundId: capital.config.fundId,
    });
  }
  await capital.page.setViewportSize(initialViewport!);
  await capital.page.emulateMedia({
    reducedMotion: initialReducedMotion ? 'reduce' : 'no-preference',
  });
  for (let count = 1; count <= 5; count++) {
    await guided(capital, `B10 keyboard ${count} variants`, { variants: count });
    if (count === 5)
      await expect(
        capital.dialog().getByRole('button', { name: 'Add variant', exact: true })
      ).toBeDisabled();
    await review(capital, frozen.calculate.payload.variants[0]!.result);
    const saved = await save(capital);
    const comparison = await calculate(capital, saved.id, saved.card);
    expect([
      comparison.baseline,
      ...comparison.variants.map((variant) => variant.memo),
    ]).toHaveLength(count);
    expect(comparison.baseline!.result.construction.budget).toEqual(
      frozen.calculate.payload.variants[0]!.result.construction.budget
    );
    await persisted(capital, saved.id, comparison.baseline!);
    const before = await capital.snapshot();
    const downloadedCopy = await copiedAndDownloaded(
      capital,
      saved.card,
      comparison.baseline!,
      frozen.calculate.payload.variants[0]!.result
    );
    for (const variant of comparison.variants) {
      expect(variant.changedInputs.length).toBeGreaterThan(0);
      await copiedAndDownloaded(capital, saved.card, variant.memo);
    }
    await capital.reload();
    await expect(saved.card).toBeVisible();
    const reloaded = await capital.comparison(saved.id);
    expect(reloaded).toEqual(comparison);
    expect((await capital.snapshot()).sha256).toBe(before.sha256);
    expect(await copiedAndDownloaded(capital, saved.card, reloaded.baseline!)).toBe(downloadedCopy);
    if (count === 5) {
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 1024, height: 768 },
        { width: 820, height: 1180 },
        { width: 390, height: 844 },
      ]) {
        await capital.page.setViewportSize(viewport);
        await capital.page.emulateMedia({ reducedMotion: 'reduce' });
        expect(
          await capital.page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
        ).toBe(true);
        const layout = await capital.page.evaluate(() => ({
          width: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
        }));
        expect(layout.scroll).toBeLessThanOrEqual(layout.width + 1);
        const regions = saved.card.getByRole('region', { name: /^Changed inputs:/ });
        await expect(regions).toHaveCount(count - 1);
        const primaryBackground = await capital.page
          .getByRole('button', { name: 'New capital planning scenario', exact: true })
          .evaluate((element) => getComputedStyle(element).backgroundColor);
        expect(primaryBackground).toBe('rgb(41, 41, 41)');
        const scrollChecks: Array<{ overflowed: boolean; before: number; after: number }> = [];
        for (let index = 0; index < (await regions.count()); index++) {
          const region = regions.nth(index);
          await capital.keyboard.reach(region);
          const focus = await region.evaluate((element) => {
            const style = getComputedStyle(element);
            return {
              focused: element === document.activeElement,
              overflow: style.overflowX,
              shadow: style.boxShadow,
              outline: style.outlineWidth,
              width: element.clientWidth,
              scroll: element.scrollWidth,
            };
          });
          expect(focus.focused).toBe(true);
          expect(focus.overflow).toBe('auto');
          expect(focus.shadow !== 'none' || focus.outline !== '0px').toBe(true);
          const overflowed = focus.scroll > focus.width + 1;
          await region.evaluate((element) => {
            element.scrollLeft = 0;
          });
          const beforeScroll = await region.evaluate((element) => element.scrollLeft);
          await capital.page.keyboard.press('ArrowRight');
          if (overflowed)
            await expect
              .poll(() => region.evaluate((element) => element.scrollLeft))
              .toBeGreaterThan(beforeScroll);
          scrollChecks.push({
            overflowed,
            before: beforeScroll,
            after: await region.evaluate((element) => element.scrollLeft),
          });
        }
        const motion = await saved.card.locator('button').evaluateAll((buttons) =>
          buttons.map((button) => {
            const style = getComputedStyle(button);
            const milliseconds = (value: string) =>
              value
                .split(',')
                .map((part) => parseFloat(part) * (part.trim().endsWith('ms') ? 1 : 1000));
            return {
              transitions: milliseconds(style.transitionDuration),
              animations: milliseconds(style.animationDuration),
            };
          })
        );
        expect(
          motion.every((control) =>
            [...control.transitions, ...control.animations].every((duration) => duration <= 0.011)
          )
        ).toBe(true);
        await capital.receipt('viewport', {
          viewport,
          layout,
          primaryBackground,
          scrollChecks,
          motion,
          reducedMotion: true,
          scenarioSetId: saved.id,
        });
      }
    }
  }
});

test('UI-R3-003 UI-R3-004 UI-R3-005 UI-R3-008: raw draft preservation, focused errors, companion removal and 120 character name boundary', async ({
  capital,
}) => {
  const name = 'N'.repeat(121);
  await guided(capital, name);
  await step(capital, 'Allocations');
  for (const raw of ['', '1.', '0']) {
    await capital.keyboard.fill(
      capital.dialog().getByLabel('Initial check (USD)', { exact: true }),
      raw
    );
    await step(capital, 'Review');
    await capital.keyboard.activate(
      capital.dialog().getByRole('button', { name: 'Review capital plan', exact: true })
    );
    await expect(capital.dialog().getByRole('region', { name: 'Validation errors' })).toBeVisible();
    await expect(capital.dialog().getByLabel('Initial check (USD)', { exact: true })).toBeFocused();
    const errors = capital.dialog().getByRole('region', { name: 'Validation errors' });
    const issueCount = await errors.getByRole('button').count();
    const announcement = capital.dialog().getByRole('status');
    await expect(announcement).toHaveCount(1);
    await expect(announcement).toHaveAttribute('aria-live', 'polite');
    await expect(announcement).toHaveText(
      `Review failed: ${issueCount} issue${issueCount === 1 ? '' : 's'}. Your entries are retained.`
    );
    const checkError = errors
      .getByRole('button')
      .filter({ hasText: /initialCheckUsd/ })
      .first();
    await capital.keyboard.activate(checkError);
    const check = capital.dialog().getByLabel('Initial check (USD)', { exact: true });
    await expect(check).toBeFocused();
    await expect(check).toHaveValue(raw);
    await expect(check).toHaveAttribute('aria-invalid', 'true');
    const describedBy = await check.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    await expect(capital.dialog().locator(`[id="${describedBy}"]`)).toBeVisible();
    await capital.keyboard.activate(
      capital.dialog().getByRole('button', { name: 'Close and keep draft', exact: true })
    );
    await expect(
      capital.page.getByRole('button', { name: 'New capital planning scenario', exact: true })
    ).toBeFocused();
    await capital.openDraft();
    await step(capital, 'Allocations');
    await expect(capital.dialog().getByLabel('Initial check (USD)', { exact: true })).toHaveValue(
      raw
    );
  }
  await capital.keyboard.activate(
    capital.dialog().getByRole('button', { name: 'Close and keep draft', exact: true })
  );
  // Exercise the application's real router and browser Back without replacing the document.
  await capital.waitForScenarioBudget(capital.config.secondaryFundId, 'navigate');
  await capital.page.evaluate((fundId) => {
    history.pushState(null, '', `/fund-model-results/${fundId}/scenarios`);
    dispatchEvent(new PopStateEvent('popstate'));
  }, capital.config.secondaryFundId);
  await expect(capital.page).toHaveURL(
    new RegExp(`/fund-model-results/${capital.config.secondaryFundId}/scenarios$`)
  );
  await capital.openDraft();
  await expect(capital.dialog().getByLabel('Scenario name', { exact: true })).toHaveValue('');
  await capital.keyboard.fill(
    capital.dialog().getByLabel('Scenario name', { exact: true }),
    'Secondary retained draft'
  );
  await capital.keyboard.activate(
    capital.dialog().getByRole('button', { name: 'Close and keep draft', exact: true })
  );
  await capital.waitForScenarioBudget(capital.config.fundId, 'navigate');
  await capital.page.goBack();
  await expect(capital.page).toHaveURL(
    new RegExp(`/fund-model-results/${capital.config.fundId}/scenarios$`)
  );
  await capital.openDraft();
  await step(capital, 'Allocations');
  await expect(capital.dialog().getByLabel('Scenario name', { exact: true })).toHaveValue(name);
  await expect(capital.dialog().getByLabel('Initial check (USD)', { exact: true })).toHaveValue(
    '0'
  );
  await capital.keyboard.fill(
    capital.dialog().getByLabel('Initial check (USD)', { exact: true }),
    '1'
  );
  await step(capital, 'Review');
  await capital.keyboard.activate(
    capital.dialog().getByRole('button', { name: 'Review capital plan', exact: true })
  );
  await expect(capital.dialog().getByLabel('Scenario name', { exact: true })).toBeFocused();
  await expect(capital.dialog().getByLabel('Scenario name', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true'
  );
  await expect(
    capital.dialog().getByRole('button', { name: 'Save capital scenario', exact: true })
  ).toBeDisabled();
  await capital.keyboard.fill(
    capital.dialog().getByLabel('Scenario name', { exact: true }),
    'N'.repeat(120)
  );
  await step(capital, 'Optional companion');
  await capital.keyboard.activate(
    capital.dialog().getByRole('button', { name: 'Add companion', exact: true })
  );
  await capital.keyboard.fill(
    capital.dialog().getByLabel('Issuer label', { exact: true }),
    'Retained invalid companion'
  );
  await capital.keyboard.fill(
    capital.dialog().getByLabel('Exit equity value (USD)', { exact: true }),
    '2.'
  );
  await step(capital, 'Review');
  await capital.keyboard.activate(
    capital.dialog().getByRole('button', { name: 'Review capital plan', exact: true })
  );
  await expect(
    capital.dialog().getByRole('button', { name: 'Save capital scenario', exact: true })
  ).toBeDisabled();
  await step(capital, 'Optional companion');
  await expect(capital.dialog().getByLabel('Exit equity value (USD)', { exact: true })).toHaveValue(
    '2.'
  );
  await capital.keyboard.activate(
    capital.dialog().getByRole('button', { name: 'Remove companion', exact: true })
  );
  await step(capital, 'Allocations');
  await expect(capital.dialog().getByLabel('Initial check (USD)', { exact: true })).toHaveValue(
    '1'
  );
  await review(capital);
  const saved = await save(capital);
  const comparison = await calculate(capital, saved.id, saved.card);
  expect(comparison.baseline!.scenarioSetName).toHaveLength(120);
  expect(comparison.baseline!.result.input.performanceCase).toBeUndefined();
  await copiedAndDownloaded(capital, saved.card, comparison.baseline!);
});

test('CP-032 UI-R3-002: explicit and omitted zero GP fractions retain 80m construction capacity and raw source provenance', async ({
  capital,
}) => {
  const fundId = capital.config.secondaryFundId;
  await capital.workspace(fundId);
  for (const kind of ['explicitZero', 'omittedZero'] as const) {
    const expected = frozen.b4Cp032ZeroFraction[kind];
    if (kind === 'omittedZero') {
      const source = await capital.source(fundId);
      await capital.publication(
        fundId,
        { id: source.projection.sourceConfigId, version: source.projection.sourceConfigVersion },
        (raw) => {
          delete raw['fundedFromFeesPct'];
        }
      );
      await capital.reload();
    }
    await guided(capital, `B10 GP ${kind}`, { fundId, check: '1000000' });
    await review(capital, expected);
    const saved = await save(capital, fundId);
    const comparison = await calculate(capital, saved.id, saved.card, fundId);
    const result = comparison.baseline!.result;
    expect(result.construction).toEqual(expected.construction);
    expect(result.sourceBundle.gp).toEqual(expected.sourceBundle.gp);
    expect(result.construction.budget).toMatchObject({
      committedCapitalUsd: '100000000.000000',
      lifetimeFeesUsd: '18000000.000000',
      lifetimeExpensesUsd: '2000000.000000',
      gpDeemedContributionUsd: '0.000000',
      availableConstructionCapitalUsd: '80000000.000000',
    });
    const raw = await capital.pool.query<{ config: Record<string, unknown>; bytes: string }>(
      `SELECT config, encode(jsonb_send(config),'hex') AS bytes FROM fundconfigs WHERE id=$1 AND fund_id=$2`,
      [result.sourceBundle.projection.sourceConfigId, fundId]
    );
    expect(Object.hasOwn(raw.rows[0]!.config, 'fundedFromFeesPct')).toBe(kind === 'explicitZero');
    const originalBytes = raw.rows[0]!.bytes;
    await persisted(capital, saved.id, comparison.baseline!, fundId);
    await copiedAndDownloaded(capital, saved.card, comparison.baseline!, expected);
    await capital.reload();
    expect((await capital.comparison(saved.id, fundId)).baseline!.result).toEqual(result);
    expect(
      (
        await capital.pool.query<{ bytes: string }>(
          `SELECT encode(jsonb_send(config),'hex') AS bytes FROM fundconfigs WHERE id=$1`,
          [result.sourceBundle.projection.sourceConfigId]
        )
      ).rows[0]?.bytes
    ).toBe(originalBytes);
  }
  const source = await capital.source(fundId);
  await capital.publication(
    fundId,
    { id: source.projection.sourceConfigId, version: source.projection.sourceConfigVersion },
    (raw) => {
      const economics = raw['economicsAssumptions'] as {
        feeModel: { tiers: Array<{ rate: number }> };
      };
      economics.feeModel.tiers[0]!.rate = 0.12;
    }
  );
  await capital.reload();
  await guided(capital, 'B10 costs exceed commitments', { fundId, check: '1000000' });
  await step(capital, 'Source and budget');
  await capital.keyboard.fill(
    capital.dialog().getByLabel('Planning budget (USD, optional)', { exact: true }),
    '1'
  );
  await review(capital);
  const saved = await save(capital, fundId);
  const comparison = await calculate(capital, saved.id, saved.card, fundId);
  expect(comparison.baseline!.result.construction.budget.availableConstructionCapitalUsd).toBe(
    '-22000000.000000'
  );
  const copied = await copiedAndDownloaded(capital, saved.card, comparison.baseline!);
  expect(copied).toContain('under modeled assumptions');
});

async function fillCompanion(capital: CapitalBrowser, input: AggregatePreferenceInputV1) {
  await step(capital, 'Optional companion');
  const dialog = capital.dialog();
  await capital.keyboard.activate(
    dialog.getByRole('button', { name: 'Add companion', exact: true })
  );
  for (const [label, value] of [
    ['Issuer label', input.issuerLabel],
    ['Exit equity value (USD)', input.exitEquityValueUsd],
    ['As-converted ownership (ratio)', input.asConvertedOwnershipRatio],
    ['Fund liquidation preference (USD)', input.fundLiquidationPreferenceUsd],
    ['Preferences senior to position (USD)', input.totalPreferencesSeniorUsd],
    ['Other pari-passu preferences (USD)', input.totalPreferencesPariPassuUsd],
    ['Preferences Behind Position (USD)', input.totalPreferencesJuniorUsd],
    ['Invested cost (USD)', input.investedCostUsd],
  ] as const)
    await capital.keyboard.fill(dialog.getByLabel(label, { exact: true }), value ?? '');
  await capital.keyboard.select(
    dialog.getByLabel('Issuer kind', { exact: true }),
    input.issuerKind
  );
  await capital.keyboard.select(
    dialog.getByLabel('Preference type', { exact: true }),
    input.preferenceType
  );
  await dialog.getByLabel('Exit date', { exact: true }).fill(input.exitDate);
  if (input.manualOwnershipOverrideRatio !== undefined) {
    await capital.keyboard.check(
      dialog.getByRole('checkbox', { name: 'Manual ownership override', exact: true })
    );
    await capital.keyboard.fill(
      dialog.getByLabel('Manual ownership override (ratio)', { exact: true }),
      input.manualOwnershipOverrideRatio
    );
    await capital.keyboard.fill(
      dialog.getByLabel('Ownership override explanation', { exact: true }),
      input.ownershipOverrideExplanation ?? ''
    );
  }
  for (const key of ['positionFmv', 'manualFmvOverride'] as const) {
    const fmv = input[key];
    if (!fmv) continue;
    const manual = key === 'manualFmvOverride';
    await capital.keyboard.check(
      dialog.getByRole('checkbox', {
        name: manual ? 'Manual FMV override' : 'Position FMV',
        exact: true,
      })
    );
    await capital.keyboard.fill(
      dialog.getByLabel(`${manual ? 'Manual' : 'Position'} FMV (USD)`, { exact: true }),
      fmv.amountUsd
    );
    await dialog
      .getByLabel('FMV as-of date', { exact: true })
      .nth(manual && input.positionFmv ? 1 : 0)
      .fill(fmv.asOfDate);
    if (!manual)
      await capital.keyboard.select(dialog.getByLabel('FMV basis', { exact: true }), fmv.basis);
  }
}

test('CP-054 UI-R3-008 UI-R3-010: aggregate companion correction, manual ownership, FMV and unavailable values persist through copy and reload', async ({
  capital,
}) => {
  for (const kind of ['manual99', 'manual1', 'unavailable', 'zeroCost'] as const) {
    await guided(capital, `B10 companion ${kind}`);
    await fillCompanion(capital, frozen.companions[kind].input as AggregatePreferenceInputV1);
    if (kind === 'manual99') {
      await capital.keyboard.fill(
        capital.dialog().getByLabel('Exit equity value (USD)', { exact: true }),
        '2.'
      );
      await step(capital, 'Review');
      await capital.keyboard.activate(
        capital.dialog().getByRole('button', { name: 'Review capital plan', exact: true })
      );
      await expect(
        capital.dialog().getByRole('button', { name: 'Save capital scenario', exact: true })
      ).toBeDisabled();
      await step(capital, 'Optional companion');
      await capital.keyboard.fill(
        capital.dialog().getByLabel('Exit equity value (USD)', { exact: true }),
        '0.000000'
      );
    }
    await review(capital);
    const saved = await save(capital);
    const comparison = await calculate(capital, saved.id, saved.card);
    expect(comparison.baseline!.result.performance).toEqual(frozen.companions[kind].performance);
    const copied = await copiedAndDownloaded(capital, saved.card, comparison.baseline!);
    expect(copied).toContain('Preferences Behind Position');
    expect(copied).toContain('Aggregate preference forecast');
    if (kind === 'zeroCost') expect(copied).toContain('Unavailable: ZERO_COST');
    if (kind === 'unavailable') expect(copied).toContain('Unavailable: FMV_UNAVAILABLE');
    await persisted(capital, saved.id, comparison.baseline!);
    await capital.reload();
    expect((await capital.comparison(saved.id)).baseline!.result.performance).toEqual(
      frozen.companions[kind].performance
    );
  }
});

test('B10 cookie session CSRF: fixed valid create and calculate bodies reject missing and invalid tokens without durable acquisition', async ({
  capital,
}) => {
  await guided(capital, 'B10 CSRF request template');
  await review(capital);
  const template = await save(capital);
  const request = CreateFundScenarioSetV3Schema.parse(JSON.parse(template.request.body));
  request.name = 'B10 CSRF controlled create';
  request.variants[0]!.variantId = randomUUID();
  request.baselineVariantId = request.variants[0]!.variantId;
  const body = JSON.stringify(request);
  const key = randomUUID();
  const denials = [];
  for (const csrf of ['missing', 'invalid'] as const) {
    const before = await capital.snapshot();
    const response = await capital.xhr(scenarioURL(capital.config.fundId), {
      method: 'POST',
      body,
      key,
      csrf,
    });
    expect(response).toEqual({ status: 403, text: '{"error":"csrf_validation_failed"}' });
    const after = await capital.snapshot();
    expect(after.sha256).toBe(before.sha256);
    denials.push({
      action: 'create',
      csrf,
      status: response.status,
      responseHash: sha256(response.text),
      requestBodyHash: sha256(body),
      beforeHash: before.sha256,
      afterHash: after.sha256,
    });
  }
  const created = await capital.xhr(scenarioURL(capital.config.fundId), {
    method: 'POST',
    body,
    key,
    csrf: 'valid',
  });
  expect(created.status).toBe(201);
  const id = (JSON.parse(created.text) as { scenarioSetId: string }).scenarioSetId;
  const afterCreate = await capital.snapshot();
  expect(
    afterCreate.tables['fund_scenario_sets']!.map(
      (row) => JSON.parse(row.row) as { id: string; idempotency_key: string }
    ).filter((row) => row.id === id && row['idempotency_key'] === key)
  ).toHaveLength(1);
  for (const csrf of ['missing', 'invalid'] as const) {
    const before = await capital.snapshot();
    const response = await capital.xhr(scenarioURL(capital.config.fundId, `/${id}/calculate`), {
      method: 'POST',
      csrf,
    });
    expect(response).toEqual({ status: 403, text: '{"error":"csrf_validation_failed"}' });
    const after = await capital.snapshot();
    expect(after.sha256).toBe(before.sha256);
    denials.push({
      action: 'calculate',
      csrf,
      status: response.status,
      responseHash: sha256(response.text),
      requestBodyHash: sha256(''),
      beforeHash: before.sha256,
      afterHash: after.sha256,
    });
  }
  const calculated = await capital.xhr(scenarioURL(capital.config.fundId, `/${id}/calculate`), {
    method: 'POST',
    csrf: 'valid',
  });
  expect(calculated.status).toBe(200);
  const comparison = await capital.comparison(id);
  await persisted(capital, id, comparison.baseline!);
  await capital.receipt('csrf', {
    denials,
    createStatus: created.status,
    createResponseHash: sha256(created.text),
    calculateStatus: calculated.status,
    calculateResponseHash: sha256(calculated.text),
    scenarioSetId: id,
  });
});

test('REC-RESPONSE-LOSS: real committed create and calculate survive lost delivery and exact browser retry without duplicate durable rows', async ({
  capital,
}) => {
  await guided(capital, 'B10 response loss retained draft');
  await review(capital);
  const createURL = `${capital.config.baseURL}${scenarioURL(capital.config.fundId)}`;
  await capital.waitForScenarioBudget(capital.config.fundId, 'mutate');
  const createFault = await capital.dropCommittedResponse(createURL, 'create');
  await capital.keyboard.activate(
    capital.dialog().getByRole('button', { name: 'Save capital scenario', exact: true })
  );
  const lostCreate = await createFault.observed;
  await expect(
    capital.dialog().getByRole('button', { name: 'Retry capital save', exact: true })
  ).toBeEnabled();
  await expect(capital.dialog().getByRole('status')).toContainText('Your draft is retained');
  await capital.keyboard.activate(
    capital.dialog().getByRole('button', { name: 'Close and keep draft', exact: true })
  );
  await capital.openDraft();
  await expect(capital.dialog().getByLabel('Scenario name', { exact: true })).toHaveValue(
    'B10 response loss retained draft'
  );
  await step(capital, 'Allocations');
  await expect(capital.dialog().getByLabel('Initial check (USD)', { exact: true })).toHaveValue(
    '1'
  );
  await capital.waitForScenarioBudget(capital.config.fundId, 'mutate');
  const retryCreateResponse = capital.page.waitForResponse(
    (response) => response.url() === createURL && response.request().method() === 'POST'
  );
  const retryCreateRequest = capital.page
    .waitForRequest((request) => request.url() === createURL && request.method() === 'POST')
    .then((request) => ({ request, sentAt: performance.now() }));
  await capital.keyboard.activate(
    capital.dialog().getByRole('button', { name: 'Retry capital save', exact: true })
  );
  const recoveredCreate = await retryCreateResponse;
  const retrySentAt = (await retryCreateRequest).sentAt;
  expect(capital.requestIdentity(recoveredCreate.request())).toEqual(lostCreate.request);
  expect(recoveredCreate.status()).toBe(lostCreate.status);
  expect(sha256(await recoveredCreate.text())).toBe(lostCreate.responseHash);
  expect(retrySentAt).toBeGreaterThan(lostCreate.responseDroppedAt);
  expect(await capital.snapshot()).toEqual(lostCreate.database);
  const id = (JSON.parse(lostCreate.response) as { scenarioSetId: string }).scenarioSetId;
  const card = capital.page.locator(`article[data-scenario-id="${id}"]`);
  await expect(card).toBeVisible();
  const calculateURL = `${capital.config.baseURL}${scenarioURL(capital.config.fundId, `/${id}/calculate`)}`;
  await capital.waitForScenarioBudget(capital.config.fundId, 'mutate');
  const calculateFault = await capital.dropCommittedResponse(calculateURL, 'calculate');
  await capital.keyboard.activate(
    card.getByRole('button', { name: 'Calculate capital scenario', exact: true })
  );
  const lostCalculate = await calculateFault.observed;
  await expect(card.getByRole('status').first()).toContainText('response was lost');
  await capital.waitForScenarioBudget(capital.config.fundId, 'mutate');
  const retryCalculateResponse = capital.page.waitForResponse(
    (response) => response.url() === calculateURL && response.request().method() === 'POST'
  );
  const retryCalculateRequest = capital.page
    .waitForRequest((request) => request.url() === calculateURL && request.method() === 'POST')
    .then((request) => ({ request, sentAt: performance.now() }));
  await capital.keyboard.activate(
    card.getByRole('button', { name: 'Calculate capital scenario', exact: true })
  );
  const recoveredCalculate = await retryCalculateResponse;
  const calculateRetrySentAt = (await retryCalculateRequest).sentAt;
  expect(capital.requestIdentity(recoveredCalculate.request())).toEqual(lostCalculate.request);
  expect(recoveredCalculate.status()).toBe(lostCalculate.status);
  expect(sha256(await recoveredCalculate.text())).toBe(lostCalculate.responseHash);
  expect(calculateRetrySentAt).toBeGreaterThan(lostCalculate.responseDroppedAt);
  expect(await capital.snapshot()).toEqual(lostCalculate.database);
  const comparison = await capital.comparison(id);
  await copiedAndDownloaded(capital, card, comparison.baseline!);
  await capital.receipt('response-loss', {
    scenarioSetId: id,
    create: { ...lostCreate, retrySentAt },
    calculate: { ...lostCalculate, retrySentAt: calculateRetrySentAt },
    finalDatabase: await capital.snapshot(),
  });
});

test('UI-R3-003 UI-R3-006 UI-R3-010: current source conflict, append-only publication, historical stale copy and archive preserve financial bytes', async ({
  capital,
}) => {
  await guided(capital, 'B10 historical financial bytes');
  await review(capital);
  const saved = await save(capital);
  const comparison = await calculate(capital, saved.id, saved.card);
  const before = await capital.snapshot();
  const detail = await capital.detail(saved.id);
  const byteIds = [...detail.variants.map((variant) => variant.id), String(comparison.snapshotId)];
  await capital.waitForApiBudget(4);
  await capital.keyboard.activate(
    saved.card.getByRole('button', { name: 'Duplicate to draft', exact: true })
  );
  await capital.keyboard.fill(
    capital.dialog().getByLabel('Scenario name', { exact: true }),
    'B10 conflict recovery draft'
  );
  await declarations(capital, capital.config.fundId);
  await review(capital);
  const source = await capital.source();
  const publication = await capital.publication(
    capital.config.fundId,
    { id: source.projection.sourceConfigId, version: source.projection.sourceConfigVersion },
    (raw) => {
      raw['fundName'] = 'Synthetic revised source';
    }
  );
  await capital.waitForScenarioBudget(capital.config.fundId, 'mutate');
  const saveResponse = capital.page.waitForResponse(
    (response) =>
      response.url() === `${capital.config.baseURL}${scenarioURL(capital.config.fundId)}` &&
      response.request().method() === 'POST'
  );
  await capital.keyboard.activate(
    capital.dialog().getByRole('button', { name: 'Save capital scenario', exact: true })
  );
  expect((await saveResponse).status()).toBe(409);
  await expect(
    capital.dialog().getByRole('region', { name: 'Source conflict identities' })
  ).toContainText(
    `Supplied source: config ${source.projection.sourceConfigId}, version ${source.projection.sourceConfigVersion}`
  );
  await expect(
    capital.dialog().getByRole('region', { name: 'Source conflict identities' })
  ).toContainText(`Current source: config ${publication.id}, version ${publication.version}`);
  const currentSource = await capital.source();
  await expect(
    capital.dialog().getByRole('region', { name: 'Source conflict identities' })
  ).toContainText(`hash ${source.sourceBundleHash}`);
  await expect(
    capital.dialog().getByRole('region', { name: 'Source conflict identities' })
  ).toContainText(`hash ${currentSource.sourceBundleHash}`);
  await expect(capital.dialog().getByLabel('Scenario name', { exact: true })).toHaveValue(
    'B10 conflict recovery draft'
  );
  expect(await capital.snapshot()).toEqual(before);
  await step(capital, 'Source and budget');
  await capital.waitForApiBudget(4);
  await capital.keyboard.activate(
    capital.dialog().getByRole('button', { name: 'Refresh source', exact: true })
  );
  await expect(capital.dialog().getByRole('status')).toContainText(
    'Confirm source units again for the changed source. Your scenario entries are retained.'
  );
  await expect(capital.dialog().getByLabel('Scenario name', { exact: true })).toHaveValue(
    'B10 conflict recovery draft'
  );
  await expect(
    capital.dialog().getByRole('button', { name: 'Save capital scenario', exact: true })
  ).toBeDisabled();
  await declarations(capital, capital.config.fundId);
  await review(capital);
  await save(capital);
  await capital.reload();
  const stale = await capital.comparison(saved.id);
  expect(stale.readState.sourceFreshness).toBe('STALE_PUBLISH');
  expect(stale.baseline!.result).toEqual(comparison.baseline!.result);
  expect(financialBytes(await capital.snapshot(), byteIds)).toEqual(
    financialBytes(before, byteIds)
  );
  expect(await copiedAndDownloaded(capital, saved.card, stale.baseline!)).toContain(
    'STALE_PUBLISH'
  );
  await capital.waitForScenarioBudget(capital.config.fundId, 'mutate');
  await capital.keyboard.activate(
    saved.card.getByRole('button', { name: 'Archive capital scenario', exact: true })
  );
  await expect(saved.card).toHaveCount(0);
  await capital.waitForScenarioBudget(capital.config.fundId, 'navigate', true);
  await capital.keyboard.check(
    capital.page.getByRole('checkbox', { name: 'Include archived capital plans', exact: true })
  );
  await expect(saved.card).toContainText('Archived');
  await expect(
    saved.card.getByRole('button', { name: 'Calculate capital scenario', exact: true })
  ).toBeDisabled();
  expect((await capital.detail(saved.id)).archivedAt).not.toBeNull();
  expect((await capital.comparison(saved.id)).baseline!.result).toEqual(
    comparison.baseline!.result
  );
  expect(financialBytes(await capital.snapshot(), byteIds)).toEqual(
    financialBytes(before, byteIds)
  );
  await copiedAndDownloaded(capital, saved.card, (await capital.comparison(saved.id)).baseline!);
  await capital.receipt('historical-stale-archive', {
    scenarioSetId: saved.id,
    publication,
    originalFinancialBytes: financialBytes(before, byteIds),
    finalFinancialBytes: financialBytes(await capital.snapshot(), byteIds),
  });
});

test('SRC-R3-007 CP-041 UI-R3-006 UI-R3-009: previous-round lags produce months 15 and 33 and simultaneous negative verdicts retain beyond-term demand', async ({
  capital,
}) => {
  const source = await capital.source();
  await capital.publication(
    capital.config.fundId,
    { id: source.projection.sourceConfigId, version: source.projection.sourceConfigVersion },
    (raw) => {
      const pipelines = raw['pipelineProfiles'] as Array<{
        stages: Array<Record<string, unknown>>;
      }>;
      const stages = pipelines[0]!.stages;
      stages.push({ ...stages[0], id: 's1', name: 'Series A', monthsToGraduate: 12 });
      stages.push({ ...stages[0], id: 's2', name: 'Series B', monthsToGraduate: 18 });
    }
  );
  await capital.reload();
  await guided(capital, 'B10 simultaneous capacity and timing verdicts');
  await step(capital, 'Source and budget');
  await capital.keyboard.fill(
    capital.dialog().getByLabel('Planning budget (USD, optional)', { exact: true }),
    '120'
  );
  await step(capital, 'Allocations');
  await capital.keyboard.fill(
    capital.dialog().getByLabel('Planned company count (optional)', { exact: true }),
    '60'
  );
  await step(capital, 'Follow-ons');
  for (const [index, lag] of [12, 18].entries()) {
    await capital.keyboard.activate(
      capital.dialog().getByRole('button', { name: 'Add follow-on round', exact: true })
    );
    const group = capital
      .dialog()
      .getByRole('group', { name: `Follow-on ${index + 1}`, exact: true });
    await capital.keyboard.fill(
      group.getByLabel('Round label', { exact: true }),
      index === 0 ? 'Series A' : 'Series B'
    );
    await capital.keyboard.select(group.getByLabel('Stage', { exact: true }), `s${index + 1}`);
    await capital.keyboard.select(group.getByLabel('Check policy', { exact: true }), 'fixed_check');
    for (const [label, value] of [
      ['Graduation (ratio)', '1'],
      ['Participation (ratio)', '1'],
      ['Check (USD)', '1'],
      ['Months after previous round', String(lag)],
    ] as const) {
      await capital.keyboard.fill(group.getByLabel(label, { exact: true }), value);
    }
  }
  await declarations(capital, capital.config.fundId);
  await review(capital);
  const saved = await save(capital);
  const comparison = await calculate(capital, saved.id, saved.card);
  const construction = comparison.baseline!.result.construction;
  expect(
    construction.monthlyDetail
      .filter(
        (row) => row.entryMonth === 3 && row.kind === 'follow_on' && row.countBasis === 'expected'
      )
      .map((row) => row.demandMonth)
  ).toEqual([15, 33]);
  expect(construction.verdicts).toMatchObject({
    inputSupport: 'complete',
    lifetimeCapacity: 'over_capacity',
    allocationBudget: 'allocation_gap',
    reserveEarmark: 'earmark_gap',
    timing: 'includes_beyond_term',
    staleness: 'unknown_current_source',
  });
  expect(construction.reconciliation.some((row) => Number(row.beyondTermFollowOnUsd) > 0)).toBe(
    true
  );
  const copied = await copiedAndDownloaded(capital, saved.card, comparison.baseline!);
  expect(copied).toContain('includes_beyond_term');
  expect(copied).toContain('over_capacity (under modeled assumptions)');
  expect(copied).toContain('allocation_gap (under modeled assumptions)');
  expect(copied).toContain('earmark_gap (under modeled assumptions)');
  await persisted(capital, saved.id, comparison.baseline!);
});

test('SRC-R3-007 UI-R3-006 UI-R3-007: unsupported fees and unresolved source month origin stay unsaved without scenario, run or snapshot acquisition', async ({
  capital,
}) => {
  const source = await capital.source();
  const unsupported = await capital.publication(
    capital.config.fundId,
    { id: source.projection.sourceConfigId, version: source.projection.sourceConfigVersion },
    (raw) => {
      const economics = raw['economicsAssumptions'] as {
        feeModel: { tiers: Array<{ basis: string }> };
      };
      economics.feeModel.tiers[0]!.basis = 'invested_capital';
    }
  );
  await capital.reload();
  const unsupportedBefore = await capital.snapshot();
  await guided(capital, 'B10 unsupported fee basis');
  await capital.keyboard.activate(
    capital.dialog().getByRole('button', { name: 'Review capital plan', exact: true })
  );
  await expect(capital.dialog().getByRole('region', { name: 'Validation errors' })).toContainText(
    'FEE_BASIS_UNSUPPORTED'
  );
  await expect(capital.dialog().getByRole('region', { name: 'Validation errors' })).toContainText(
    'Capital Planning currently supports fee tiers based on committed capital.'
  );
  await expect(
    capital.dialog().getByRole('button', { name: 'Save capital scenario', exact: true })
  ).toBeDisabled();
  expect((await capital.snapshot()).sha256).toBe(unsupportedBefore.sha256);
  await capital.keyboard.activate(
    capital.dialog().getByRole('button', { name: 'Close and keep draft', exact: true })
  );
  await capital.publication(
    capital.config.fundId,
    { id: unsupported.id, version: unsupported.version },
    (raw) => {
      const fee = raw['economicsAssumptions'] as { feeModel: { tiers: Array<{ basis: string }> } };
      fee.feeModel.tiers[0]!.basis = 'committed_capital';
      const economics = raw['economicsAssumptions'] as {
        expenseModel: { annualExpenses?: unknown[] };
      };
      delete economics.expenseModel.annualExpenses;
      raw['fundExpenses'] = [
        { id: 'b10-monthly', category: 'admin', monthlyAmount: 1, startMonth: 0, endMonth: 23 },
      ];
    }
  );
  await capital.reload();
  const before = await capital.snapshot();
  await guided(capital, 'B10 unresolved time origin', { skipTime: true });
  await capital.keyboard.activate(
    capital.dialog().getByRole('button', { name: 'Review capital plan', exact: true })
  );
  await expect(capital.dialog().getByRole('region', { name: 'Validation errors' })).toContainText(
    'TIME_ORIGIN_UNRESOLVED'
  );
  await expect(
    capital.dialog().getByRole('button', { name: 'Save capital scenario', exact: true })
  ).toBeDisabled();
  await expect(capital.dialog().getByRole('button', { name: /^Copy capital memo/ })).toHaveCount(0);
  await expect(capital.dialog().getByRole('button', { name: /^Calculate capital/ })).toHaveCount(0);
  await step(capital, 'Review');
  await expect(capital.dialog().getByText('UNSAVED PREVIEW', { exact: true })).toBeVisible();
  expect((await capital.snapshot()).sha256).toBe(before.sha256);
  await capital.receipt('time-origin-refusal', {
    source: await capital.source(),
    beforeHash: before.sha256,
    afterHash: (await capital.snapshot()).sha256,
  });
});
