import { test, expect } from '@playwright/test';

async function setupDemo(page) {
  await page.addInitScript(() => {
    localStorage.setItem('DEMO_TOOLBAR', '1');
    localStorage.setItem('FF_NEW_IA', 'true');
    localStorage.setItem('FF_ENABLE_SELECTOR_KPIS', 'true');
    localStorage.setItem('DEMO_PERSONA', 'GP');
  });
  await page.goto('/');
  await page.reload();
}

test.describe('CSV Export', () => {
  test('Export CSV button downloads a CSV with headers', async ({ page }) => {
    await setupDemo(page);
    await page.getByRole('button', { name: /^Compare Scenarios$/ }).click();
    const exportBtn = page.getByRole('button', { name: /^Export CSV$/ });
    await expect(exportBtn).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await exportBtn.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename().toLowerCase()).toMatch(/\.csv$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream!) chunks.push(c as Buffer);
    const csvText = Buffer.concat(chunks).toString('utf-8');
    const [firstLine] = csvText.split(/\r?\n/);
    expect(firstLine && firstLine.includes(',')).toBeTruthy();
  });
});
