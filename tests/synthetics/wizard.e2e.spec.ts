import { test, expect } from '@playwright/test';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
test('wizard → simulate → chart', async ({ page }) => {
  await page.goto(BASE);
  await page.click('[data-test="start-wizard"]');
  await page.fill('[data-test="input-checks"]', '10');
  await page.click('[data-test="next"]');
  await page.click('[data-test="run-simulation"]');
  await page.waitForSelector('[data-test="chart-ready"]', { timeout: 30000 });
  expect(await page.$('[data-test="chart-ready"]')).toBeTruthy();
});
