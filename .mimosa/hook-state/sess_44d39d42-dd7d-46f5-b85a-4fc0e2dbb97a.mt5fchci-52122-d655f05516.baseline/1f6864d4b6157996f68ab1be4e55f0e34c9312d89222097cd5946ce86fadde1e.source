import { expect, test, type Page, type Route } from '@playwright/test';

import type {
  QuarterlyReviewCategory,
  QuarterlyReviewCurrentBasisResponse,
} from '../../shared/contracts/internal-analysis/quarterly-review-v1.contract';
import type {
  AnalysisDraftV1,
  AnalysisReferenceV1,
} from '../../shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract';

// Browser mocks own client/API state behavior. PostgreSQL transaction races and corrupt-N audit
// preservation are proved in tests/integration/internal-analysis/quarterly-review.pg.test.ts.
const FUND_ID = 1301;
const DRAFT_ID = 41;
const REVIEW_PATH = `/fund-model-results/${FUND_ID}/internal-analysis`;
const REVIEW_URL = `/api/funds/${FUND_ID}/internal-analysis/drafts/${DRAFT_ID}/quarterly-review`;
const CATEGORIES: QuarterlyReviewCategory[] = [
  'cases_probabilities',
  'kpis',
  'valuation_fmv',
  'reserve_plan',
  'qualitative_risks',
];
const CATEGORY_LABELS = [
  'Cases & probabilities',
  'KPIs',
  'Valuation & FMV',
  'Reserve strategy',
  'Risks & mitigations',
] as const;

const FUND = {
  id: FUND_ID,
  name: 'Quarterly Review Fund',
  size: 75_000_000,
  managementFee: 0.02,
  carryPercentage: 0.2,
  vintageYear: 2025,
  deployedCapital: 18_000_000,
  status: 'active',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  termYears: 10,
};

const BASIS = {
  financialFactsSnapshotId: 87,
  knowledgeCutoff: '2026-06-30T23:59:59.000Z',
  forecastFundSnapshotId: null,
  reserveReferenceId: null,
  economicsReferenceId: null,
};

const PERIOD = {
  periodKind: 'quarterly' as const,
  periodStart: '2026-04-01',
  periodEnd: '2026-06-30',
};

interface ReplayRecord {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

interface MockTracker {
  role: string;
  mutationCounts: Record<string, number>;
  idempotencyKeys: Record<string, string>;
  unexpectedRequests: string[];
  reviewReads: number;
  staleResponses: number;
  crossSessionRefresh: () => void;
}

function fulfillJson(
  route: Route,
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers,
    body: JSON.stringify(body),
  });
}

function makePendingItem(id: number, category: QuarterlyReviewCategory) {
  return {
    id,
    category,
    state: 'pending' as const,
    note: null,
    reviewedBy: null,
    reviewedAt: null,
    changeReference: null,
    followUp: null,
    version: 1,
    etag: `W/"review-item-${id}-v1"`,
  };
}

function makeCompany(id: number, portfolioCompanyId: number, companyName: string) {
  return {
    id,
    portfolioCompanyId,
    companyName,
    waivedAt: null,
    waivedBy: null,
    waiverReason: null,
    version: 1,
    etag: `W/"review-company-${id}-v1"`,
    items: CATEGORIES.map((category, index) => makePendingItem(id * 10 + index, category)),
  };
}

