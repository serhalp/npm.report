import { expect, type Page, test } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { auditResult } from "./src/test/fixtures";

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

async function mockRecentReports(page: Page) {
  await page.route("**/api/reports/recent", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        additionalTrackedCount: 0,
        reports: [
          {
            id: "netlify-2026-06-27-abc12345",
            url: "/report/netlify-2026-06-27-abc12345",
            orgs: ["netlify"],
            capturedAt: "2026-06-27T12:00:00.000Z",
          },
        ],
      }),
    }),
  );
}

async function mockHistory(page: Page) {
  await page.route("**/api/reports/history?**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        orgs: ["netlify"],
        points: [
          {
            id: "netlify-2026-06-27-abc12345",
            url: "/report/netlify-2026-06-27-abc12345",
            capturedAt: "2026-06-27T12:00:00.000Z",
            total: 4,
            byLevel: {
              stagedPublish: 1,
              trustedPublisher: 1,
              provenance: 1,
              none: 1,
            },
            deprecated: 0,
            failureCount: 0,
          },
        ],
      }),
    }),
  );
}

async function mockSharedReport(page: Page) {
  const payload = {
    ...auditResult,
    external: {
      rows: [{ user: "outside-maintainer", pkg: "alpha" }],
      distinctUsers: 1,
      byUser: [{ user: "outside-maintainer", count: 1 }],
    },
  };

  await page.route("**/api/reports/a11y-report", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: "a11y-report",
        orgs: "netlify",
        scopeLabel: "ALL org packages",
        payload,
        createdAt: "2026-06-27T12:34:56.000Z",
        dailyTrackingEnabled: true,
        dailyTrackingNextRunAt: "2026-06-28T12:34:56.000Z",
      }),
    }),
  );

  await page.route("**/api/reports/history?**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        orgs: ["netlify"],
        points: [
          {
            id: "older-report",
            url: "/report/older-report",
            capturedAt: "2026-06-26T12:34:56.000Z",
            total: 2,
            byLevel: {
              stagedPublish: 0,
              trustedPublisher: 0,
              provenance: 1,
              none: 1,
            },
            deprecated: 1,
            failureCount: 0,
          },
          {
            id: "a11y-report",
            url: "/report/a11y-report",
            capturedAt: "2026-06-27T12:34:56.000Z",
            total: 2,
            byLevel: {
              stagedPublish: 0,
              trustedPublisher: 1,
              provenance: 0,
              none: 1,
            },
            deprecated: 1,
            failureCount: 1,
          },
        ],
      }),
    }),
  );
}

test.beforeEach(async ({ page }) => {
  await mockRecentReports(page);
});

async function expectNoAccessibilityViolations(page: Page) {
  await expect(page.getByRole("heading", { name: "npm.report", level: 1 })).toBeVisible();

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

test("shared report loading state is announced and axe-clean", async ({ page }) => {
  let releaseReport!: () => void;
  const reportPending = new Promise<void>((resolve) => {
    releaseReport = resolve;
  });

  await page.route("**/api/reports/loading-report", async (route) => {
    await reportPending;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: "loading-report",
        orgs: "netlify",
        scopeLabel: "last 12 months",
        payload: auditResult,
        createdAt: "2026-06-27T12:34:56.000Z",
        dailyTrackingEnabled: false,
        dailyTrackingNextRunAt: null,
      }),
    });
  });

  await page.goto("/report/loading-report");
  await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "true");
  await expect(
    page.getByRole("status").filter({
      hasText: "Loading report. Fetching the saved snapshot and trust history.",
    }),
  ).toBeAttached();
  await expect(page.locator(".shared-loading")).toBeVisible();
  await expectNoAccessibilityViolations(page);

  releaseReport();
  await expect(page.getByRole("heading", { name: "Audit of netlify" })).toBeVisible();
  await expect(page.getByRole("main")).toHaveAttribute("aria-busy", "false");
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

  test(`history panel has no detectable accessibility violations in ${mode} mode`, async ({
    page,
  }) => {
    await mockHistory(page);
    await page.goto("/");
    await selectThemeMode(page, mode);
    const orgs = page.getByRole("textbox", { name: "Organizations" });
    await orgs.fill("netlify");
    await orgs.press("Enter");
    await expect(page.getByRole("heading", { name: "Progress over time" })).toBeVisible();
    await expectNoAccessibilityViolations(page);
  });
}

