import assert from "node:assert/strict";
import { test, before, after } from "node:test";

// Visual regression checks for the reported layout defects. Geometry comes from
// the official Figma frames (frontend-mentor-starters invoice canvas.json).
const target = new URL(process.env.INVOICE_URL ?? "http://127.0.0.1:4395");
assert.ok(
  ["localhost", "127.0.0.1"].includes(target.hostname),
  "Local-only synthetic helper; hosted access requires an independent scoped transport.",
);
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
// Design badges are 104 px wide at every breakpoint. The 16 px text floor makes
// the label slightly wider than the 15 px design text, so allow a small margin.
const DESIGN_BADGE_WIDTH = 104;
const BADGE_MAX = DESIGN_BADGE_WIDTH + 16;
// Figma "Desktop - Create Invoice - Hover/Active/Error": #EC5757 text and border.
const DESIGN_RED = "rgb(236, 87, 87)";
let browser;
before(async () => {
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ??
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
});
after(async () => {
  await browser?.close();
});
async function fixture(run, width = 1440, setup) {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    serviceWorkers: "block",
  });
  if (setup) await context.addInitScript(setup);
  const errors = [];
  context.on("page", (page) =>
    page.on("pageerror", (error) => errors.push(error.message)),
  );
  try {
    const page = await context.newPage();
    await page.goto(target.href);
    await page.waitForFunction(() => {
      const select = document.querySelector("select");
      return select && !select.disabled;
    });
    await run(page);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}
// Finds each list cell by its content, so the check does not depend on markup.
async function columns(page) {
  return page.locator(".invoice-list > li").evaluateAll((rows) =>
    rows.map((row) => {
      const cells = [...row.querySelectorAll("a *")].filter(
        (node) =>
          node.getClientRects().length &&
          !node.classList.contains("sr-only") &&
          node.children.length === 0 &&
          node.textContent.trim(),
      );
      const find = (test) => {
        const node = cells.find((cell) => test(cell.textContent.trim()));
        return node ? node.getBoundingClientRect() : null;
      };
      const badge = row.querySelector(".badge")?.getBoundingClientRect();
      return {
        id: find((text) => /^#?INV-/.test(text))?.left,
        due: find((text) => /^(Due|\d{4}-\d{2}-\d{2}|Date incomplete)/.test(text))
          ?.left,
        client: find((text) => /^(Sample Client|Unnamed draft)/.test(text))
          ?.left,
        amount: find((text) => /^(£|Total incomplete)/.test(text))?.right,
        status: badge?.left,
      };
    }),
  );
}

for (const width of [400, 768, 1440]) {
  test(`delete dialog is centered with a backdrop at ${width}px`, async () =>
    fixture(async (page) => {
      await page.getByRole("link", { name: /INV-BBBBBBBB/ }).click();
      await page
        .getByRole("button", { name: "Delete invoice", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Delete INV-BBBBBBBB?",
        exact: true,
      });
      await dialog.waitFor();
      const box = await dialog.evaluate((node) => {
        const r = node.getBoundingClientRect();
        return {
          cx: r.left + r.width / 2,
          cy: r.top + r.height / 2,
          vw: document.documentElement.clientWidth,
          vh: innerHeight,
          backdrop: getComputedStyle(node, "::backdrop").backgroundColor,
        };
      });
      assert.ok(
        Math.abs(box.cx - box.vw / 2) <= 2,
        `dialog horizontal center ${box.cx} vs ${box.vw / 2}`,
      );
      assert.ok(
        Math.abs(box.cy - box.vh / 2) <= 2,
        `dialog vertical center ${box.cy} vs ${box.vh / 2}`,
      );
      // Figma "Desktop - Delete Prompt": black overlay at 50% opacity.
      assert.equal(box.backdrop, "rgba(0, 0, 0, 0.5)");
    }, width));
}

for (const width of [768, 1440]) {
  test(`invoice list columns align across rows at ${width}px`, async () =>
    fixture(async (page) => {
      await page.locator(".invoice-list > li").first().waitFor();
      const rows = await columns(page);
      assert.ok(rows.length >= 3, "seeded rows render");
      for (const key of ["id", "due", "client", "amount", "status"]) {
        const values = rows.map((row) => row[key]);
        assert.ok(
          values.every((value) => typeof value === "number"),
          `${key} column found in every row`,
        );
        const spread = Math.max(...values) - Math.min(...values);
        assert.ok(spread <= 1, `${key} column spread ${spread}px at ${width}`);
      }
    }, width));
}

for (const width of [400, 768, 1440]) {
  test(`status badges keep their designed width at ${width}px`, async () =>
    fixture(async (page) => {
      await page.locator(".invoice-list .badge").first().waitFor();
      const widths = await page
        .locator(".invoice-list .badge")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getBoundingClientRect().width),
        );
      assert.ok(
        widths.every((value) => value <= BADGE_MAX),
        `badge widths ${widths.join(", ")} exceed ${BADGE_MAX}px`,
      );
    }, width));
}