async function installQuarterlyReviewApi(
  page: Page,
  options: { initialRosterState?: 'corrupt' | 'missing' | 'current'; mixedBasis?: boolean } = {}
): Promise<MockTracker> {
  let companies = [makeCompany(201, 501, 'Alpha Systems'), makeCompany(202, 502, 'Beta Health')];
  let rosterState: 'corrupt' | 'missing' | 'current' = options.initialRosterState ?? 'corrupt';
  let draftVersion = 1;
  const tracker: MockTracker = {
    role: 'operator',
    mutationCounts: {},
    idempotencyKeys: {},
    unexpectedRequests: [],
    reviewReads: 0,
    staleResponses: 0,
    crossSessionRefresh: () => {
      draftVersion += 1;
      rosterState = 'current';
      companies = companies.map((company) => ({
        ...company,
        waivedAt: null,
        waivedBy: null,
        waiverReason: null,
        version: company.version + 1,
        etag: `W/"review-company-${company.id}-v${company.version + 1}"`,
        items: company.items.map((item) => ({
          ...item,
          state: 'pending' as const,
          note: null,
          reviewedBy: null,
          reviewedAt: null,
          changeReference: null,
          followUp: null,
          version: item.version + 1,
          etag: `W/"review-item-${item.id}-v${item.version + 1}"`,
        })),
      }));
    },
  };
  const replayCache = new Map<string, ReplayRecord>();
  let savedAt: string | null = null;
  let reference: AnalysisReferenceV1 | null = null;
  let receiptId = 900;

  const draft = (): AnalysisDraftV1 => ({
    contractVersion: 'analysis-reference-snapshot-v1',
    draftId: DRAFT_ID,
    fundId: FUND_ID,
    period: PERIOD,
    basis: BASIS,
    sourceReferenceId: null,
    savedAt,
    version: draftVersion,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: savedAt ?? '2026-07-01T00:00:00.000Z',
  });

  const completion = () => {
    const pendingItemCount = companies.reduce(
      (total, company) =>
        total +
        (company.waivedAt === null
          ? company.items.filter((item) => item.state === 'pending').length
          : 0),
      0
    );
    const completedCompanyCount = companies.filter(
      (company) =>
        company.waivedAt !== null || company.items.every((item) => item.state !== 'pending')
    ).length;
    return {
      companyCount: companies.length,
      completedCompanyCount,
      pendingCompanyCount: companies.length - completedCompanyCount,
      pendingItemCount,
    };
  };

  const currentReview = (): QuarterlyReviewCurrentBasisResponse => {
    const currentCompletion = completion();
    return {
      contractVersion: 'quarterly-review-v1',
      fundId: FUND_ID,
      draftId: DRAFT_ID,
      draftVersion,
      financialFactsSnapshotId: BASIS.financialFactsSnapshotId,
      draftEtag: `W/"analysis-draft-${DRAFT_ID}-v${draftVersion}"`,
      requiresRefresh: false,
      rosterId: 101,
      companies,
      completion: currentCompletion,
      canFinalize:
        currentCompletion.pendingCompanyCount === 0 && currentCompletion.pendingItemCount === 0,
      capabilities: {
        operatingDecision: {
          availability: 'unavailable',
          reason: 'dependency_not_available',
        },
      },
    };
  };

  const replayOrRun = async (
    route: Route,
    operation: string,
    run: () => ReplayRecord
  ): Promise<void> => {
    const key = (await route.request().allHeaders())['idempotency-key'];
    if (!key) {
      await fulfillJson(route, { error: 'IDEMPOTENCY_KEY_REQUIRED' }, 400);
      return;
    }
    const cacheKey = `${operation}:${key}`;
    const replay = replayCache.get(cacheKey);
    if (replay) {
      await fulfillJson(route, replay.body, replay.status, replay.headers);
      return;
    }

    const result = run();
    replayCache.set(cacheKey, result);
    if (result.status < 400) {
      tracker.mutationCounts[operation] = (tracker.mutationCounts[operation] ?? 0) + 1;
      tracker.idempotencyKeys[operation] = key;
    }
    await fulfillJson(route, result.body, result.status, result.headers);
  };

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (method === 'GET' && url.pathname === '/api/auth/session') {
      await fulfillJson(route, {
        user: {
          id: '7',
          email: `${tracker.role}@example.com`,
          role: tracker.role,
          fundIds: [FUND_ID],
        },
      });
      return;
    }

    if (method === 'GET' && url.pathname === '/api/auth/csrf') {
      await fulfillJson(route, { csrfToken: 'quarterly-review-csrf' });
      return;
    }

    if (method === 'GET' && url.pathname === '/api/funds') {
      await fulfillJson(route, [FUND]);
      return;
    }

    if (method === 'GET' && url.pathname === `/api/funds/${FUND_ID}/metrics`) {
      await fulfillJson(route, {
        totalCommitted: FUND.size,
        totalInvested: FUND.deployedCapital,
        totalValue: FUND.deployedCapital,
        irr: 0,
        moic: 1,
        dpi: 0,
        tvpi: 1,
        activeInvestments: 2,
        exited: 0,
        avgCheckSize: FUND.deployedCapital / 2,
        deploymentRate: 24,
        remainingCapital: FUND.size - FUND.deployedCapital,
      });
      return;
    }

    if (method === 'GET' && url.pathname === `/api/funds/${FUND_ID}/internal-analysis/drafts`) {
      await fulfillJson(route, { drafts: [draft()] });
      return;
    }

    if (method === 'GET' && url.pathname === `/api/funds/${FUND_ID}/internal-analysis/references`) {
      await fulfillJson(route, { references: reference === null ? [] : [reference] });
      return;
    }

    if (method === 'GET' && url.pathname === REVIEW_URL) {
      tracker.reviewReads += 1;
      if (rosterState === 'corrupt') {
        await fulfillJson(
          route,
          {
            error: 'QUARTERLY_REVIEW_ROSTER_CORRUPT',
            details: {
              draftId: DRAFT_ID,
              draftVersion,
              financialFactsSnapshotId: BASIS.financialFactsSnapshotId,
              expectedCompanyCount: 2,
              actualCompanyCount: 1,
            },
          },
          409,
          { ETag: `W/"analysis-draft-${DRAFT_ID}-v${draftVersion}"` }
        );
        return;
      }
      if (rosterState === 'missing') {
        await fulfillJson(route, {
          ...currentReview(),
          rosterId: null,
          companies: [],
          requiresRefresh: true,
          completion: {
            companyCount: 0,
            completedCompanyCount: 0,
            pendingCompanyCount: 0,
            pendingItemCount: 0,
          },
          canFinalize: false,
        });
        return;
      }
      await fulfillJson(route, currentReview());
      return;
    }

    if (
      method === 'POST' &&
      url.pathname === `/api/funds/${FUND_ID}/internal-analysis/drafts/${DRAFT_ID}/refresh`
    ) {
      await replayOrRun(route, 'draft_refresh', () => {
        const ifMatch = request.headers()['if-match'];
        if (ifMatch !== `W/"analysis-draft-${DRAFT_ID}-v${draftVersion}"`) {
          tracker.staleResponses += 1;
          return {
            status: 412,
            body: { error: 'DRAFT_VERSION_CONFLICT', message: 'Draft changed.' },
          };
        }
        rosterState = 'current';
        draftVersion += 1;
        return {
          status: 200,
          body: {
            result: {
              receiptId: ++receiptId,
              operation: 'draft_refresh',
              draftId: DRAFT_ID,
              targetId: DRAFT_ID,
              resultingDraftVersion: draftVersion,
            },
          },
        };
      });
      return;
    }

    const itemMatch = url.pathname.match(
      new RegExp(`^${REVIEW_URL}/companies/(\\d+)/items/([a-z_]+)$`)
    );
    if (method === 'PATCH' && itemMatch) {
      const companyId = Number(itemMatch[1]);
      const category = itemMatch[2] as QuarterlyReviewCategory;
      await replayOrRun(route, 'review_item_update', () => {
        const company = companies.find((candidate) => candidate.id === companyId);
        const item = company?.items.find((candidate) => candidate.category === category);
        if (!item) return { status: 404, body: { error: 'NOT_FOUND' } };
        const ifMatch = request.headers()['if-match'];
        if (ifMatch !== item.etag) {
          tracker.staleResponses += 1;
          return {
            status: 412,
            body: { error: 'ITEM_VERSION_CONFLICT', message: 'Review item changed.' },
          };
        }
        const input = JSON.parse(request.postData() ?? '{}') as {
          state?: 'changed' | 'reviewed_no_change';
          note?: string;
          changeReference?: {
            kind: 'internal_route';
            path: string;
            label: string;
          };
          followUpTaskId?: number;
        };
        if (!input.state || !input.note) {
          return { status: 400, body: { error: 'INVALID_REVIEW_ITEM' } };
        }
        Object.assign(item, {
          state: input.state,
          note: input.note,
          reviewedBy: 7,
          reviewedAt: '2026-07-02T12:00:00.000Z',
          changeReference: input.state === 'changed' ? input.changeReference : null,
          followUp:
            input.state === 'changed' && input.followUpTaskId !== undefined
              ? {
                  availability: 'linked' as const,
                  target: { kind: 'task' as const, id: input.followUpTaskId },
                }
              : null,
          version: item.version + 1,
          etag: `W/"review-item-${item.id}-v${item.version + 1}"`,
        });
        return {
          status: 200,
          body: {
            result: {
              receiptId: ++receiptId,
              operation: 'review_item_update',
              draftId: DRAFT_ID,
              targetId: item.id,
              resultingRowVersion: item.version,
            },
          },
        };
      });
      return;
    }

    const waiverMatch = url.pathname.match(new RegExp(`^${REVIEW_URL}/companies/(\\d+)/waiver$`));
    if (method === 'POST' && waiverMatch) {
      const companyId = Number(waiverMatch[1]);
      await replayOrRun(route, 'company_waive', () => {
        const company = companies.find((candidate) => candidate.id === companyId);
        const input = JSON.parse(request.postData() ?? '{}') as { reason?: string };
        if (!company || !input.reason) return { status: 400, body: { error: 'INVALID_WAIVER' } };
        const ifMatch = request.headers()['if-match'];
        if (ifMatch !== company.etag) {
          tracker.staleResponses += 1;
          return {
            status: 412,
            body: { error: 'COMPANY_VERSION_CONFLICT', message: 'Company review changed.' },
          };
        }
        company.waivedAt = '2026-07-02T13:00:00.000Z';
        company.waivedBy = 7;
        company.waiverReason = input.reason;
        company.version += 1;
        company.etag = `W/"review-company-${company.id}-v${company.version}"`;
        return {
          status: 200,
          body: {
            result: {
              receiptId: ++receiptId,
              operation: 'company_waive',
              draftId: DRAFT_ID,
              targetId: company.id,
              resultingRowVersion: company.version,
            },
          },
        };
      });
      return;
    }

    if (
      method === 'PATCH' &&
      url.pathname ===
        `/api/funds/${FUND_ID}/internal-analysis/drafts/${DRAFT_ID}/economics-reference`
    ) {
      await replayOrRun(route, 'economics_reference_replace', () => {
        const ifMatch = request.headers()['if-match'];
        if (ifMatch !== `W/"analysis-draft-${DRAFT_ID}-v${draftVersion}"`) {
          tracker.staleResponses += 1;
          return {
            status: 412,
            body: { error: 'DRAFT_VERSION_CONFLICT', message: 'Draft changed.' },
          };
        }
        return {
          status: 200,
          body: {
            result: {
              receiptId: ++receiptId,
              operation: 'economics_reference_replace',
              draftId: DRAFT_ID,
              targetId: DRAFT_ID,
              resultingDraftVersion: draftVersion,
            },
          },
        };
      });
      return;
    }

    if (
      method === 'POST' &&
      url.pathname === `/api/funds/${FUND_ID}/internal-analysis/drafts/${DRAFT_ID}/save`
    ) {
      await replayOrRun(route, 'draft_save', () => {
        const input = JSON.parse(request.postData() ?? '{}') as {
          acknowledgeMixedBasis?: boolean;
        };
        if (options.mixedBasis && input.acknowledgeMixedBasis !== true) {
          return {
            status: 409,
            body: {
              error: 'MIXED_FACTS_BASIS',
              message: 'Pinned components do not all resolve to the draft facts basis.',
              details: { unsafeInternalValue: 'not rendered' },
            },
          };
        }
        savedAt = '2026-07-02T14:00:00.000Z';
        reference = {
          contractVersion: 'analysis-reference-snapshot-v1',
          referenceId: 601,
          fundId: FUND_ID,
          period: PERIOD,
          basis: BASIS,
          mixedBasisAtSave: options.mixedBasis === true,
          supersedesReferenceId: null,
          sourceDraftId: DRAFT_ID,
          createdBy: 7,
          createdAt: savedAt,
        };
        return { status: 201, body: { reference } };
      });
      return;
    }

    if (
      method === 'GET' &&
      (url.pathname === `/api/funds/${FUND_ID}/internal-analysis/narratives` ||
        url.pathname === `/api/funds/${FUND_ID}/internal-analysis/notes`)
    ) {
      await fulfillJson(
        route,
        url.pathname.endsWith('/notes') ? { notes: [] } : { narrative: null }
      );
      return;
    }

    if (
      url.pathname === '/api/telemetry/wizard' ||
      url.pathname === '/api/metrics/rum' ||
      url.pathname.startsWith('/api/v1/image/')
    ) {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    tracker.unexpectedRequests.push(`${method} ${url.pathname}${url.search}`);
    await fulfillJson(route, { error: 'UNEXPECTED_QUARTERLY_REVIEW_REQUEST' }, 500);
  });

  return tracker;
}