test("home page controls expose accessible names", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Organizations" })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "Window (months)", exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("checkbox", { name: "Limit to recent packages" }).click();
  await expect(
    page.getByRole("spinbutton", { name: "Window (months)", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /^package trust level\b/i })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /^manual\b/i })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /^external\b/i })).toBeVisible();
  await expect(page.getByRole("group", { name: "Reports" })).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Exclude bot / CI accounts (manual report)" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Run audit" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "npm username" })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "User window (months)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Look up" })).toBeVisible();
});

test("form validation feedback is announced", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Run audit" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Add at least one npm organization." }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Look up" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Enter an npm username." })).toBeVisible();
});

test("theme mode controls expose accessible names and selected state", async ({ page }) => {
  await page.goto("/");

  await expect(themeGroup(page)).toBeVisible();
  await Promise.all(THEME_MODES.map((mode) => expect(themeButton(page, mode)).toBeVisible()));
  await expectThemeModeSelected(page, "system");
});

for (const mode of ["light", "dark"] as const) {
  test(`trust glossary is keyboard dismissible and axe-clean in ${mode} mode`, async ({ page }) => {
    await page.goto("/");
    await selectThemeMode(page, mode);

    const trigger = page.getByRole("button", { name: "What are trust signals?" });
    await trigger.focus();
    await trigger.press("Enter");
    await expect(page.locator("#trust-glossary")).toBeVisible();
    await expectNoAccessibilityViolations(page);
    await page.keyboard.press("Escape");
    await expect(page.locator("#trust-glossary")).toBeHidden();
    await expect(trigger).toBeFocused();
  });
}

for (const mode of ["light", "dark"] as const) {
  test(`populated shared report has no detectable accessibility violations in ${mode} mode`, async ({
    page,
  }) => {
    await mockSharedReport(page);
    await page.goto("/report/a11y-report");
    await selectThemeMode(page, mode);

    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { name: /audit of netlify/i })).toBeVisible();
    const tabs = page.getByRole("tablist", { name: "Audit reports" });
    await expect(tabs).toBeVisible();
    const auditTab = async (name: string, tableNames: string[]) => {
      await tabs.getByRole("tab", { name: new RegExp(name, "i") }).click();
      await Promise.all(
        tableNames.map((tableName) =>
          expect(page.getByRole("table", { name: tableName })).toBeVisible(),
        ),
      );
      await expectNoAccessibilityViolations(page);
    };
    await auditTab("package trust level", ["Package trust level report"]);
    await auditTab("manual", ["Manual publishes by publisher", "Manual publish detail"]);
    await auditTab("external", [
      "External maintainers by npm user",
      "External maintainer package access",
    ]);
  });
}

test("shared report tabs and chart snapshots support keyboard navigation", async ({ page }) => {
  await mockSharedReport(page);
  await page.goto("/report/a11y-report");

  const trustTab = page.getByRole("tab", { name: /package trust level/i });
  const manualTab = page.getByRole("tab", { name: /manual/i });
  await trustTab.focus();
  await trustTab.press("ArrowRight");
  await expect(manualTab).toBeFocused();
  await expect(manualTab).toHaveAttribute("aria-selected", "true");

  await Promise.all(
    (await page.getByRole("tab").all()).map(async (tab) => {
      const panelId = await tab.getAttribute("aria-controls");
      expect(panelId).toBeTruthy();
      await expect(page.locator(`#${panelId}`)).toHaveCount(1);
    }),
  );

  const snapshots = page.getByRole("group", { name: "Report snapshots" });
  const olderSnapshot = snapshots.locator('a[href="/report/older-report"]');
  const currentSnapshot = snapshots.locator('a[href="/report/a11y-report"]');
  await expect(currentSnapshot).toHaveAttribute("tabindex", "0");
  await expect(olderSnapshot).toHaveAttribute("tabindex", "-1");
  await currentSnapshot.focus();
  await currentSnapshot.press("ArrowLeft");
  await expect(olderSnapshot).toBeFocused();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await olderSnapshot.press("Escape");
  await expect(page.getByRole("tooltip")).toBeHidden();
});