test("field error text uses the same design red as the invalid border", async () =>
  fixture(async (page) => {
    await page.getByRole("link", { name: "New invoice", exact: true }).click();
    await page.getByLabel("Client name", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Save as pending", exact: true })
      .click();
    const field = page.getByLabel("Client name", { exact: true });
    await page.locator("#clientName-error").waitFor();
    const border = await field.evaluate(
      (node) => getComputedStyle(node).borderTopColor,
    );
    const text = await page
      .locator("#clientName-error")
      .evaluate((node) => getComputedStyle(node).color);
    assert.equal(text, border, "error text matches the invalid border");
    assert.equal(border, DESIGN_RED);
  }));

// Queue A2 (independent QA findings).

// Measures the caret's inset from the control's inner right edge in pixels,
// so it works for native and custom arrows alike.
async function caretGap(page, locator) {
  await page.mouse.move(0, 0);
  const png = (await locator.screenshot()).toString("base64");
  const border = await locator.evaluate((node) =>
    Math.ceil(parseFloat(getComputedStyle(node).borderRightWidth) || 0),
  );
  return page.evaluate(
    async ({ png, border }) => {
      const image = new Image();
      image.src = "data:image/png;base64," + png;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const { data, width, height } = context.getImageData(
        0,
        0,
        image.width,
        image.height,
      );
      const pixel = (x, y) => {
        const i = (y * width + x) * 4;
        return [data[i], data[i + 1], data[i + 2]];
      };
      const background = pixel(Math.round(width / 2), border + 2);
      const inner = width - border;
      for (let x = inner - 1; x > width / 2; x--)
        for (let y = Math.round(height * 0.25); y < height * 0.75; y++) {
          const [r, g, b] = pixel(x, y);
          if (
            Math.abs(r - background[0]) +
              Math.abs(g - background[1]) +
              Math.abs(b - background[2]) >
            60
          )
            return inner - 1 - x;
        }
      return null;
    },
    { png, border },
  );
}
for (const theme of ["light", "dark"]) {
  test(`select carets sit at least 12px inside the right edge (${theme})`, async () =>
    fixture(async (page) => {
      if ((await page.locator(".app").getAttribute("data-theme")) !== theme)
        await page
          .getByRole("button", { name: "Use " + theme + " theme", exact: true })
          .click();
      await page.locator('[data-theme="' + theme + '"]').waitFor();
      const status = page.getByRole("combobox", { name: "Status", exact: true });
      const statusGap = await caretGap(page, status);
      assert.ok(statusGap !== null && statusGap >= 12, `Status caret gap ${statusGap}px`);
      await page.goto(target.origin + "/invoices/new");
      const terms = page.getByRole("combobox", {
        name: "Payment terms",
        exact: true,
      });
      await terms.waitFor();
      const termsGap = await caretGap(page, terms);
      assert.ok(termsGap !== null && termsGap >= 12, `Payment terms caret gap ${termsGap}px`);
    }));
}

// Holds every storage write for a moment so the pending state is observable,
// and counts the writes that reach localStorage.
function slowWrites() {
  // Init scripts also run on about:blank, which has no Web Locks.
  if (!navigator.locks) return;
  window.__writes = 0;
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (key === "invoice-synthetic-demo-v1") window.__writes++;
    return setItem.call(this, key, value);
  };
  const request = navigator.locks.request.bind(navigator.locks);
  navigator.locks.request = (name, work) =>
    request(name, async (lock) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      return work(lock);
    });
}
async function pendingState(button) {
  return button.evaluate((node) => ({
    disabled: node.disabled,
    busy: node.getAttribute("aria-busy"),
    focused: document.activeElement === node,
  }));
}
test("Mark paid stays focusable and busy, and ignores a repeat activation", async () =>
  fixture(
    async (page) => {
      await page.getByRole("link", { name: /INV-BBBBBBBB/ }).click();
      const mark = page.getByRole("button", { name: "Mark paid", exact: true });
      await mark.focus();
      await page.keyboard.press("Enter");
      assert.deepEqual(await pendingState(mark), {
        disabled: false,
        busy: "true",
        focused: true,
      });
      const reload = page.getByRole("button", {
        name: "Reload saved data",
        exact: true,
      });
      assert.equal(await reload.evaluate((node) => node.disabled), false);
      await page.keyboard.press("Enter");
      await mark.waitFor({ state: "detached" });
      assert.equal(await page.evaluate(() => window.__writes), 1);
      assert.equal(
        await page.getByText(/already in progress/).count(),
        0,
        "repeat activation is ignored quietly",
      );
    },
    1440,
    slowWrites,
  ));
