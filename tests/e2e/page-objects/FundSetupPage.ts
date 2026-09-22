import type { Locator, Page, Response } from '@playwright/test';
import { expect } from '@playwright/test';

import { BasePage } from './BasePage';

const STEP_KEYS = {
  1: 'fund-basics',
  2: 'investment-rounds',
  3: 'capital-structure',
  4: 'investment-strategy',
  5: 'distributions',
  6: 'cashflow-management',
  7: 'review',
} as const;

type StepNumber = keyof typeof STEP_KEYS;

export class FundSetupPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  get wizardContainer(): Locator {
    return this.page.getByTestId('fund-setup-wizard');
  }

  get wizardHeading(): Locator {
    return this.page.getByRole('heading', { name: 'Fund Construction Wizard' });
  }

  get nextButton(): Locator {
    return this.page.getByTestId('next-step');
  }

  get previousButton(): Locator {
    return this.page.getByTestId('previous-step');
  }

  get finishButton(): Locator {
    return this.page.getByTestId('finish-setup');
  }

  get createFundButton(): Locator {
    return this.page.getByTestId('create-fund-button');
  }

  get fundNameInput(): Locator {
    return this.page.getByTestId('fund-name');
  }

  get capitalCommittedInput(): Locator {
    return this.page.getByLabel(/Capital Committed/i);
  }

  get stepIndicator(): Locator {
    return this.page.getByText('FUND BASICS').first();
  }

  stepContainer(step: StepNumber): Locator {
    return this.page.getByTestId(`wizard-step-${STEP_KEYS[step]}-container`);
  }

  async gotoFundSetup(step: StepNumber = 1) {
    await this.goto(`fund-setup?step=${step}`);
  }

  async verifyWizardLoaded() {
    await expect(this.wizardContainer).toBeVisible();
    await expect(this.wizardHeading).toBeVisible();
    await expect(this.stepIndicator).toBeVisible();
  }

  async getCurrentStep(): Promise<number> {
    const currentUrl = new URL(this.page.url());
    const stepValue = Number(currentUrl.searchParams.get('step') ?? '1');
    return Number.isFinite(stepValue) ? stepValue : 1;
  }

  get modelInputsAsOfDateInput(): Locator {
    return this.page.getByTestId('model-inputs-as-of-date');
  }

  async fillFundBasics(fundData: { name: string; fundSize?: string; asOfDate?: string }) {
    await expect(this.fundNameInput).toBeVisible();
    await this.fundNameInput.fill(fundData.name);

    if (fundData.fundSize) {
      await this.capitalCommittedInput.fill(fundData.fundSize);
    }

    // Required owner-asserted provenance date; step 1 blocks Next without it.
    await this.modelInputsAsOfDateInput.fill(fundData.asOfDate ?? '2026-06-30');
  }

  async completeStepOneAndWaitForDraft(fundData: { name: string; fundSize: string }): Promise<{
    createResponse: Response;
    draftResponse: Response;
  }> {
    await this.fillFundBasics(fundData);

    const createResponsePromise = this.page.waitForResponse(
      (response) =>
        response.url().includes('/api/funds') &&
        response.request().method() === 'POST' &&
        !response.url().includes('/finalize')
    );

    const draftResponsePromise = this.page.waitForResponse(
      (response) =>
        /\/api\/funds\/\d+\/draft$/.test(response.url()) && response.request().method() === 'PUT'
    );

    await this.nextButton.click();

    const createResponse = await createResponsePromise;
    const draftResponse = await draftResponsePromise;

    await expect(createResponse.status()).toBe(201);
    await expect(draftResponse.ok()).toBeTruthy();
    await expect(this.page).toHaveURL(/\/fund-setup\?step=2$/);
    await expect(this.stepContainer(2)).toBeVisible();
    await expect(this.page.getByTestId('draft-sync-status')).toContainText('Latest draft saved');

    return { createResponse, draftResponse };
  }

  async goToStep(step: StepNumber) {
    await this.gotoFundSetup(step);
    await expect(this.page).toHaveURL(new RegExp(`/fund-setup\\?step=${step}$`));
    await expect(this.stepContainer(step)).toBeVisible();
  }

  async verifyReviewData(expectedData: { name: string; fundSize?: string }) {
    await expect(this.stepContainer(7)).toBeVisible();
    const body = this.page.locator('body');
    await expect(body).toContainText(expectedData.name);
    if (expectedData.fundSize) {
      await expect(body).toContainText(expectedData.fundSize);
    }
  }

  async finishSetup() {
    const finalizeResponsePromise = this.page.waitForResponse(
      (response) =>
        response.url().includes('/api/funds/finalize') && response.request().method() === 'POST'
    );

    await this.createFundButton.click();

    const finalizeResponse = await finalizeResponsePromise;
    expect(finalizeResponse.status()).toBe(201);
    await expect(this.page).toHaveURL(/\/fund-model-results\/\d+$/);
  }

  async verifyStepValidation() {
    const stepBefore = await this.getCurrentStep();
    await this.nextButton.click();

    await expect(this.page).toHaveURL(new RegExp(`/fund-setup\\?step=${stepBefore}$`));
    await expect(this.page.getByRole('alert')).toContainText(/failed|error|required/i);
  }

  async completeFullFundSetup(fundData: { name: string; fundSize: string }) {
    await this.verifyWizardLoaded();
    await this.completeStepOneAndWaitForDraft(fundData);

    await this.goToStep(3);
    await this.goToStep(4);
    await this.goToStep(5);
    await this.goToStep(6);
    await this.goToStep(7);
    await this.verifyReviewData(fundData);
    await this.finishSetup();
  }
}
