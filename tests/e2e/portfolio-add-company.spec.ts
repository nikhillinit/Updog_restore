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

  test('navigates from a mobile company card to the mounted summary detail route', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/portfolio');
    await page.waitForTimeout(500);

    // SKIP: mobile portfolio browser check requires an authenticated session when login gating is enabled
    test.skip(page.url().includes('/login'), 'Authentication required');

    const companyName = `Mobile Portfolio Company ${Date.now()}`;

    await page.getByTestId('portfolio-add-company-button').click();
    await page.getByLabel('Company name').fill(companyName);
    await page.getByLabel('Sector').fill('AI');
    await page.getByLabel('Initial investment ($)').fill('2250000');
    await page.getByRole('button', { name: /create company/i }).click();

    await expect(page.getByText(companyName).first()).toBeVisible();

    const detailButton = page.getByRole('button', {
      name: new RegExp(`view ${companyName} details`, 'i'),
    });
    await expect(detailButton).toBeVisible();
    await detailButton.click();

    await expect(page).toHaveURL(/\/portfolio\/company\/\d+$/);
    await expect(page.getByTestId('portfolio-company-summary-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: companyName })).toBeVisible();
  });
});
