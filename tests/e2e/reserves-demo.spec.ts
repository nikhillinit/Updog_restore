import { test, expect } from "@playwright/test";

test("reserves demo renders and shows a numeric reserve ratio", async ({ page }) => {
  await page.goto("/reserves-demo");
  // Adapt these selectors to your demo markup:
  await expect(page.locator("[data-testid='demo-root']")).toBeVisible();
  const ratioText = await page.locator("[data-testid='demo-ratio']").first().textContent();
  const ratio = Number((ratioText || "").replace(/[^\d.]/g, ""));
  expect(ratio).toBeGreaterThan(0);
});
