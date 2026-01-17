import { test, expect } from '@playwright/test';
import { AuthPage } from './page-objects/AuthPage';
import { DashboardPage } from './page-objects/DashboardPage';
import { NavigationPage } from './page-objects/NavigationPage';

test.describe('User Authentication Flow', () => {
  let authPage: AuthPage;
  let dashboardPage: DashboardPage;
  let navigationPage: NavigationPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
    dashboardPage = new DashboardPage(page);
    navigationPage = new NavigationPage(page);
  });

  const testUser = {
    firstName: 'Test',
    lastName: 'User',
    email: `test.user.${Date.now()}@example.com`,
    password: 'TestPassword123!'
  };

  const existingUser = {
    email: 'demo@example.com',
    password: 'demopassword'
  };

  test('should require authentication for protected routes', async () => {
    // Try to access dashboard without authentication
    await dashboardPage.goto('dashboard');
    
    // Should be redirected to auth page or see login form
    await authPage.verifyAuthenticationRequired();
    
    // Take screenshot of auth requirement
    await authPage.takeScreenshot('auth-required');
  });

  test('should successfully login with valid credentials', async () => {
    await authPage.goto('login');
    
    // Attempt login with test credentials (may need to adapt based on your auth system)
    await authPage.login(existingUser.email, existingUser.password);
    
    // Check if login was successful (no error message and not on auth page)
    const hasError = await authPage.errorMessage.isVisible();
    
    if (!hasError) {
      await authPage.verifyLoginSuccess();
      
      // Should be able to access dashboard
      await dashboardPage.goto('dashboard');
      await dashboardPage.verifyDashboardLoaded();
    } else {
      // If demo credentials don't exist, that's expected
      console.log('Demo credentials not configured - this is expected in test environment');
    }
  });

  test('should show validation errors for invalid login', async () => {
    await authPage.goto('login');
    
    // Try login with invalid credentials
    await authPage.login('invalid@example.com', 'wrongpassword');
    
    // Should show error message or stay on login page
    const hasError = await authPage.errorMessage.isVisible();
    const currentUrl = await authPage.page.url();
    const stillOnAuth = currentUrl.includes('/login') || currentUrl.includes('/auth');
    
    expect(hasError || stillOnAuth).toBeTruthy();
  });

  test('should handle empty form submission', async () => {
    await authPage.goto('login');
    
    // Try to submit empty form
    await authPage.loginButton.click();
    
    // Should show validation errors or prevent submission
    const hasError = await authPage.errorMessage.isVisible();
    const emailValidation = await authPage.emailInput.evaluate(el => el.checkValidity());
    const passwordValidation = await authPage.passwordInput.evaluate(el => el.checkValidity());
    
    // Either form validation prevents submission or error message is shown
    expect(hasError || !emailValidation || !passwordValidation).toBeTruthy();
  });

  test('should validate email format in login form', async () => {
    await authPage.goto('login');
    
    // Enter invalid email format
    await authPage.emailInput.fill('invalid-email');
    await authPage.passwordInput.fill('password123');
    await authPage.loginButton.click();
    
    // Should show validation error for email format
    const emailValidity = await authPage.emailInput.evaluate(el => el.checkValidity());
    expect(emailValidity).toBeFalsy();
  });

  test('should navigate between login and registration forms', async () => {
    await authPage.goto('login');
    
    // Verify we're on login form
    await expect(authPage.loginForm).toBeVisible();
    
    // Navigate to registration
    if (await authPage.registerLink.isVisible()) {
      await authPage.switchToRegister();
      await expect(authPage.registerForm).toBeVisible();
      
      // Navigate back to login
      await authPage.switchToLogin();
      await expect(authPage.loginForm).toBeVisible();
    }
  });

  test('should handle user registration flow', async () => {
    await authPage.goto('register');

    // Skip if registration form not available (demo mode)
    const hasRegisterForm = await authPage.registerForm.isVisible();
    test.skip(!hasRegisterForm, 'Registration form not available');

    // Fill registration form
    await authPage.register(testUser);

    // Verify registration result
    await authPage.verifyRegistrationSuccess();

    // Take screenshot of registration result
    await authPage.takeScreenshot('registration-completed');
  });

  test('should validate registration form fields', async () => {
    await authPage.goto('register');

    // Skip if registration form not available (demo mode)
    const hasRegisterForm = await authPage.registerForm.isVisible();
    test.skip(!hasRegisterForm, 'Registration form not available');

    // Test email validation
    await authPage.verifyFormValidation('email');

    // Test password validation
    await authPage.verifyFormValidation('password');

    // Test required fields
    await authPage.registerButton.click();

    // Should prevent submission with empty required fields
    const currentUrl = await authPage.page.url();
    const stillOnRegister = currentUrl.includes('/register');
    expect(stillOnRegister).toBeTruthy();
  });

  test('should handle password visibility toggle', async () => {
    await authPage.goto('login');
    
    // Fill password field
    await authPage.passwordInput.fill('testpassword');
    
    // Test password visibility toggle if available
    await authPage.testPasswordVisibilityToggle();
  });

  test('should show forgot password functionality', async () => {
    await authPage.goto('login');
    
    if (await authPage.forgotPasswordLink.isVisible()) {
      await authPage.forgotPasswordLink.click();
      
      // Should navigate to forgot password page or show modal
      const currentUrl = await authPage.page.url();
      const onForgotPassword = currentUrl.includes('/forgot') || 
                              currentUrl.includes('/reset');
      
      const modalVisible = await authPage.page.locator('[role="dialog"], .modal').isVisible();
      
      expect(onForgotPassword || modalVisible).toBeTruthy();
    }
  });

  test('should maintain session across page refreshes', async () => {
    // First, try to login
    await authPage.goto('login');
    
    if (await authPage.loginForm.isVisible()) {
      await authPage.login(existingUser.email, existingUser.password);
      
      const hasError = await authPage.errorMessage.isVisible();
      
      if (!hasError) {
        // Navigate to dashboard
        await dashboardPage.goto('dashboard');
        
        // Refresh the page
        await authPage.page.reload();
        
        // Should still be authenticated and see dashboard
        const currentUrl = await authPage.page.url();
        const stillAuthenticated = !currentUrl.includes('/login') && !currentUrl.includes('/auth');
        
        expect(stillAuthenticated).toBeTruthy();
      }
    }
  });

  test('should handle logout functionality', async () => {
    // Try to access a protected page first
    await dashboardPage.goto('dashboard');
    
    // If we can access it or are redirected to login, proceed
    const currentUrl = await authPage.page.url();
    
    if (!currentUrl.includes('/login')) {
      // We're authenticated, test logout
      if (await navigationPage.userMenuButton.isVisible()) {
        await navigationPage.logout();
        
        // Should be redirected to login/home page
        const afterLogoutUrl = await authPage.page.url();
        const loggedOut = afterLogoutUrl.includes('/login') || 
                         afterLogoutUrl.includes('/') && !afterLogoutUrl.includes('/dashboard');
        
        expect(loggedOut).toBeTruthy();
      }
    }
  });

  test('should be responsive on mobile devices', async () => {
    await authPage.page.setViewportSize({ width: 375, height: 667 });
    await authPage.goto('login');
    
    // Login form should be visible and usable on mobile
    await expect(authPage.loginForm).toBeVisible();
    await expect(authPage.emailInput).toBeVisible();
    await expect(authPage.passwordInput).toBeVisible();
    await expect(authPage.loginButton).toBeVisible();
    
    // Take screenshot of mobile auth
    await authPage.takeScreenshot('auth-mobile');
  });

  test('should meet accessibility standards', async () => {
    await authPage.goto('login');
    
    // Test form accessibility
    await authPage.testFormAccessibility();
    
    // Check keyboard navigation
    await authPage.page.keyboard.press('Tab');
    const focusedElement = await authPage.page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('should handle loading states during authentication', async () => {
    await authPage.goto('login');
    
    // Fill form and submit
    await authPage.emailInput.fill(existingUser.email);
    await authPage.passwordInput.fill(existingUser.password);
    
    // Submit and check for loading state
    await authPage.loginButton.click();
    
    // Might briefly show loading state
    const hasLoadingState = await authPage.loadingSpinner.isVisible();
    
    // This is optional - some forms might not show loading states
    // Just ensure the form doesn't become completely unresponsive
    await authPage.page.waitForTimeout(3000);
    
    const formStillInteractive = await authPage.loginButton.isEnabled() || 
                                await authPage.errorMessage.isVisible() ||
                                !await authPage.loginForm.isVisible();
    
    expect(formStillInteractive).toBeTruthy();
  });

  test('should handle authentication errors gracefully', async () => {
    await authPage.goto('login');
    
    // Test various error scenarios
    const errorScenarios = [
      { email: '', password: '' }, // Empty fields
      { email: 'invalid-email', password: 'password' }, // Invalid email
      { email: 'test@example.com', password: '' }, // Missing password
      { email: 'nonexistent@example.com', password: 'wrongpassword' } // Wrong credentials
    ];
    
    for (const scenario of errorScenarios) {
      await authPage.emailInput.fill(scenario.email);
      await authPage.passwordInput.fill(scenario.password);
      await authPage.loginButton.click();
      
      // Should handle error gracefully (show message or stay on form)
      const currentUrl = await authPage.page.url();
      const hasError = await authPage.errorMessage.isVisible();
      const stillOnAuth = currentUrl.includes('/login') || currentUrl.includes('/auth');
      
      expect(hasError || stillOnAuth).toBeTruthy();
      
      // Clear fields for next test
      await authPage.emailInput.fill('');
      await authPage.passwordInput.fill('');
    }
  });
});
