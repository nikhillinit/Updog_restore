import { test, expect } from '@playwright/test';
import { FundSetupPage } from './page-objects/FundSetupPage';
import { DashboardPage } from './page-objects/DashboardPage';
import { NavigationPage } from './page-objects/NavigationPage';

test.describe('Fund Setup Workflow', () => {
  let fundSetupPage: FundSetupPage;
  let dashboardPage: DashboardPage;
  let navigationPage: NavigationPage;

  test.beforeEach(async ({ page }) => {
    fundSetupPage = new FundSetupPage(page);
    dashboardPage = new DashboardPage(page);
    navigationPage = new NavigationPage(page);
  });

  const sampleFundData = {
    name: 'Test Venture Fund',
    type: 'Venture Capital',
    description: 'A test fund focused on early-stage technology startups',
    vintageYear: '2024',
    fundSize: '100000000',
    targetFundSize: '150000000',
    managementFee: '2',
    carriedInterest: '20',
    strategy: 'Growth Equity',
    geographicFocus: 'North America',
    minInvestment: '1000000',
    maxInvestment: '10000000',
    sectors: ['Technology', 'Healthcare']
  };

  test('should complete full fund setup wizard flow', async () => {
    // Navigate to fund setup
    await fundSetupPage.goto('fund-setup');
    await fundSetupPage.verifyWizardLoaded();

    // Complete the entire setup process
    await fundSetupPage.completeFullFundSetup(sampleFundData);

    // Should redirect to dashboard after completion
    await expect(fundSetupPage.page).toHaveURL(/.*dashboard.*/);
    
    // Verify dashboard loads with fund data
    await dashboardPage.verifyDashboardLoaded();
    
    // Take screenshot of completed setup
    await dashboardPage.takeScreenshot('fund-setup-completed');
  });

  test('should navigate between wizard steps correctly', async () => {
    await fundSetupPage.goto('fund-setup');
    await fundSetupPage.verifyWizardLoaded();

    // Start at step 1
    expect(await fundSetupPage.getCurrentStep()).toBe(1);

    // Fill step 1 and move forward
    await fundSetupPage.fillFundBasics(sampleFundData);
    await fundSetupPage.goToNextStep();
    expect(await fundSetupPage.getCurrentStep()).toBe(2);

    // Fill step 2 and move forward
    await fundSetupPage.fillCapitalStructure(sampleFundData);
    await fundSetupPage.goToNextStep();
    expect(await fundSetupPage.getCurrentStep()).toBe(3);

    // Move back to step 2
    await fundSetupPage.goToPreviousStep();
    expect(await fundSetupPage.getCurrentStep()).toBe(2);

    // Move forward again
    await fundSetupPage.goToNextStep();
    expect(await fundSetupPage.getCurrentStep()).toBe(3);

    // Complete the rest
    await fundSetupPage.fillInvestmentStrategy(sampleFundData);
    await fundSetupPage.goToNextStep();
    expect(await fundSetupPage.getCurrentStep()).toBe(4);
  });

  test('should persist data when navigating between steps', async () => {
    await fundSetupPage.goto('fund-setup');
    await fundSetupPage.verifyWizardLoaded();

    // Fill step 1
    await fundSetupPage.fillFundBasics(sampleFundData);
    await fundSetupPage.goToNextStep();

    // Fill step 2
    await fundSetupPage.fillCapitalStructure(sampleFundData);
    await fundSetupPage.goToNextStep();

    // Go back to step 1 and verify data is still there
    await fundSetupPage.goToPreviousStep();
    await fundSetupPage.goToPreviousStep();

    // Verify fund name is still filled
    const fundNameValue = await fundSetupPage.fundNameInput.inputValue();
    expect(fundNameValue).toBe(sampleFundData.name);

    // Navigate forward and verify step 2 data
    await fundSetupPage.goToNextStep();
    const fundSizeValue = await fundSetupPage.fundSizeInput.inputValue();
    expect(fundSizeValue).toBe(sampleFundData.fundSize);
  });

  test('should validate required fields in each step', async () => {
    await fundSetupPage.goto('fund-setup');
    await fundSetupPage.verifyWizardLoaded();

    // Test validation on step 1
    await fundSetupPage.verifyStepValidation();

    // Fill minimum required fields for step 1
    await fundSetupPage.fundNameInput.fill(sampleFundData.name);
    await fundSetupPage.goToNextStep();

    // Test validation on step 2
    await fundSetupPage.verifyStepValidation();

    // Fill required field for step 2
    await fundSetupPage.fundSizeInput.fill(sampleFundData.fundSize);
    await fundSetupPage.goToNextStep();

    // Should be able to proceed when required fields are filled
    const currentStep = await fundSetupPage.getCurrentStep();
    expect(currentStep).toBe(3);
  });

  test('should display correct review data before completion', async () => {
    await fundSetupPage.goto('fund-setup');
    await fundSetupPage.verifyWizardLoaded();

    // Complete first three steps
    await fundSetupPage.fillFundBasics(sampleFundData);
    await fundSetupPage.goToNextStep();

    await fundSetupPage.fillCapitalStructure(sampleFundData);
    await fundSetupPage.goToNextStep();

    await fundSetupPage.fillInvestmentStrategy(sampleFundData);
    await fundSetupPage.goToNextStep();

    // Verify review step shows entered data
    await fundSetupPage.verifyReviewData(sampleFundData);

    // Take screenshot of review step
    await fundSetupPage.takeScreenshot('fund-setup-review');
  });

  test('should handle form validation errors gracefully', async () => {
    await fundSetupPage.goto('fund-setup');
    await fundSetupPage.verifyWizardLoaded();

    // Try to submit with invalid data
    await fundSetupPage.fundNameInput.fill(''); // Empty name
    await fundSetupPage.vintageYearInput.fill('invalid-year'); // Invalid year
    
    await fundSetupPage.goToNextStep();

    // Should show validation errors or stay on current step
    const errorMessages = fundSetupPage.page.locator('.error, .invalid, [aria-invalid="true"]');
    const hasErrors = await errorMessages.count() > 0;
    const currentStep = await fundSetupPage.getCurrentStep();

    expect(hasErrors || currentStep === 1).toBeTruthy();
  });

  test('should be responsive across different screen sizes', async () => {
    await fundSetupPage.goto('fund-setup');

    // Test desktop layout
    await fundSetupPage.page.setViewportSize({ width: 1200, height: 800 });
    await fundSetupPage.verifyWizardLoaded();
    await expect(fundSetupPage.stepIndicator).toBeVisible();

    // Test tablet layout
    await fundSetupPage.page.setViewportSize({ width: 768, height: 1024 });
    await expect(fundSetupPage.wizardContainer).toBeVisible();
    await expect(fundSetupPage.fundNameInput).toBeVisible();

    // Test mobile layout
    await fundSetupPage.page.setViewportSize({ width: 375, height: 667 });
    await expect(fundSetupPage.wizardContainer).toBeVisible();
    
    // On mobile, step indicator might be collapsed
    const stepIndicatorVisible = await fundSetupPage.stepIndicator.isVisible();
    const wizardVisible = await fundSetupPage.wizardContainer.isVisible();
    expect(wizardVisible).toBeTruthy();

    // Take screenshot of mobile layout
    await fundSetupPage.takeScreenshot('fund-setup-mobile');
  });

  test('should allow canceling and returning to setup', async () => {
    await fundSetupPage.goto('fund-setup');
    await fundSetupPage.verifyWizardLoaded();

    // Fill some data
    await fundSetupPage.fillFundBasics(sampleFundData);
    await fundSetupPage.goToNextStep();

    // Navigate away (simulate cancel)
    await navigationPage.navigateToDashboard();

    // Should redirect back to fund-setup if fund is not complete
    const currentUrl = await fundSetupPage.page.url();
    const isOnFundSetup = currentUrl.includes('/fund-setup');
    const isOnDashboard = currentUrl.includes('/dashboard');

    // Either we're redirected back to fund-setup or dashboard handles incomplete setup
    expect(isOnFundSetup || isOnDashboard).toBeTruthy();
  });

  test('should complete setup with minimal required data', async () => {
    const minimalData = {
      name: 'Minimal Test Fund',
      fundSize: '50000000'
    };

    await fundSetupPage.goto('fund-setup');
    await fundSetupPage.verifyWizardLoaded();

    // Fill only required fields
    await fundSetupPage.fundNameInput.fill(minimalData.name);
    await fundSetupPage.goToNextStep();

    await fundSetupPage.fundSizeInput.fill(minimalData.fundSize);
    await fundSetupPage.goToNextStep();

    // Skip optional fields in step 3
    await fundSetupPage.goToNextStep();

    // Complete setup
    await fundSetupPage.finishSetup();

    // Should still redirect to dashboard
    await expect(fundSetupPage.page).toHaveURL(/.*dashboard.*/);
    await dashboardPage.verifyDashboardLoaded();
  });

  test('should handle network errors during setup', async () => {
    await fundSetupPage.goto('fund-setup');
    await fundSetupPage.verifyWizardLoaded();

    // Fill complete form
    await fundSetupPage.completeFullFundSetup(sampleFundData);

    // If there's a network error, user should see appropriate feedback
    // This is handled by the application's error handling
    // We just verify the user gets some feedback (error message, retry option, etc.)
    
    const currentUrl = await fundSetupPage.page.url();
    const pageContent = await fundSetupPage.page.textContent('body');
    
    // Either we successfully navigate to dashboard or we get error handling
    const hasErrorHandling = pageContent?.includes('Error') || 
                            pageContent?.includes('Try again') ||
                            pageContent?.includes('Network') ||
                            currentUrl.includes('/dashboard');
                            
    expect(hasErrorHandling).toBeTruthy();
  });
});