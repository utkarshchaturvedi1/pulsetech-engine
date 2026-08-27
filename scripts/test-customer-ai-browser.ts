import { spawn } from "node:child_process";
import { chromium, devices } from "@playwright/test";
import type { BusinessProfile } from "../src/types/business";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function waitForServer(url: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Next.js test server did not start.");
}

/** Dedicated slug so this test never reads human Autrey/dallasplumbing demo records. */
const TEST_DEMO_ID = "pt-browser-widget-isolation";
const TEST_STORAGE_KEY = `pulsetech-demo:${TEST_DEMO_ID}`;

const demoProfile: BusinessProfile = {
  website: `https://${TEST_DEMO_ID}.example`,
  businessName: "Autrey's Plumbing LLC",
  tagline: "Dallas plumbing",
  logo: "https://brand.example/full-logo.png",
  siteIcon:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%23b45309'/%3E%3C/svg%3E",
  primaryColor: "#b45309",
  secondaryColor: "#1c1917",
  phone: "214-555-0100",
  email: "hello@example.com",
  leadNotificationEmail: "owner-private@example.com",
  address: "Dallas, TX",
  services: ["Kitchen sink replacement"],
  serviceAreas: ["Dallas"],
  faqs: [],
  leadQuestions: [],
  systemPrompt: "Residential plumbing.",
};

function storedDemo(profile: BusinessProfile) {
  return JSON.stringify({
    id: TEST_DEMO_ID,
    profile,
    updatedAt: new Date().toISOString(),
  });
}

async function isolateDemoState(
  page: import("@playwright/test").Page,
  profile: BusinessProfile
) {
  const raw = storedDemo(profile);
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.removeItem("pulsetech-demo:dallasplumbing");
      window.localStorage.setItem(key, value);
    },
    { key: TEST_STORAGE_KEY, value: raw }
  );
  await page.route("**/api/demo/**", async (route) => {
    const method = route.request().method();
    if (method === "GET" || method === "PUT") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: raw,
      });
      return;
    }
    await route.continue();
  });
}

