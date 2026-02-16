import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class PipelinePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // Navigation
  async navigateTo() {
    await this.goto('pipeline');
    await this.page.waitForLoadState('networkidle');
  }

  // Page header
  get pageTitle(): Locator {
    return this.page.locator('h2:has-text("Deal Pipeline")');
  }

  get addDealButton(): Locator {
    return this.page.locator('button:has-text("Add deal"), button:has-text("Add")').first();
  }

  get importDealsButton(): Locator {
    return this.page.locator('button:has-text("Import deals"), button:has-text("Import")').first();
  }

  // Toolbar
  get toolbar(): Locator {
    return this.page.locator('[data-testid="pipeline-toolbar"]');
  }

  get searchInput(): Locator {
    return this.page.locator('[data-testid="pipeline-search"]');
  }

  get statusFilter(): Locator {
    return this.page.locator('[data-testid="pipeline-status-filter"]');
  }

  get priorityFilter(): Locator {
    return this.page.locator('[data-testid="pipeline-priority-filter"]');
  }

  get sortSelect(): Locator {
    return this.page.locator('[data-testid="pipeline-sort"]');
  }

  // Bulk toolbar
  get bulkToolbar(): Locator {
    return this.page.locator('[data-testid="bulk-toolbar"]');
  }

  get bulkStatusSelect(): Locator {
    return this.page.locator('[data-testid="bulk-status-select"]');
  }

  get bulkArchiveButton(): Locator {
    return this.page.locator('[data-testid="bulk-archive-btn"]');
  }

  // Deal cards (list view rows)
  get dealRows(): Locator {
    return this.page.locator('[role="button"][aria-label*="priority"]');
  }

  // AddDeal dialog
  get addDealDialog(): Locator {
    return this.page.locator('[role="dialog"]:has-text("Add New Deal")');
  }

  get addDealCompanyName(): Locator {
    return this.addDealDialog.locator('input[name="companyName"]');
  }

  get addDealSubmit(): Locator {
    return this.addDealDialog.locator('button[type="submit"]');
  }

  // Import dialog
  get importDialog(): Locator {
    return this.page.locator('[role="dialog"]:has-text("Import Deals")');
  }

  // Empty state
  get emptyState(): Locator {
    return this.page.locator('text=Start building your pipeline');
  }

  get noMatchingDeals(): Locator {
    return this.page.locator('text=No matching deals');
  }

  // Actions
  async openAddDealModal() {
    await this.addDealButton.click();
    await expect(this.addDealDialog).toBeVisible();
  }

  async openImportModal() {
    await this.importDealsButton.click();
    await expect(this.importDialog).toBeVisible();
  }

  async fillAddDealForm(data: {
    companyName: string;
    sector?: string;
    stage?: string;
    priority?: string;
    dealSize?: string;
  }) {
    await this.addDealDialog.locator('input[name="companyName"]').fill(data.companyName);
    if (data.dealSize) {
      await this.addDealDialog.locator('input[name="dealSize"]').fill(data.dealSize);
    }
    // Sector, stage, priority are selects — click trigger then option
    if (data.sector) {
      await this.selectDropdown(this.addDealDialog, 'sector', data.sector);
    }
    if (data.priority) {
      await this.selectDropdown(this.addDealDialog, 'priority', data.priority);
    }
  }

  async submitAddDeal() {
    await this.addDealSubmit.click();
  }

  async searchDeals(term: string) {
    await this.searchInput.fill(term);
    // debounce wait
    await this.page.waitForTimeout(400);
  }

  async clearSearch() {
    await this.searchInput.fill('');
    await this.page.waitForTimeout(400);
  }

  async selectStatus(status: string) {
    await this.statusFilter.click();
    await this.page.locator(`[role="option"]:has-text("${status}")`).click();
  }

  async selectPriority(priority: string) {
    await this.priorityFilter.click();
    await this.page.locator(`[role="option"]:has-text("${priority}")`).click();
  }

  async getDealCount(): Promise<number> {
    return this.dealRows.count();
  }

  async getDealByName(name: string): Promise<Locator> {
    return this.page.locator(`[role="button"][aria-label*="priority"]:has-text("${name}")`);
  }

  dealCheckbox(dealId: number): Locator {
    return this.page.locator(`[data-testid="deal-checkbox-${dealId}"]`);
  }

  async verifyPageLoaded() {
    await expect(this.pageTitle).toBeVisible({ timeout: 15000 });
    await expect(this.toolbar).toBeVisible();
  }

  private async selectDropdown(container: Locator, name: string, value: string) {
    // shadcn Select uses trigger + popover pattern
    const trigger = container
      .locator(`button[role="combobox"]:near(label:has-text("${name}"), 100)`)
      .first();
    if (await trigger.isVisible({ timeout: 2000 }).catch(() => false)) {
      await trigger.click();
      await this.page.locator(`[role="option"]:has-text("${value}")`).click();
    }
  }
}
