import { test, expect } from './fixtures/fund';

test.describe('Portfolio add company', () => {
  test('persists a new company from the Companies tab', async ({ page }) => {
    await page.goto('/portfolio');
    await page.waitForTimeout(500);

    // SKIP: portfolio add-company browser check requires an authenticated session when login gating is enabled
    test.skip(page.url().includes('/login'), 'Authentication required');

    const companyName = `GP Portfolio Company ${Date.now()}`;
    const addCompanyButton = page.getByTestId('portfolio-add-company-button');

    await expect(addCompanyButton).toBeVisible();
    await addCompanyButton.click();

    await expect(page.getByTestId('portfolio-add-company-dialog')).toBeVisible();
    await page.getByLabel('Company name').fill(companyName);
    await page.getByLabel('Sector').fill('AI');
    await page.getByLabel('Initial investment ($)').fill('1250000');

    const createResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/portfolio-companies') &&
        response.request().method() === 'POST'
    );

    await page.getByRole('button', { name: /create company/i }).click();

    expect((await createResponse).status()).toBe(201);
    await expect(page.getByTestId('portfolio-add-company-dialog')).not.toBeVisible();
    await expect(page.getByText(companyName).first()).toBeVisible();
  });
});