test("populated user publish results remain axe-clean", async ({ page }) => {
  await page.route("**/api/user-publishes-stream", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: [
        'event: log\ndata: "[user] scanning publishes"',
        'event: result\ndata: {"user":"alice","scanned":2,"rows":[{"when":"2026-06-27T12:34:56.000Z","ref":"alpha@1.0.0"}]}',
        "event: done\ndata: {}",
        "",
      ].join("\n\n"),
    }),
  );
  await page.goto("/");
  await selectThemeMode(page, "light");
  await page.getByRole("textbox", { name: "npm username" }).fill("alice");
  await page.getByRole("button", { name: "Look up" }).click();
  await expect(page.getByText("alpha@1.0.0")).toBeVisible();
  await expectNoAccessibilityViolations(page);
});

test("forced-colors mode preserves focus and history-stack distinctions", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/");

  const input = page.getByRole("textbox", { name: "Organizations" });
  const wrapper = input.locator("..");
  const before = await wrapper.evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.outlineStyle, style.outlineWidth, style.boxShadow, style.borderColor];
  });
  await input.focus();
  const focused = await wrapper.evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.outlineStyle, style.outlineWidth, style.boxShadow, style.borderColor];
  });

  await mockSharedReport(page);
  await page.goto("/report/a11y-report");
  await expect(page.locator(".history-stack").first()).toBeVisible();
  const segmentPresentation = await page
    .locator(".history-stack")
    .first()
    .locator(":scope > span")
    .evaluateAll((segments) => {
      const styles = segments.map((segment) => getComputedStyle(segment));
      return {
        colors: [...new Set(styles.map((style) => style.backgroundColor))],
        patterns: [...new Set(styles.map((style) => style.backgroundImage))],
      };
    });

  expect({
    focusChanged: focused.join() !== before.join(),
    segmentColorCount: segmentPresentation.colors.length,
    segmentPatternCount: segmentPresentation.patterns.length,
  }).toEqual({ focusChanged: true, segmentColorCount: 4, segmentPatternCount: 4 });
});

test("populated shared report does not create page-level horizontal overflow on a narrow screen", async ({
  page,
}) => {
  test.fail(true, "Narrow-screen masthead reflow is intentionally out of scope.");
  await page.setViewportSize({ width: 375, height: 812 });
  await mockSharedReport(page);
  await page.goto("/report/a11y-report");
  await expect(page.getByRole("tablist", { name: "Audit reports" })).toBeVisible();

  const overflow = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const elements = [...document.querySelectorAll<HTMLElement>("body *")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          node: element,
          element: element.tagName.toLowerCase(),
          classes: element.className,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter(({ node, left, right }) => {
        if (left >= 0 && right <= viewportWidth) return false;
        let ancestor = node.parentElement;
        while (ancestor && ancestor !== document.body) {
          const overflowX = getComputedStyle(ancestor).overflowX;
          if (["auto", "scroll", "hidden", "clip"].includes(overflowX)) return false;
          ancestor = ancestor.parentElement;
        }
        const parentRect = node.parentElement?.getBoundingClientRect();
        return !parentRect || (parentRect.left >= 0 && parentRect.right <= viewportWidth);
      })
      .map(({ node: _node, ...element }) => element);

    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth,
      elements,
    };
  });

  expect(overflow).toEqual({ documentWidth: 375, viewportWidth: 375, elements: [] });
});
