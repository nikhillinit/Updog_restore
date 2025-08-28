import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class FundSetupPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // Wizard navigation
  get wizardContainer(): Locator {
    return this.page.locator('[data-testid="fund-setup-wizard"], .wizard-container, .fund-setup-form').first();
  }

  get stepIndicator(): Locator {
    return this.page.locator('[data-testid="step-indicator"], .step-indicator, .wizard-steps').first();
  }

  get nextButton(): Locator {
    return this.page.locator('[data-testid="next-step"], button:has-text("Next"), .next-btn').first();
  }

  get previousButton(): Locator {
    return this.page.locator('[data-testid="previous-step"], button:has-text("Previous"), .prev-btn').first();
  }

  get finishButton(): Locator {
    return this.page.locator('[data-testid="finish-setup"], button:has-text("Finish"), button:has-text("Complete")').first();
  }

  // Step 1: Fund Basics
  get fundNameInput(): Locator {
    return this.page.locator('[data-testid="fund-name"], input[name="fundName"], input[placeholder*="fund name" i]').first();
  }

  get fundTypeSelect(): Locator {
    return this.page.locator('[data-testid="fund-type"], select[name="fundType"], .fund-type-select').first();
  }

  get fundDescriptionTextarea(): Locator {
    return this.page.locator('[data-testid="fund-description"], textarea[name="description"], textarea[placeholder*="description" i]').first();
  }

  get vintageYearInput(): Locator {
    return this.page.locator('[data-testid="vintage-year"], input[name="vintageYear"], input[placeholder*="year" i]').first();
  }

  // Step 2: Capital Structure
  get fundSizeInput(): Locator {
    return this.page.locator('[data-testid="fund-size"], input[name="fundSize"], input[placeholder*="fund size" i]').first();
  }

  get targetFundSizeInput(): Locator {
    return this.page.locator('[data-testid="target-fund-size"], input[name="targetFundSize"]').first();
  }

  get managementFeeInput(): Locator {
    return this.page.locator('[data-testid="management-fee"], input[name="managementFee"]').first();
  }

  get carriedInterestInput(): Locator {
    return this.page.locator('[data-testid="carried-interest"], input[name="carriedInterest"]').first();
  }

  // Step 3: Investment Strategy
  get investmentStrategySelect(): Locator {
    return this.page.locator('[data-testid="investment-strategy"], select[name="investmentStrategy"]').first();
  }

  get sectorFocusInputs(): Locator {
    return this.page.locator('[data-testid="sector-focus"], input[name*="sector"], .sector-checkbox').first();
  }

  get geographicFocusSelect(): Locator {
    return this.page.locator('[data-testid="geographic-focus"], select[name="geographicFocus"]').first();
  }

  get minInvestmentInput(): Locator {
    return this.page.locator('[data-testid="min-investment"], input[name="minInvestment"]').first();
  }

  get maxInvestmentInput(): Locator {
    return this.page.locator('[data-testid="max-investment"], input[name="maxInvestment"]').first();
  }

  // Step 4: Review & Confirmation
  get reviewSection(): Locator {
    return this.page.locator('[data-testid="review-section"], .review-container, .confirmation-step').first();
  }

  get confirmCheckbox(): Locator {
    return this.page.locator('[data-testid="confirm-setup"], input[type="checkbox"][name*="confirm"]').first();
  }

  // Actions
  async verifyWizardLoaded() {
    await expect(this.wizardContainer).toBeVisible();
    await expect(this.stepIndicator).toBeVisible();
  }

  async getCurrentStep(): Promise<number> {
    try {
      const stepText = await this.stepIndicator.textContent();
      const match = stepText?.match(/Step (\d+)/i);
      return match ? parseInt(match[1]) : 1;
    } catch {
      return 1;
    }
  }

  async fillFundBasics(fundData: {
    name: string;
    type?: string;
    description?: string;
    vintageYear?: string;
  }) {
    await expect(this.fundNameInput).toBeVisible();
    
    await this.fundNameInput.fill(fundData.name);
    
    if (fundData.type) {
      await this.fundTypeSelect.selectOption(fundData.type);
    }
    
    if (fundData.description) {
      await this.fundDescriptionTextarea.fill(fundData.description);
    }
    
    if (fundData.vintageYear) {
      await this.vintageYearInput.fill(fundData.vintageYear);
    }
  }

  async fillCapitalStructure(capitalData: {
    fundSize: string;
    targetFundSize?: string;
    managementFee?: string;
    carriedInterest?: string;
  }) {
    await expect(this.fundSizeInput).toBeVisible();
    
    await this.fundSizeInput.fill(capitalData.fundSize);
    
    if (capitalData.targetFundSize) {
      await this.targetFundSizeInput.fill(capitalData.targetFundSize);
    }
    
    if (capitalData.managementFee) {
      await this.managementFeeInput.fill(capitalData.managementFee);
    }
    
    if (capitalData.carriedInterest) {
      await this.carriedInterestInput.fill(capitalData.carriedInterest);
    }
  }

  async fillInvestmentStrategy(strategyData: {
    strategy?: string;
    geographicFocus?: string;
    minInvestment?: string;
    maxInvestment?: string;
    sectors?: string[];
  }) {
    if (strategyData.strategy) {
      await this.investmentStrategySelect.selectOption(strategyData.strategy);
    }
    
    if (strategyData.geographicFocus) {
      await this.geographicFocusSelect.selectOption(strategyData.geographicFocus);
    }
    
    if (strategyData.minInvestment) {
      await this.minInvestmentInput.fill(strategyData.minInvestment);
    }
    
    if (strategyData.maxInvestment) {
      await this.maxInvestmentInput.fill(strategyData.maxInvestment);
    }
    
    if (strategyData.sectors && strategyData.sectors.length > 0) {
      for (const sector of strategyData.sectors) {
        const sectorCheckbox = this.page.locator(`input[value="${sector}"], input[name*="${sector}"]`);
        if (await sectorCheckbox.isVisible()) {
          await sectorCheckbox.check();
        }
      }
    }
  }

  async goToNextStep() {
    await expect(this.nextButton).toBeEnabled();
    await this.nextButton.click();
    await this.page.waitForTimeout(1000); // Allow for step transition
  }

  async goToPreviousStep() {
    if (await this.previousButton.isVisible()) {
      await this.previousButton.click();
      await this.page.waitForTimeout(1000);
    }
  }

  async finishSetup() {
    await expect(this.finishButton).toBeVisible();
    
    // Check confirmation checkbox if present
    if (await this.confirmCheckbox.isVisible()) {
      await this.confirmCheckbox.check();
    }
    
    await this.finishButton.click();
    await this.waitForNavigation();
  }

  async verifyReviewData(expectedData: any) {
    await expect(this.reviewSection).toBeVisible();
    
    const reviewContent = await this.reviewSection.textContent();
    
    // Verify key data points appear in review
    if (expectedData.name) {
      expect(reviewContent).toContain(expectedData.name);
    }
    
    if (expectedData.fundSize) {
      expect(reviewContent).toContain(expectedData.fundSize);
    }
    
    if (expectedData.strategy) {
      expect(reviewContent).toContain(expectedData.strategy);
    }
  }

  async completeFullFundSetup(fundData: {
    name: string;
    type?: string;
    description?: string;
    vintageYear?: string;
    fundSize: string;
    targetFundSize?: string;
    managementFee?: string;
    carriedInterest?: string;
    strategy?: string;
    geographicFocus?: string;
    minInvestment?: string;
    maxInvestment?: string;
    sectors?: string[];
  }) {
    // Step 1: Fund Basics
    await this.verifyWizardLoaded();
    await this.fillFundBasics(fundData);
    await this.goToNextStep();
    
    // Step 2: Capital Structure
    await this.fillCapitalStructure(fundData);
    await this.goToNextStep();
    
    // Step 3: Investment Strategy
    await this.fillInvestmentStrategy(fundData);
    await this.goToNextStep();
    
    // Step 4: Review & Complete
    await this.verifyReviewData(fundData);
    await this.finishSetup();
  }

  async verifyStepValidation() {
    // Try to proceed without filling required fields
    const initialStep = await this.getCurrentStep();
    
    if (await this.nextButton.isVisible()) {
      await this.nextButton.click();
      
      // Should still be on the same step if validation failed
      const currentStep = await this.getCurrentStep();
      
      // Check for validation errors
      const errorMessages = this.page.locator('.error, .invalid, [aria-invalid="true"], .form-error');
      const hasErrors = await errorMessages.count() > 0;
      
      // Either we stay on the same step (validation blocked) or errors are shown
      expect(currentStep === initialStep || hasErrors).toBeTruthy();
    }
  }
}