test('legacy missing roster stays read-only until an authorized refresh', async ({ page }) => {
  const tracker = await installQuarterlyReviewApi(page, { initialRosterState: 'missing' });

  await page.goto(REVIEW_PATH);
  await expect(page.getByRole('alert')).toContainText('Quarterly review roster is missing');
  await expect(page.getByRole('button', { name: 'Refresh quarterly review' })).toHaveCount(0);
  expect(tracker.mutationCounts).toEqual({});

  tracker.role = 'analyst';
  await page.reload();
  await page.getByRole('button', { name: 'Refresh quarterly review' }).click();
  await expect(
    page.getByRole('region', { name: `Quarterly review for draft ${DRAFT_ID}` })
  ).toBeVisible();
  expect(tracker.mutationCounts).toEqual({ draft_refresh: 1 });
  expect(tracker.unexpectedRequests).toEqual([]);
});

test('quarterly review recovers stale sessions, acknowledges mixed basis, and replays safely', async ({
  page,
}) => {
  const tracker = await installQuarterlyReviewApi(page, { mixedBasis: true });

  await page.goto(REVIEW_PATH);
  await expect(page.getByRole('alert')).toContainText(
    'Roster integrity check failed: expected 2 companies, found 1.'
  );
  await expect(page.getByRole('button', { name: 'Refresh quarterly review' })).toHaveCount(0);

  tracker.role = 'analyst';
  await page.reload();
  await expect(page.getByRole('button', { name: 'Refresh quarterly review' })).toBeVisible();
  await page.getByRole('button', { name: 'Refresh quarterly review' }).click();

  const review = page.getByRole('region', { name: `Quarterly review for draft ${DRAFT_ID}` });
  await expect(review).toBeVisible();
  await expect(review.getByText('0 of 10 items complete')).toBeVisible();
  await expect(review.getByRole('button', { name: 'Waive company review' })).toHaveCount(0);
  await expect(review.getByRole('button', { name: 'Finalize reference' })).toBeDisabled();

  const alpha = review.locator('article').filter({ hasText: 'Alpha Systems' });
  const economicsKey = 'economics-before-later-transitions';
  const economicsStatus = await page.evaluate(
    async ({ draftId, fundId, idempotencyKey }) => {
      const response = await fetch(
        `/api/funds/${fundId}/internal-analysis/drafts/${draftId}/economics-reference`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'If-Match': `W/"analysis-draft-${draftId}-v2"`,
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({ economicsReferenceId: null }),
        }
      );
      return response.status;
    },
    { draftId: DRAFT_ID, fundId: FUND_ID, idempotencyKey: economicsKey }
  );
  expect(economicsStatus).toBe(200);

  const staleEditor = alpha.locator('fieldset').filter({ hasText: CATEGORY_LABELS[0] });
  await staleEditor.getByRole('button', { name: 'Reviewed — no change' }).click();
  await staleEditor.getByLabel(`${CATEGORY_LABELS[0]} review note`).fill('First session review.');
  await staleEditor.getByRole('button', { name: 'Save review item' }).click();
  await expect(review.getByText('1 of 10 items complete')).toBeVisible();

  const readsBeforeRace = tracker.reviewReads;
  tracker.crossSessionRefresh();
  const staleSecondEditor = alpha.locator('fieldset').filter({ hasText: CATEGORY_LABELS[1] });
  await staleSecondEditor.getByRole('button', { name: 'Reviewed — no change' }).click();
  await staleSecondEditor
    .getByLabel(`${CATEGORY_LABELS[1]} review note`)
    .fill('Stale session review.');
  await staleSecondEditor.getByRole('button', { name: 'Save review item' }).click();
  await expect(review.getByText('0 of 10 items complete')).toBeVisible();
  expect(tracker.staleResponses).toBe(1);
  expect(tracker.reviewReads).toBeGreaterThan(readsBeforeRace);

  const refreshedAlpha = review.locator('article').filter({ hasText: 'Alpha Systems' });
  for (const [index, label] of CATEGORY_LABELS.entries()) {
    const editor = refreshedAlpha.locator('fieldset').filter({ hasText: label });
    await editor
      .getByRole('button', { name: index === 0 ? 'Changed' : 'Reviewed — no change' })
      .click();
    await editor.getByLabel(`${label} review note`).fill(`Analyst reviewed ${label}`);
    if (index === 0) {
      await expect(editor.getByLabel(`${label} internal change link`)).toHaveValue(
        `/fund-model-results/${FUND_ID}/scenarios`
      );
      await editor.getByLabel(`${label} optional follow-up task`).fill('88');
    }
    await editor.getByRole('button', { name: 'Save review item' }).click();
    await expect(review.getByText(`${index + 1} of 10 items complete`)).toBeVisible();
  }

  tracker.role = 'partner';
  await page.reload();
  const partnerReview = page.getByRole('region', {
    name: `Quarterly review for draft ${DRAFT_ID}`,
  });
  const beta = partnerReview.locator('article').filter({ hasText: 'Beta Health' });
  await beta.getByLabel('Waiver reason').fill('Partner accepted documented exception.');
  await beta.getByRole('button', { name: 'Waive company review' }).click();
  await expect(beta.getByText('Partner accepted documented exception.')).toBeVisible();
  await expect(partnerReview.getByText('2 of 2 companies complete')).toBeVisible();
  await expect(partnerReview.getByRole('button', { name: 'Finalize reference' })).toBeEnabled();
  await partnerReview.getByRole('button', { name: 'Finalize reference' }).click();
  await expect(partnerReview.getByRole('alert')).toContainText('mixed facts basis');
  const acknowledgement = partnerReview.getByRole('checkbox', {
    name: /acknowledge.*mixed facts basis/i,
  });
  await expect(
    partnerReview.getByRole('button', { name: 'Finalize mixed-basis reference' })
  ).toBeDisabled();
  await acknowledgement.check();
  await partnerReview.getByRole('button', { name: 'Finalize mixed-basis reference' }).click();

  await expect(page.getByTestId('analysis-reference-601')).toBeVisible();
  await expect(page.getByTestId('analysis-reference-601-mixed-basis')).toBeVisible();
  await expect(page.getByTestId(`analysis-draft-${DRAFT_ID}`)).toHaveCount(0);

  const refreshKey = tracker.idempotencyKeys.draft_refresh;
  const waiverKey = tracker.idempotencyKeys.company_waive;
  const saveKey = tracker.idempotencyKeys.draft_save;
  const recordedEconomicsKey = tracker.idempotencyKeys.economics_reference_replace;
  expect(refreshKey).toBeTruthy();
  expect(waiverKey).toBeTruthy();
  expect(saveKey).toBeTruthy();
  expect(recordedEconomicsKey).toBe(economicsKey);
  const countsBeforeReplay = { ...tracker.mutationCounts };

  const replayStatuses = await page.evaluate(
    async ({
      draftId,
      fundId,
      refreshIdempotencyKey,
      economicsIdempotencyKey,
      waiverIdempotencyKey,
      saveIdempotencyKey,
    }) => {
      const refreshResponse = await fetch(
        `/api/funds/${fundId}/internal-analysis/drafts/${draftId}/refresh`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'If-Match': 'W/"analysis-draft-41-v1"',
            'Idempotency-Key': refreshIdempotencyKey,
          },
          body: '{}',
        }
      );
      const economicsResponse = await fetch(
        `/api/funds/${fundId}/internal-analysis/drafts/${draftId}/economics-reference`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'If-Match': `W/"analysis-draft-${draftId}-v2"`,
            'Idempotency-Key': economicsIdempotencyKey,
          },
          body: JSON.stringify({ economicsReferenceId: null }),
        }
      );
      const waiverResponse = await fetch(
        `/api/funds/${fundId}/internal-analysis/drafts/${draftId}/quarterly-review/companies/202/waiver`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'If-Match': 'W/"review-company-202-v1"',
            'Idempotency-Key': waiverIdempotencyKey,
          },
          body: JSON.stringify({ reason: 'Partner accepted documented exception.' }),
        }
      );
      const saveResponse = await fetch(
        `/api/funds/${fundId}/internal-analysis/drafts/${draftId}/save`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'If-Match': `W/"analysis-draft-${draftId}-v2"`,
            'Idempotency-Key': saveIdempotencyKey,
          },
          body: JSON.stringify({ acknowledgeMixedBasis: true }),
        }
      );
      const unseenStaleResponse = await fetch(
        `/api/funds/${fundId}/internal-analysis/drafts/${draftId}/refresh`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'If-Match': `W/"analysis-draft-${draftId}-v1"`,
            'Idempotency-Key': 'unseen-stale-refresh-key',
          },
          body: '{}',
        }
      );
      return [
        refreshResponse.status,
        economicsResponse.status,
        waiverResponse.status,
        saveResponse.status,
        unseenStaleResponse.status,
      ];
    },
    {
      draftId: DRAFT_ID,
      fundId: FUND_ID,
      refreshIdempotencyKey: refreshKey,
      economicsIdempotencyKey: recordedEconomicsKey,
      waiverIdempotencyKey: waiverKey,
      saveIdempotencyKey: saveKey,
    }
  );

  expect(replayStatuses).toEqual([200, 200, 200, 201, 412]);
  expect(tracker.mutationCounts).toEqual(countsBeforeReplay);
  await page.reload();
  await expect(page.getByTestId('analysis-reference-601')).toBeVisible();
  await expect(page.getByTestId('analysis-reference-601-mixed-basis')).toBeVisible();
  await expect(page.getByTestId(`analysis-draft-${DRAFT_ID}`)).toHaveCount(0);
  expect(tracker.unexpectedRequests).toEqual([]);
});
