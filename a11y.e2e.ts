import { expect, type Page, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function expectNoAccessibilityViolations(page: Page) {
  await expect(page.getByRole("heading", { name: "npm org trust & access audit" })).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  const violations = results.violations.map(({ description, helpUrl, id, impact, nodes }) => ({
    id,
    impact,
    description,
    helpUrl,
    nodes: nodes.map(({ failureSummary, target }) => ({
      target,
      failureSummary,
    })),
  }));

  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

test("home page has no detectable accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expectNoAccessibilityViolations(page);
});

test("home page controls expose accessible names", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("textbox", { name: "Organizations" })).toBeVisible();
  await expect(
    page.getByRole("spinbutton", { name: "Window (months)", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "Fetch concurrency" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Analyze ALL org packages/i })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /recent/i })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /manual/i })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /external/i })).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Exclude bot / CI accounts (manual report)" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Run audit" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "npm username" })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "User window (months)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Look up" })).toBeVisible();
});