async function isServerUp(url: string) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function main() {
  let server: ReturnType<typeof spawn> | null = null;
  let baseUrl = "http://localhost:3000";

  if (!(await isServerUp(`${baseUrl}/`))) {
    const port = 3100;
    baseUrl = `http://localhost:${port}`;
    server = spawn(process.execPath, ["./node_modules/next/dist/bin/next", "start", "--port", String(port)], {
      stdio: "inherit",
      env: { ...process.env, LEAD_HANDOFF_DRY_RUN: "true" },
    });
    await waitForServer(`${baseUrl}/`);
  }

  const demoUrl = `${baseUrl}/demo/${TEST_DEMO_ID}`;

  try {
    const browser = await chromium.launch();

    async function exercise(label: string, page: import("@playwright/test").Page) {
      let requestCount = 0;
      const longReply = Array.from(
        { length: 55 },
        () =>
          "Based on what you've shared, the team can review the request and confirm the appropriate next step."
      ).join(" ");
      await isolateDemoState(page, demoProfile);
      await page.route("**/api/chat", async (route) => {
        requestCount += 1;
        await new Promise((resolve) => setTimeout(resolve, requestCount === 1 ? 280 : 20));
        const replies = [
          "Absolutely — we can help replace your kitchen sink. What's your first name?",
          "Thanks, David. What's the best phone number to reach you?",
          "What is the service address for the kitchen sink replacement?",
          longReply,
        ];
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            reply: replies[requestCount - 1] || "Thank you — we have your request.",
            salesState: null,
          }),
        });
      });

      await page.goto(demoUrl);
      await page.getByPlaceholder("Ask me anything...").waitFor();
      const shell = page
        .locator("[data-customer-widget-shell]")
        .filter({ hasText: "Autrey's Plumbing LLC" });
      await shell.waitFor();
      const input = page.getByPlaceholder("Ask me anything...");
      const width = await shell.boundingBox();
      if (!label.includes("mobile")) {
        assert(!!width && width.width >= 350 && width.width <= 425, `${label}: widget desktop width was ${width?.width}.`);
      } else {
        assert(!!width && width.width > 0 && width.width <= 390, `${label}: widget must fit mobile width, got ${width?.width}.`);
      }
      assert(await input.isVisible(), `${label}: Chat input renders.`);
      assert(await input.getAttribute("placeholder") === "Ask me anything...", `${label}: Composer placeholder is readable.`);
      const composer = shell.locator("[data-chat-composer]");
      assert(await composer.isVisible(), `${label}: Composer is clearly rendered.`);
      const composerField = shell.locator("[data-chat-composer-field]");
      assert(await composerField.isVisible(), `${label}: Message entry area is visible.`);
      const send = shell.locator("[data-chat-send]");
      assert(await send.isVisible(), `${label}: Send button is visible.`);

      const avatar = shell.locator("[data-compact-avatar]");
      const avatarSrc = await avatar.getAttribute("src");
      assert(
        avatarSrc === demoProfile.siteIcon,
        `${label}: compact header uses site icon, not full logo.`
      );
      assert(await shell.getAttribute("data-theme-source") === "brand", `${label}: analyzed theme is applied.`);
      const sendColor = await send.evaluate((node) => getComputedStyle(node).backgroundColor);
      // Disabled send is slate; type first so it becomes branded.
      await input.fill("I need to replace my kitchen sink.");
      const enabledSendColor = await send.evaluate((node) => getComputedStyle(node).backgroundColor);
      assert(enabledSendColor !== "rgb(37, 99, 235)", `${label}: send button uses brand accent, not default blue (${enabledSendColor}).`);
      void sendColor;

      await input.press("Enter");
      assert(await input.isDisabled(), `${label}: Input is disabled while a response is pending.`);
      await page.getByText("What's your first name?", { exact: false }).waitFor();
      assert(!(await input.isDisabled()), `${label}: Input re-enables after the response.`);
      const focused = await input.evaluate((node) => document.activeElement === node);
      assert(focused, `${label}: Input automatically regains focus after the assistant reply.`);

      await input.fill("David");
      await input.press("Enter");
      await page.getByText("best phone number", { exact: false }).waitFor();
      await input.fill("3333333333");
      await input.press("Enter");
      await page.getByText("service address", { exact: false }).waitFor();
      await input.fill("1500 Marilla St, Dallas TX 75201");
      await input.press("Enter");
      await page.getByText("Based on what you've shared", { exact: false }).waitFor();
      assert(await page.getByText("I need to replace my kitchen sink.", { exact: true }).isVisible(), `${label}: Customer messages render.`);
      const transcript = shell.locator("[data-chat-transcript]");
      const longBubble = shell.getByText("Based on what you've shared", { exact: false }).last();
      const transcriptBox = await transcript.boundingBox();
      const longBubbleBox = await longBubble.boundingBox();
      assert(
        !!transcriptBox && !!longBubbleBox &&
          longBubbleBox.y >= transcriptBox.y - 8 &&
          longBubbleBox.y < transcriptBox.y + transcriptBox.height * 0.6,
        `${label}: A long assistant response begins in the visible reading area.`
      );
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      assert(!overflow, `${label}: layout has no horizontal overflow.`);
      const widgetOverflow = await shell.evaluate((node) => node.scrollWidth > node.clientWidth + 1);
      assert(!widgetOverflow, `${label}: widget has no horizontal overflow.`);
      assert(await composer.isVisible(), `${label}: composer remains visible.`);
      assert(await send.isVisible(), `${label}: send remains accessible.`);
    }

    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await exercise("desktop", desktop);
    await desktop.close();

    const mobile = await browser.newPage({
      ...devices["iPhone 13"],
    });
    await exercise("mobile", mobile);
    await mobile.close();

    const fallbackPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const strippedProfile = {
      ...demoProfile,
      siteIcon: "",
      logo: "",
      primaryColor: "",
      secondaryColor: "",
    };
    await isolateDemoState(fallbackPage, strippedProfile);
    await fallbackPage.goto(demoUrl);
    const fallbackShell = fallbackPage
      .locator("[data-customer-widget-shell]")
      .filter({ hasText: "Autrey's Plumbing LLC" });
    await fallbackShell.waitFor();
    assert(await fallbackShell.locator("[data-compact-avatar-fallback]").isVisible(), "Fallback initials render when no site icon exists.");
    assert(await fallbackShell.getAttribute("data-theme-source") === "fallback", "Missing branding uses the safe theme fallback.");
    await fallbackPage.close();

    // Peter lead-notification email UX — Email address must be bold and asked before testing invite
    const peterPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const peterDemoId = "pt-browser-peter-email";
    const peterProfile: BusinessProfile = {
      ...demoProfile,
      website: `https://${peterDemoId}.example`,
      businessName: "Peter Email Setup Co",
      leadNotificationEmail: "",
    };
    const peterKey = `pulsetech-demo:${peterDemoId}`;
    const peterRaw = JSON.stringify({
      id: peterDemoId,
      profile: peterProfile,
      updatedAt: new Date().toISOString(),
    });
    await peterPage.addInitScript(
      ({ key, value }) => {
        window.localStorage.setItem(key, value);
      },
      { key: peterKey, value: peterRaw }
    );
    await peterPage.route("**/api/demo/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: peterRaw,
      });
    });
    await peterPage.goto(`${baseUrl}/demo/${peterDemoId}`);
    await peterPage.getByText("Before you start customer testing", { exact: false }).waitFor();
    const emailStrong = peterPage.locator("strong", { hasText: "Email address" }).first();
    assert(await emailStrong.isVisible(), "Peter: Email address must render bold.");
    const fontWeight = await emailStrong.evaluate((node) => getComputedStyle(node).fontWeight);
    assert(
      Number(fontWeight) >= 600 || fontWeight === "bold",
      `Peter: Email address font-weight should be bold, got ${fontWeight}`
    );
    assert(
      !(await peterPage.getByText("Now put it to work", { exact: false }).isVisible().catch(() => false)),
      "Peter: testing invite must not appear before email is captured"
    );
    assert(
      await peterPage.getByText("Email address", { exact: false }).first().isVisible(),
      "Peter header/help must highlight Email address when missing"
    );
    const peterShot = "E:/Products/Pulsetech Labs/pulsetech-engine/.data/live-sales/peter-email-bold.png";
    await peterPage.screenshot({ path: peterShot, fullPage: true });
    await peterPage.close();

    await browser.close();
    console.log("Customer AI browser acceptance PASS — desktop/mobile widget, composer, auto-focus, pending lock, site icon, theme, overflow, long-reply reading position, and Peter bold Email address setup.");
  } finally {
    server?.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