test("Confirm deletion stays focusable and busy, and deletes once", async () =>
  fixture(
    async (page) => {
      await page.getByRole("link", { name: /INV-BBBBBBBB/ }).click();
      await page
        .getByRole("button", { name: "Delete invoice", exact: true })
        .click();
      const confirm = page.getByRole("button", {
        name: "Confirm deletion",
        exact: true,
      });
      await confirm.focus();
      await page.keyboard.press("Enter");
      assert.deepEqual(await pendingState(confirm), {
        disabled: false,
        busy: "true",
        focused: true,
      });
      await page.keyboard.press("Enter");
      assert.equal(await page.locator("dialog [role=alert]").count(), 0);
      await page.waitForURL(target.href);
      await page.getByRole("heading", { name: "Invoices", exact: true }).waitFor();
      const saved = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("invoice-synthetic-demo-v1")),
      );
      assert.equal(saved.invoices.length, 2);
    },
    1440,
    slowWrites,
  ));

test("Save draft stays focusable and busy while fields stay enabled", async () =>
  fixture(
    async (page) => {
      await page.getByRole("link", { name: "New invoice", exact: true }).click();
      const name = page.getByLabel("Client name", { exact: true });
      await name.waitFor();
      await name.fill("Busy state client");
      const save = page.getByRole("button", { name: "Save draft", exact: true });
      await save.focus();
      await page.keyboard.press("Enter");
      assert.deepEqual(await pendingState(save), {
        disabled: false,
        busy: "true",
        focused: true,
      });
      assert.equal(await name.evaluate((node) => node.disabled), false);
      await page.keyboard.press("Enter");
      await page.waitForURL(/\/invoices\/[a-f0-9-]+\/edit$/);
      const saved = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("invoice-synthetic-demo-v1")),
      );
      assert.equal(
        saved.invoices.filter((x) => x.draft?.clientName === "Busy state client")
          .length,
        1,
      );
    },
    1440,
    slowWrites,
  ));

for (const width of [390, 400]) {
  test(`detail line items fit without clipped scroll areas at ${width}px`, async () =>
    fixture(async (page) => {
      await page.goto(
        target.origin + "/invoices/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      );
      await page.locator(".paper").waitFor();
      const total = page.locator("tbody tr").first().locator("td").last();
      const box = await total.evaluate((node) => {
        const r = node.getBoundingClientRect();
        return { left: r.left, right: r.right, vw: innerWidth };
      });
      assert.ok(
        box.left >= 0 && box.right <= box.vw,
        `line total ${box.left}-${box.right} within ${box.vw}`,
      );
      const clipped = await page.locator("main *").evaluateAll((nodes) =>
        nodes
          .filter((node) => {
            if (node.closest(".sr-only")) return false;
            // Visually hidden (1 px clipped) content is not a scroll area.
            const rect = node.getBoundingClientRect();
            if (rect.width <= 1 && rect.height <= 1) return false;
            const style = getComputedStyle(node);
            return (
              ["auto", "scroll", "hidden", "clip"].includes(style.overflowX) &&
              node.scrollWidth > node.clientWidth + 1
            );
          })
          .map((node) => node.tagName + "." + node.className),
      );
      assert.deepEqual(clipped, []);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
    }, width));
}

test("home declares one site name in view, og:site_name and WebSite JSON-LD", async () =>
  fixture(async (page) => {
    const siteName = await page
      .locator('meta[property="og:site_name"]')
      .getAttribute("content");
    assert.ok(siteName, "og:site_name is present");
    const data = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((nodes) => nodes.map((node) => JSON.parse(node.textContent)));
    const site = data.find((item) => item["@type"] === "WebSite");
    assert.ok(site, "WebSite JSON-LD is present");
    assert.equal(site.name, siteName);
    assert.match(site.url, /^https:\/\//);
    assert.ok(
      (await page.locator("body").innerText()).includes(siteName),
      "site name is visible on the home page",
    );
  }));
