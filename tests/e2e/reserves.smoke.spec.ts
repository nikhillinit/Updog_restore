import { test, expect } from "@playwright/test";

const WIZARD_URL = process.env.E2E_WIZARD_URL ?? "/fund-setup";

test.describe.configure({ mode: "serial" });
test.describe("Graduation-driven reserves (wizard Step 3)", () => {
  test.skip(!process.env.E2E_WIZARD, "Set E2E_WIZARD=1 to run this test");

  test("invalid sums block Next; valid sums show ratio; raising Seed→A raises ratio", async ({ page }) => {
    await page.goto(WIZARD_URL);

    // Navigate to Step 3 if your wizard opens on Step 1; adapt as needed
    // e.g., click sidebar "Step 3" or Next twice.

    await expect(page.getByTestId("graduation-grid")).toBeVisible();

    // Make invalid
    await page.getByTestId("seedToA-graduate").fill("45");
    await page.getByTestId("seedToA-fail").fill("30");
    await page.getByTestId("seedToA-remain").fill("30");

    await expect(page.getByTestId("graduation-error")).toBeVisible();
    await expect(page.getByTestId("wizard-next")).toBeDisabled();

    // Fix
    await page.getByTestId("seedToA-graduate").fill("40");
    await page.getByTestId("seedToA-fail").fill("30");
    await page.getByTestId("seedToA-remain").fill("30");

    await expect(page.getByTestId("graduation-error")).toHaveCount(0);
    await expect(page.getByTestId("wizard-next")).toBeEnabled();

    // Ratio appears
    const ratioText = await page.getByTestId("reserve-ratio").textContent();
    const ratio = Number(ratioText || "0");
    expect(ratio).toBeGreaterThan(0);

    // Increase Seed→A graduates -> ratio rises
    await page.getByTestId("seedToA-graduate").fill("55");
    await page.getByTestId("seedToA-fail").fill("20");
    await page.getByTestId("seedToA-remain").fill("25");

    // Recompute UI
    const ratioText2 = await page.getByTestId("reserve-ratio").textContent();
    const ratio2 = Number(ratioText2 || "0");
    expect(ratio2).toBeGreaterThan(ratio);
  });
});
