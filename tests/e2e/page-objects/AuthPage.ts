import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class AuthPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // Login form elements
  get loginForm(): Locator {
    return this.page.locator('[data-testid="login-form"], form[action*="login"], .login-form').first();
  }

  get emailInput(): Locator {
    return this.page.locator('[data-testid="email"], input[name="email"], input[type="email"]').first();
  }

  get passwordInput(): Locator {
    return this.page.locator('[data-testid="password"], input[name="password"], input[type="password"]').first();
  }

  get loginButton(): Locator {
    return this.page.locator('[data-testid="login-button"], button[type="submit"], button:has-text("Login"), button:has-text("Sign in")').first();
  }

  // Registration form elements
  get registerForm(): Locator {
    return this.page.locator('[data-testid="register-form"], form[action*="register"], .register-form').first();
  }

  get firstNameInput(): Locator {
    return this.page.locator('[data-testid="first-name"], input[name="firstName"], input[placeholder*="first name" i]').first();
  }

  get lastNameInput(): Locator {
    return this.page.locator('[data-testid="last-name"], input[name="lastName"], input[placeholder*="last name" i]').first();
  }

  get confirmPasswordInput(): Locator {
    return this.page.locator('[data-testid="confirm-password"], input[name="confirmPassword"], input[name="passwordConfirmation"]').first();
  }

  get registerButton(): Locator {
    return this.page.locator('[data-testid="register-button"], button:has-text("Register"), button:has-text("Sign up")').first();
  }

  // Navigation links
  get loginLink(): Locator {
    return this.page.locator('[data-testid="login-link"], a:has-text("Login"), a:has-text("Sign in")').first();
  }

  get registerLink(): Locator {
    return this.page.locator('[data-testid="register-link"], a:has-text("Register"), a:has-text("Sign up")').first();
  }

  get forgotPasswordLink(): Locator {
    return this.page.locator('[data-testid="forgot-password"], a:has-text("Forgot password")').first();
  }

  // Error and success messages
  get errorMessage(): Locator {
    return this.page.locator('[data-testid="error-message"], .error, .alert-error, [role="alert"]').first();
  }

  get successMessage(): Locator {
    return this.page.locator('[data-testid="success-message"], .success, .alert-success').first();
  }

  // Loading states
  get loadingSpinner(): Locator {
    return this.page.locator('[data-testid="loading"], .loading, .spinner, .animate-spin').first();
  }

  // Actions
  async login(email: string, password: string) {
    await expect(this.loginForm).toBeVisible();
    
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
    
    // Wait for navigation or error message
    await Promise.race([
      this.page.waitForNavigation({ timeout: 10000 }),
      this.errorMessage.waitFor({ timeout: 5000 }).catch(() => {})
    ]);
  }

  async register(userData: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) {
    await expect(this.registerForm).toBeVisible();
    
    await this.firstNameInput.fill(userData.firstName);
    await this.lastNameInput.fill(userData.lastName);
    await this.emailInput.fill(userData.email);
    await this.passwordInput.fill(userData.password);
    await this.confirmPasswordInput.fill(userData.password);
    
    await this.registerButton.click();
    
    // Wait for navigation or error message
    await Promise.race([
      this.page.waitForNavigation({ timeout: 10000 }),
      this.errorMessage.waitFor({ timeout: 5000 }).catch(() => {}),
      this.successMessage.waitFor({ timeout: 5000 }).catch(() => {})
    ]);
  }

  async switchToLogin() {
    await this.loginLink.click();
    await expect(this.loginForm).toBeVisible();
  }

  async switchToRegister() {
    await this.registerLink.click();
    await expect(this.registerForm).toBeVisible();
  }

  async verifyAuthenticationRequired() {
    // Check if we're redirected to auth page when accessing protected route
    const currentUrl = await this.page.url();
    const isAuthPage = currentUrl.includes('/login') || 
                       currentUrl.includes('/auth') || 
                       currentUrl.includes('/signin');
    
    expect(isAuthPage).toBeTruthy();
  }

  async verifyLoginSuccess() {
    // After successful login, should not be on auth pages
    const currentUrl = await this.page.url();
    const isNotAuthPage = !currentUrl.includes('/login') && 
                          !currentUrl.includes('/auth') && 
                          !currentUrl.includes('/signin');
    
    expect(isNotAuthPage).toBeTruthy();
    
    // Should not see login form anymore
    await expect(this.loginForm).not.toBeVisible();
  }

  async verifyRegistrationSuccess() {
    // Check for success message or navigation to dashboard/login
    const hasSuccessMessage = await this.successMessage.isVisible();
    const currentUrl = await this.page.url();
    const isOnDashboard = currentUrl.includes('/dashboard');
    const isOnLogin = currentUrl.includes('/login');
    
    expect(hasSuccessMessage || isOnDashboard || isOnLogin).toBeTruthy();
  }

  async verifyFormValidation(field: 'email' | 'password' | 'firstName' | 'lastName') {
    let inputField: Locator;
    
    switch (field) {
      case 'email':
        inputField = this.emailInput;
        break;
      case 'password':
        inputField = this.passwordInput;
        break;
      case 'firstName':
        inputField = this.firstNameInput;
        break;
      case 'lastName':
        inputField = this.lastNameInput;
        break;
    }
    
    // Check if field has validation attributes
    const isRequired = await inputField.getAttribute('required');
    const hasValidationType = await inputField.getAttribute('type');
    const hasPattern = await inputField.getAttribute('pattern');
    
    // Field should have some form of validation
    expect(isRequired !== null || hasPattern !== null || hasValidationType === 'email').toBeTruthy();
  }

  async testPasswordVisibilityToggle() {
    // Look for password visibility toggle button
    const toggleButton = this.page.locator('[data-testid="toggle-password"], button[aria-label*="password"], .password-toggle');
    
    if (await toggleButton.isVisible()) {
      // Initially password should be hidden
      await expect(this.passwordInput).toHaveAttribute('type', 'password');
      
      // Click toggle to show password
      await toggleButton.click();
      await expect(this.passwordInput).toHaveAttribute('type', 'text');
      
      // Click again to hide
      await toggleButton.click();
      await expect(this.passwordInput).toHaveAttribute('type', 'password');
    }
  }

  async testFormAccessibility() {
    // Check form has proper labels and ARIA attributes
    const formElement = this.loginForm.isVisible() ? this.loginForm : this.registerForm;
    
    // Form should have accessible name
    const formLabel = await formElement.getAttribute('aria-label');
    const formRole = await formElement.getAttribute('role');
    
    expect(formLabel !== null || formRole === 'form').toBeTruthy();
    
    // Inputs should have associated labels
    const emailLabel = await this.emailInput.getAttribute('aria-label') || 
                      await this.page.locator('label[for]').count() > 0;
    expect(emailLabel).toBeTruthy();
  }
}