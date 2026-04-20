import { test, expect } from '@playwright/test';

import { FundSetupPage } from './page-objects/FundSetupPage';

test.describe('Fund Setup Workflow', () => {
  let fundSetupPage: FundSetupPage;

  test.beforeEach(async ({ page }) => {
    fundSetupPage = new FundSetupPage(page);
  });

  test('should complete the current 7-step fund setup flow', async () => {
    await fundSetupPage.gotoFundSetup(1);

    await fundSetupPage.completeFullFundSetup({
      name: 'Test Venture Fund',
      fundSize: '100',
    });

    await expect(fundSetupPage.page).toHaveURL(/\/fund-model-results\/\d+$/);
  });

  test('should create and persist a server draft from step 1', async () => {
    await fundSetupPage.gotoFundSetup(1);
    await fundSetupPage.verifyWizardLoaded();

    await fundSetupPage.completeStepOneAndWaitForDraft({
      name: 'Persisted Draft Fund',
      fundSize: '75',
    });

    await fundSetupPage.goToStep(1);
    await expect(fundSetupPage.fundNameInput).toHaveValue('Persisted Draft Fund');
    await expect(fundSetupPage.capitalCommittedInput).toHaveValue('75');
  });

  test('should render the current wizard responsively', async () => {
    await fundSetupPage.gotoFundSetup(1);
    await fundSetupPage.verifyWizardLoaded();

    await fundSetupPage.page.setViewportSize({ width: 1200, height: 800 });
    await expect(fundSetupPage.wizardContainer).toBeVisible();

    await fundSetupPage.page.setViewportSize({ width: 768, height: 1024 });
    await expect(fundSetupPage.wizardContainer).toBeVisible();

    await fundSetupPage.page.setViewportSize({ width: 375, height: 667 });
    await expect(fundSetupPage.wizardContainer).toBeVisible();
  });
});
