import { test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

test('collect HAR + console for fund setup step2→3', async ({ browser }) => {
  mkdirSync('triage-output', { recursive: true });
  const context = await browser.newContext({
    recordHar: { path: 'triage-output/network.har', mode: 'minimal' },
    viewport: { width: 1280, height: 720 }, // Consistent viewport
  });
  const page = await context.newPage();

  const consoleLines: string[] = [];
  const errors: string[] = [];
  
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    consoleLines.push(`[${type.toUpperCase()}] ${text}`);
  });
  
  page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}`));
  page.on('requestfailed', req => errors.push(`NETWORK FAIL: ${req.url()} - ${req.failure()?.errorText}`));

  const base = process.env.TRIAGE_URL ?? 'http://localhost:5173';
  
  // Navigate to step 2
  await page.goto(`${base}/fund-setup?step=2`);
  
  // Wait for page to stabilize
  await page.waitForLoadState('networkidle');
  
  // TODO: Fill minimal required fields here if your step2 needs them.
  // Example (uncomment and adjust as needed):
  // await page.getByLabel('Target Size').fill('25000000');
  // await page.getByLabel('Currency').selectOption('USD');
  // await page.getByLabel('Management Fee').fill('2');
  // await page.getByLabel('Carry').fill('20');

  // Click Next to navigate to step 3
  const nextButton = page.getByRole('button', { name: /next/i });
  await nextButton.click();

  // Give it a moment to settle and capture any async operations
  await page.waitForTimeout(2000);
  
  // Try to wait for step 3 to load (adjust selector as needed)
  try {
    await page.waitForSelector('[data-step="3"]', { timeout: 5000 });
  } catch {
    // Step might not have loaded, which is part of what we're debugging
  }

  await context.close();
  
  // Write collected data
  writeFileSync('triage-output/console.txt', consoleLines.join('\n') || 'No console output captured');
  writeFileSync('triage-output/errors.txt', errors.join('\n') || 'No errors captured');
  
  console.log('✓ Triage data collected:');
  console.log('  - network.har (all network traffic)');
  console.log('  - console.txt (all console output)');
  console.log('  - errors.txt (page errors and network failures)');
});