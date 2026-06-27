import { expect, type Page, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const THEME_MODES = ["system", "light", "dark"] as const;
const EFFECTIVE_COLOR_SCHEMES = ["light", "dark"] as const;

type ThemeMode = (typeof THEME_MODES)[number];
type EffectiveColorScheme = (typeof EFFECTIVE_COLOR_SCHEMES)[number];

function themeGroup(page: Page) {
  return page.getByRole("group", { name: "Theme" });
}

function themeButton(page: Page, mode: ThemeMode) {
  return themeGroup(page).getByRole("button", { name: `Use ${mode} theme` });
}

async function expectThemeModeSelected(page: Page, mode: ThemeMode) {
  await Promise.all(
    THEME_MODES.map((option) =>
      expect(themeButton(page, option)).toHaveAttribute(
        "aria-pressed",
        option === mode ? "true" : "false",
      ),
    ),
  );
}

async function expectEffectiveTheme(page: Page, colorScheme: EffectiveColorScheme) {
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme))
    .toContain(colorScheme);
}

async function selectThemeMode(page: Page, mode: Extract<ThemeMode, "light" | "dark">) {
  await themeButton(page, mode).click();
  await expectThemeModeSelected(page, mode);
}

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

for (const colorScheme of EFFECTIVE_COLOR_SCHEMES) {
  test(`home page has no detectable accessibility violations when system resolves ${colorScheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/");
    await expectThemeModeSelected(page, "system");
    await expectEffectiveTheme(page, colorScheme);
    await expectNoAccessibilityViolations(page);
  });
}

for (const mode of ["light", "dark"] as const) {
  test(`home page has no detectable accessibility violations in ${mode} mode`, async ({ page }) => {
    await page.goto("/");
    await selectThemeMode(page, mode);
    await expectEffectiveTheme(page, mode);
    await expectNoAccessibilityViolations(page);
  });
}

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

test("theme mode controls expose accessible names and selected state", async ({ page }) => {
  await page.goto("/");

  await expect(themeGroup(page)).toBeVisible();
  await Promise.all(THEME_MODES.map((mode) => expect(themeButton(page, mode)).toBeVisible()));
  await expectThemeModeSelected(page, "system");
});
