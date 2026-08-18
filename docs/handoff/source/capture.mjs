/**
 * Re-captures every console screenshot in the handbook.
 *
 * Needed whenever something changes in the shared shell, because the sidebar
 * appears in all twenty of them: adding the Help link made every existing
 * screenshot show a navigation that no longer exists.
 *
 * Two things this gets right that the obvious version does not:
 *
 *   - The session token is re-seeded by an init script that runs before page
 *     scripts on EVERY navigation. The console clears its stored token when a
 *     request comes back 401, so seeding it once means one unlucky response
 *     silently logs the run out and every screenshot after it is the sign-in
 *     page.
 *   - Every capture asserts it is not on /login. A screenshot run that fails
 *     this way produces perfectly valid PNGs of the wrong screen, so it has to
 *     fail loudly or it ships.
 *
 * Learner names, phone numbers and staff emails are replaced before capture.
 * This document gets forwarded.
 */
import { chromium } from "file:///C:/Users/Dell/AppData/Local/npm-cache/_npx/5e2e484947874241/node_modules/playwright-core/index.mjs";

const TOKEN = process.env.ADMIN_TOKEN;
const OUT = "D:/work/Tar/PROJECTS/SHE-TRADES/docs/handoff/source";
const BASE = "http://localhost:3000";

if (!TOKEN) {
  console.error("ADMIN_TOKEN is not set");
  process.exit(1);
}

const MASK_LEARNERS = () => {
  const NAMES = ["Adaeze Okonkwo", "Ngozi Ibrahim", "Fatima Bello"];
  const PHONES = ["234 801 \u2022\u2022\u2022 4417", "234 805 \u2022\u2022\u2022 2290", "234 703 \u2022\u2022\u2022 8851"];
  document.querySelectorAll("main tbody tr").forEach((row, i) => {
    const cell = row.querySelector("td");
    if (!cell) return;
    const texts = [];
    const walk = (n) => {
      for (const c of [...n.childNodes]) {
        if (c.nodeType === 3 && c.nodeValue.trim()) texts.push(c);
        else if (c.nodeType === 1) walk(c);
      }
    };
    walk(cell);
    if (texts[0]) texts[0].nodeValue = NAMES[i % NAMES.length];
    if (texts[1]) texts[1].nodeValue = PHONES[i % PHONES.length];
  });
};

const MASK_EMAILS = () => {
  const SAMPLE = ["amina.bello@techher.org", "grace.o@care.org", "programme@shetrades.example"];
  let i = 0;
  const walk = (n) => {
    for (const c of [...n.childNodes]) {
      if (c.nodeType === 3 && /@[a-z0-9.-]+\.[a-z]{2,}/i.test(c.nodeValue)) {
        c.nodeValue = c.nodeValue.replace(/[\w.+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, () => SAMPLE[i++ % SAMPLE.length]);
      } else if (c.nodeType === 1) walk(c);
    }
  };
  walk(document.querySelector("main") || document.body);
  document.querySelectorAll('input[type="email"], input[value*="@"]').forEach((el) => {
    el.value = "amina.bello@techher.org";
    el.setAttribute("value", "amina.bello@techher.org");
  });
};

const SHOTS = [
  { file: "shot-01-login.png", url: "/login", allowLogin: true },
  { file: "shot-02-overview.png", url: "/dashboard", full: true },
  { file: "shot-03-users.png", url: "/users", full: true, mask: MASK_LEARNERS },
  {
    file: "shot-04-user-drawer.png",
    url: "/users",
    mask: MASK_LEARNERS,
    after: async (page) => {
      await page.locator('main tbody tr:first-child button[aria-label="Preview learner profile"]').click();
      await page.waitForTimeout(1200);
      await page.evaluate(() => {
        const drawer = document.querySelector('.ui-side-drawer, [class*="drawer"]');
        if (!drawer) return;
        const walk = (n) => {
          for (const c of [...n.childNodes]) {
            if (c.nodeType === 3 && /\d{10,15}/.test(c.nodeValue)) {
              c.nodeValue = c.nodeValue.replace(/\d{10,15}/, "234 801 \u2022\u2022\u2022 4417");
            } else if (c.nodeType === 1) walk(c);
          }
        };
        walk(drawer);
      });
    }
  },
  { file: "shot-05-analytics.png", url: "/analytics", full: true },
  { file: "shot-06-content.png", url: "/content", skipTour: true },
  {
    file: "shot-07-content-create.png",
    url: "/content",
    skipTour: true,
    after: async (page) => {
      await page.locator('button:has-text("Create Content")').click();
      await page.waitForTimeout(1500);
      const skip = page.locator('button:has-text("Skip tour")').first();
      if (await skip.count()) await skip.click().catch(() => {});
      await page.waitForTimeout(600);
    }
  },
  { file: "shot-08-rewards.png", url: "/rewards", full: true },
  { file: "shot-09-reports.png", url: "/reports", full: true },
  { file: "shot-10-certificates.png", url: "/certificates", full: true },
  { file: "shot-11-template-editor.png", url: "/certificates/template", settle: 9000 },
  { file: "shot-12-template-inspector.png", url: "/certificates/template", settle: 9000, scroll: 980 },
  { file: "shot-13-settings-integration.png", url: "/settings?tab=integration" },
  { file: "shot-14-whatsapp-sandbox.png", url: "/settings?tab=integration", scroll: 1750 },
  { file: "shot-15-settings-options.png", url: "/settings?tab=options" },
  { file: "shot-16-settings-rewards.png", url: "/settings?tab=rewards" },
  { file: "shot-17-settings-admins.png", url: "/settings?tab=admins", mask: MASK_EMAILS },
  { file: "shot-18-settings-branding.png", url: "/settings?tab=branding" },
  { file: "shot-19-settings-legal.png", url: "/settings?tab=legal" },
  { file: "shot-20-profile.png", url: "/profile", mask: MASK_EMAILS }
];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });

// Runs before any page script, on every navigation.
await context.addInitScript((token) => {
  localStorage.setItem("admin_session_jwt", token);
  localStorage.setItem("admin_config_jwt", token);
}, TOKEN);

const page = await context.newPage();
const failures = [];

for (const shot of SHOTS) {
  await page.goto(BASE + shot.url, { waitUntil: "networkidle" }).catch(() => {});
  await page.waitForTimeout(shot.settle ?? (shot.url.includes("settings") || shot.url === "/content" ? 4500 : 3000));

  if (!shot.allowLogin && page.url().includes("/login")) {
    failures.push(`${shot.file}: landed on the sign-in page`);
    continue;
  }

  if (shot.skipTour) {
    const skip = page.locator('button:has-text("Skip tour")').first();
    if (await skip.count()) await skip.click().catch(() => {});
    await page.waitForTimeout(500);
  }
  if (shot.after) await shot.after(page);
  if (shot.mask) await page.evaluate(shot.mask);
  if (shot.scroll) {
    await page.evaluate((y) => window.scrollTo(0, y), shot.scroll);
    await page.waitForTimeout(600);
  }

  await page.screenshot({
    path: `${OUT}/${shot.file}`,
    fullPage: Boolean(shot.full),
    scale: "css",
    type: "png"
  });
  console.log("captured", shot.file);
}

await browser.close();

if (failures.length) {
  console.error("\nFAILED:");
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log("all captured");
