import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const NARRATIVE_TYPES = [
  { id: 'no_dpi', label: 'No DPI' },
  { id: 'methodology', label: 'Methodology' },
  { id: 'portfolio_update', label: 'Portfolio update' },
  { id: 'risk_disclosure', label: 'Risk disclosure' },
] as const;

function collectRuntimeFailures(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const badApiResponses: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText}`);
  });

  page.on('response', (response) => {
    const url = response.url();
    if (url.includes('/api/') && response.status() >= 400) {
      badApiResponses.push(`${response.status()} ${url}`);
    }
  });

  return {
    assertClean() {
      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
      expect(failedRequests).toEqual([]);
      expect(badApiResponses).toEqual([]);
    },
  };
}

async function clickWhenEnabled(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect(locator).toBeEnabled();
  await locator.click();
}

async function readDownloadText(downloadPath: string | null) {
  if (downloadPath === null) {
    throw new Error('Download path was not available.');
  }
  return readFile(downloadPath, 'utf8');
}

test.describe('LP reporting package flow', () => {
  test('stores package JSON and creates CSV from the stored JSON artifact', async ({
    page,
    request,
  }) => {
    const runtimeFailures = collectRuntimeFailures(page);

    const fundsResponse = await request.get('/api/funds');
    const fundsBody = await fundsResponse.text();
    expect(fundsResponse.status(), fundsBody).toBe(200);

    const funds = JSON.parse(fundsBody) as unknown;
    expect(Array.isArray(funds)).toBe(true);
    expect(funds).not.toHaveLength(0);

    await page.goto('/lp-reporting/metrics', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Metrics' })).toBeVisible();

    await page.getByLabel('As-of date').fill('2026-03-31');
    await page.getByLabel('Run type').selectOption('quarterly_report');
    await page.getByLabel('Perspective').selectOption('lp_net');
    await page.getByRole('button', { name: 'Run metrics' }).click();

    await expect(page.getByTestId('metrics-results')).toBeVisible();
    await clickWhenEnabled(page.getByTestId('metrics-commit-button'));
    await expect(page.getByTestId('metrics-commit-result')).toContainText('Draft saved');

    await page.getByLabel('Source date').fill('2026-03-31');
    await page.getByLabel('Description').fill('Quarterly board package and valuation backup.');
    await clickWhenEnabled(page.getByTestId('metric-run-evidence-submit'));
    await expect(page.getByTestId('metric-run-evidence-record')).toHaveCount(1);
    await expect(page.getByTestId('metric-run-evidence-count')).toContainText('1 record');

    await clickWhenEnabled(page.getByTestId('metric-run-approve-button'));
    await expect(page.getByTestId('metric-run-status-badge')).toContainText('approved');
    await clickWhenEnabled(page.getByTestId('metric-run-lock-button'));
    await expect(page.getByTestId('metric-run-status-badge')).toContainText('locked');

    for (const narrativeType of NARRATIVE_TYPES) {
      await clickWhenEnabled(page.getByTestId(`metric-run-narrative-create-${narrativeType.id}`));
    }

    await expect(page.getByTestId('metric-run-narrative-record')).toHaveCount(
      NARRATIVE_TYPES.length
    );

    for (const [index, narrativeType] of NARRATIVE_TYPES.entries()) {
      const record = page.getByTestId('metric-run-narrative-record').nth(index);

      await record
        .getByRole('textbox', { name: new RegExp(narrativeType.label, 'i') })
        .fill(
          `${narrativeType.label} reviewed narrative for the automated LP reporting package smoke test.`
        );
      await clickWhenEnabled(record.getByRole('button', { name: /save edit/i }));
      await clickWhenEnabled(record.getByRole('button', { name: /mark reviewed/i }));
      await expect(record).toContainText('reviewed');
      await clickWhenEnabled(record.getByRole('button', { name: /^approve$/i }));
      await expect(record).toContainText('approved');
    }

    await clickWhenEnabled(page.getByTestId('metric-run-report-package-assemble'));
    await expect(page.getByTestId('metric-run-report-package-result')).toContainText(
      'Package assembled'
    );
    await expect(page.getByTestId('metric-run-report-package-render-preview')).toBeVisible();

    await clickWhenEnabled(page.getByTestId('metric-run-report-package-store-json'));
    await expect(page.getByTestId('metric-run-report-package-stored-json-result')).toContainText(
      'Stored JSON ready'
    );

    const jsonDownloadPromise = page.waitForEvent('download');
    await clickWhenEnabled(page.getByTestId('metric-run-report-package-export-stored-json'));
    const jsonDownload = await jsonDownloadPromise;
    expect(jsonDownload.suggestedFilename()).toMatch(/\.json$/i);

    const jsonText = await readDownloadText(await jsonDownload.path());
    expect(() => JSON.parse(jsonText)).not.toThrow();
    expect(jsonText).toContain('reportPackageId');

    await clickWhenEnabled(page.getByTestId('metric-run-report-package-store-csv'));
    await expect(page.getByTestId('metric-run-report-package-stored-csv-result')).toContainText(
      'Stored CSV ready'
    );

    const csvDownloadPromise = page.waitForEvent('download');
    await clickWhenEnabled(page.getByTestId('metric-run-report-package-export-stored-csv'));
    const csvDownload = await csvDownloadPromise;
    expect(csvDownload.suggestedFilename()).toMatch(/\.csv$/i);

    const csvText = await readDownloadText(await csvDownload.path());
    expect(csvText.length).toBeGreaterThan(0);
    expect(csvText).toContain(',');
    expect(csvText).toContain('\n');
    expect(csvText).not.toContain('\r\n');

    runtimeFailures.assertClean();
  });
});
