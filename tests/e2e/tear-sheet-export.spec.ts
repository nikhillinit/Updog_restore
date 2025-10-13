import { test, expect } from '@playwright/test';

async function setupDemo(page: any) {
  await page.addInitScript(() => {
    localStorage.setItem('DEMO_TOOLBAR', '1');
    localStorage.setItem('FF_NEW_IA', 'true');
    localStorage.setItem('DEMO_PERSONA', 'GP');
  });
  await page.goto('/');
  await page.reload();
}

test.describe('Tear Sheet Export', () => {
  test.skip('Export All button downloads tear sheets CSV', async ({ page }) => {
    await setupDemo(page);
    
    // Navigate to tear sheets page
    // Note: Skipping as we need to verify the actual route
    await page.goto('/tear-sheets');
    
    // Find and click the Export All button
    const exportAllBtn = page.getByRole('button', { name: /Export All/i });
    await expect(exportAllBtn).toBeVisible();
    
    // Wait for download
    const downloadPromise = page.waitForEvent('download');
    await exportAllBtn.click();
    const download = await downloadPromise;
    
    // Verify filename format
    expect(download.suggestedFilename()).toMatch(/tear-sheets-\d{4}-\d{2}-\d{2}\.csv$/);
    
    // Verify CSV content
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream!) chunks.push(c as Buffer);
    const csvText = Buffer.concat(chunks).toString('utf-8');
    
    // Check headers are present
    expect(csvText).toContain('Company Name');
    expect(csvText).toContain('Sector');
    expect(csvText).toContain('Stage');
    expect(csvText).toContain('Company Sentiment');
    
    // Check data rows exist
    const lines = csvText.split(/\r?\n/);
    expect(lines.length).toBeGreaterThan(1); // At least header + 1 data row
  });

  test.skip('Individual tear sheet CSV export works', async ({ page }) => {
    await setupDemo(page);
    
    // Navigate to tear sheets page
    await page.goto('/tear-sheets');
    
    // Find and click the CSV button on the first tear sheet
    const csvBtn = page.getByRole('button', { name: /^CSV$/i }).first();
    await expect(csvBtn).toBeVisible();
    
    // Wait for download
    const downloadPromise = page.waitForEvent('download');
    await csvBtn.click();
    const download = await downloadPromise;
    
    // Verify filename format
    expect(download.suggestedFilename()).toMatch(/tear-sheet-[\w-]+-\d{4}-\d{2}-\d{2}\.csv$/);
    
    // Verify CSV content
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream!) chunks.push(c as Buffer);
    const csvText = Buffer.concat(chunks).toString('utf-8');
    
    // Check headers and single row
    const lines = csvText.split(/\r?\n/).filter(l => l.trim());
    expect(lines.length).toBe(2); // Header + 1 data row
  });
});
