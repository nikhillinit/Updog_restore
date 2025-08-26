import { test, expect } from '@playwright/test';
import { TID } from '../../client/src/testids';

test.describe('Wizard Steps 3 & 4: Investment Strategy & Reserves', () => {
  test('completes allocation inputs and reserve configuration', async ({ page }) => {
    const baseURL = process.env.BASE_URL || 'http://localhost:5000';

    await page.goto(baseURL);

    // Navigate to wizard - adjust these selectors based on your actual app flow
    await page.getByRole('link', { name: /wizard|setup/i }).click();

    // Step 3: Investment Strategy
    await page.getByTestId(TID.step3AvgCheck).fill('2.5');
    await page.getByTestId(TID.step3ReserveRatio).fill('0.25');
    await page.getByTestId(TID.step3Next).click();

    // Step 4: Reserves Configuration
    // Many UI libraries render a button/role="switch" for toggles—use click() for stability.
    await page.getByTestId(TID.step4RemainPass).click();
    await page.getByTestId(TID.step4Save).click();

    // Verify progression or completion
    await expect(page).toHaveURL(/.*step.*5|.*complete/);
  });
});
