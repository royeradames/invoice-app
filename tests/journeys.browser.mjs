import assert from "node:assert/strict";
import { after, before, test } from "node:test";

// Every journey in the Frontend Mentor brief, clicked from the entry page in a
// real browser, plus the layout defects from the October 7 QA phase.
const target = new URL(process.env.INVOICE_URL ?? "http://127.0.0.1:4395");
assert.ok(
  ["localhost", "127.0.0.1"].includes(target.hostname),
  "Local-only helper: point INVOICE_URL at a local next start.",
);
const KEY = "invoice-app-v2";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
let browser;
before(async () => {
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
});
after(async () => {
  await browser?.close();
});

async function fixture(run, { width = 1440, height = 900, setup, path = "/" } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block" });
  const errors = [];
  context.on("page", (page) => {
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
  });
  if (setup) await context.addInitScript(setup);
  try {
    const page = await context.newPage();
    await page.goto(new URL(path, target).href);
    await ready(page);
    await run(page, context);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}
async function ready(page) {
  await page.waitForFunction(() => !document.body.textContent.includes("Opening "));
}
const rows = (page) => page.locator(".invoice-list > li");
const stored = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
const drawer = (page) => page.locator("dialog.drawer");
async function openNew(page) {
  await page.getByRole("button", { name: /New( Invoice)?/ }).click();
  await drawer(page).getByRole("heading", { name: "New Invoice" }).waitFor();
}
function today(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return String(d.getDate()).padStart(2, "0") + " " + m[d.getMonth()] + " " + d.getFullYear();
}
async function fillAddress(scope, values) {
  for (const [label, value] of values)
    await scope.getByLabel(label, { exact: true }).fill(value);
}
async function fillComplete(page) {
  const d = drawer(page);
  const groups = d.locator("fieldset.group");
  await fillAddress(groups.nth(0), [
    ["Street Address", "19 Union Terrace"],
    ["City", "London"],
    ["Post Code", "E1 3EZ"],
    ["Country", "United Kingdom"],
  ]);
  await d.getByLabel("Client’s Name").fill("Alex Grim");
  await d.getByLabel("Client’s Email").fill("alexgrim@mail.com");
  await fillAddress(groups.nth(1), [
    ["Street Address", "84 Church Way"],
    ["City", "Bradford"],
    ["Post Code", "BD1 9PB"],
    ["Country", "United Kingdom"],
  ]);
  await d.getByLabel("Project Description").fill("Graphic Design");
}
async function addItem(page, n, name, qty, price) {
  const d = drawer(page);
  await d.getByRole("button", { name: "+ Add New Item" }).click();
  await d.getByRole("textbox", { name: "Item Name for item " + n }).fill(name);
  await d.getByRole("textbox", { name: "Qty. for item " + n }).fill(qty);
  await d.getByRole("textbox", { name: "Price for item " + n }).fill(price);
}

test("list opens with the brief's data.json invoices and identity metadata", () =>
  fixture(async (page) => {
    await page.getByRole("heading", { level: 1, name: "Invoices" }).waitFor();
    assert.equal(await rows(page).count(), 7);
    assert.ok(await page.getByText("There are 7 total invoices").isVisible());
    const xm = rows(page).filter({ hasText: "XM9141" });
    assert.match(await xm.innerText(), /Due 20 Sep 2021[\s\S]*Alex Grim[\s\S]*£\s556\.00[\s\S]*Pending/);
    assert.equal(
      await page.locator('meta[property="og:site_name"]').getAttribute("content"),
      "Invoice demo",
    );
    const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').innerText());
    assert.equal(ld["@type"], "WebSite");
  }));

test("filter by status with checkboxes, by keyboard, and it survives reload", () =>
  fixture(async (page) => {
    const toggle = page.getByRole("button", { name: /Filter by status/ });
    await toggle.focus();
    await page.keyboard.press("Enter");
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    await page.getByRole("checkbox", { name: "Draft" }).check();
    await page.waitForFunction(() => document.querySelectorAll(".invoice-list > li").length === 1);
    assert.ok(await page.getByText("There is 1 draft invoice").isVisible());
    await page.getByRole("checkbox", { name: "Paid" }).check();
    await page.waitForFunction(() => document.querySelectorAll(".invoice-list > li").length === 3);
    await page.keyboard.press("Escape");
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    assert.equal(await page.evaluate(() => document.activeElement?.className), "filter-button");
    await page.reload();
    await ready(page);
    assert.equal(await rows(page).count(), 3);
    await toggle.click();
    await page.getByRole("checkbox", { name: "Draft" }).uncheck();
    await page.getByRole("checkbox", { name: "Paid" }).uncheck();
    await page.waitForFunction(() => document.querySelectorAll(".invoice-list > li").length === 7);
  }));

test("empty state shows the illustration and how to start", () =>
  fixture(
    async (page) => {
      await page.getByRole("heading", { name: "There is nothing here" }).waitFor();
      assert.ok(await page.getByText(/Create an invoice by clicking the\s+New Invoice\s+button and get started/).isVisible());
      assert.ok(await page.getByText("There are 0 total invoices").isVisible());
    },
    {
      setup: () => {
        if (location.protocol !== "http:") return;
        if (!sessionStorage.getItem("seeded")) {
          sessionStorage.setItem("seeded", "1");
          localStorage.setItem(
            "invoice-app-v2",
            JSON.stringify({ version: 2, revision: "11111111-1111-4111-8111-111111111111", invoices: [], theme: "light", filter: [] }),
          );
        }
      },
    },
  ));

test("Save & Send on an empty form shows every error and focuses the first field", () =>
  fixture(async (page) => {
    await openNew(page);
    await drawer(page).getByRole("button", { name: "Save & Send" }).click();
    const d = drawer(page);
    await d.getByText("- All fields must be added").waitFor();
    assert.ok(await d.getByText("- An item must be added").isVisible());
    assert.equal(await d.locator('[aria-invalid="true"]').count(), 11);
    assert.equal(await d.getByText("can't be empty").count(), 11);
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      "f-senderAddress-street",
    );
    // Fixing a field clears only its own error.
    await page.keyboard.type("19 Union Terrace");
    assert.equal(await d.locator('[aria-invalid="true"]').count(), 10);
    // A bad email and a bad price are named, not just "empty".
    await d.getByLabel("Client’s Email").fill("nope");
    await addItem(page, 1, "Logo", "1", "12.345");
    await d.getByRole("button", { name: "Save & Send" }).click();
    await d.getByText("invalid email").waitFor();
    assert.ok(await d.getByText("- Client's email must be a valid address").isVisible());
    assert.ok(await d.getByText(/- Quantities must be whole numbers/).isVisible());
    assert.equal(await rows(page).count(), 7);
  }));

test("Save as Draft keeps a partial invoice with a new AA0000 ID", () =>
  fixture(async (page) => {
    await openNew(page);
    await drawer(page).getByLabel("Client’s Name").fill("Partial Client");
    await drawer(page).getByRole("button", { name: "Save as Draft" }).click();
    await drawer(page).waitFor({ state: "detached" });
    assert.equal(await rows(page).count(), 8);
    const row = rows(page).last();
    assert.match(await row.innerText(), /#[A-Z]{2}\d{4}[\s\S]*Partial Client[\s\S]*£\s0\.00[\s\S]*Draft/);
    // A visible, announced confirmation names the new status.
    const id = (await row.locator(".row-id").innerText()).replace("#", "");
    const flash = page.locator('p.flash[role="status"]');
    assert.equal(await flash.innerText(), "Invoice #" + id + " saved as a draft.");
    assert.ok(await flash.isVisible());
    // Focus returns to New Invoice.
    assert.match(await page.evaluate(() => document.activeElement?.textContent ?? ""), /New/);
    await page.reload();
    await ready(page);
    assert.equal(await rows(page).count(), 8);
    const saved = await stored(page);
    assert.equal(saved.invoices.at(-1).status, "draft");
    assert.equal(saved.invoices.at(-1).clientEmail, "");
  }));

test("Save & Send creates a pending invoice; items add, remove and total", () =>
  fixture(async (page) => {
    await openNew(page);
    await fillComplete(page);
    const d = drawer(page);
    await d.getByLabel("Payment Terms").selectOption("7");
    await addItem(page, 1, "Banner Design", "1", "156");
    await addItem(page, 2, "Email Design", "2", "200");
    await addItem(page, 3, "Spare", "3", "1");
    const totals = d.locator(".item-total-value");
    await d.getByRole("textbox", { name: "Item Name for item 1" }).focus(); // blur the last price
    assert.equal((await totals.allInnerTexts()).join("|"), "156.00|400.00|3.00");
    assert.equal(await totals.count(), 3);
    assert.equal(await d.getByRole("textbox", { name: "Price for item 1" }).inputValue(), "156.00");
    await d.getByRole("button", { name: "Delete item 3: Spare" }).click();
    assert.equal(await totals.count(), 2);
    await d.getByRole("button", { name: "Save & Send" }).click();
    await d.waitFor({ state: "detached" });
    const row = rows(page).last();
    assert.match(await row.innerText(), new RegExp("Due " + today(7) + "[\\s\\S]*Alex Grim[\\s\\S]*£\\s556\\.00[\\s\\S]*Pending"));
    await row.click();
    await page.waitForURL(/\/invoices\/[A-Z]{2}\d{4}$/);
    await page.getByText("Payment Due").waitFor();
    assert.ok(await page.getByText(today(7)).first().isVisible());
    assert.ok(await page.locator(".amount-due").getByText("£ 556.00").isVisible());
  }));

test("deleting the first of three items keeps the other rows' values and totals", () =>
  fixture(async (page) => {
    await openNew(page);
    const d = drawer(page);
    await addItem(page, 1, "First", "1", "10");
    await addItem(page, 2, "Second", "2", "20");
    await addItem(page, 3, "Third", "3", "30");
    await d.getByRole("button", { name: "Delete item 1: First" }).click();
    const values = await d.locator(".item-row").evaluateAll((rows) =>
      rows.map((row) => [...row.querySelectorAll("input")].map((i) => i.value).join("/")),
    );
    assert.deepEqual(values, ["Second/2/20.00", "Third/3/30.00"]);
    assert.equal((await d.locator(".item-total-value").allInnerTexts()).join("|"), "40.00|90.00");
    await page.waitForFunction(
      () => document.activeElement?.textContent?.trim() === "Delete item 1: Second",
      null,
      { timeout: 2000 },
    );
    // Typing into the shifted row edits that row, not its old index.
    await d.getByRole("textbox", { name: "Qty. for item 1" }).fill("5");
    assert.equal((await d.locator(".item-total-value").allInnerTexts()).join("|"), "100.00|90.00");
  }));

test("calendar picks a date by keyboard and shows the design format", () =>
  fixture(async (page) => {
    await openNew(page);
    const d = drawer(page);
    const button = d.getByRole("button", { name: /Invoice Date/ });
    assert.equal((await button.innerText()).trim(), today());
    await button.click();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    assert.equal((await button.innerText()).trim(), today(1));
    assert.equal(await page.evaluate(() => document.activeElement?.id), "f-createdAt");
    // Month buttons keep focus; Home and End move within the week.
    await button.click();
    await d.getByRole("button", { name: "Next month" }).click();
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Next month");
    await page.keyboard.press("Escape");
    await button.click();
    await page.keyboard.press("End");
    const end = await page.evaluate(() => document.activeElement?.getAttribute("data-date"));
    assert.equal(new Date(end + "T12:00:00").getDay(), 0);
    await page.keyboard.press("Home");
    const start = await page.evaluate(() => document.activeElement?.getAttribute("data-date"));
    assert.equal(new Date(start + "T12:00:00").getDay(), 1);
    await page.keyboard.press("Escape");
    // Escape closes only the calendar; the drawer stays open.
    await button.click();
    await page.keyboard.press("Escape");
    assert.ok(await d.isVisible());
  }));

test("edit: Cancel discards changes; Save Changes on a draft makes it pending", () =>
  fixture(async (page) => {
    await rows(page).filter({ hasText: "XM9141" }).click();
    await page.getByRole("heading", { name: "#XM9141" }).waitFor();
    await page.getByRole("button", { name: "Edit", exact: true }).first().click();
    const d = drawer(page);
    await d.getByRole("heading", { name: "Edit #XM9141" }).waitFor();
    await d.getByLabel("Client’s Name").fill("Changed Name");
    await d.getByRole("button", { name: "Cancel" }).click();
    await d.waitFor({ state: "detached" });
    assert.ok(await page.getByText("Alex Grim").isVisible());
    await page.getByRole("button", { name: "Edit", exact: true }).first().click();
    assert.equal(await d.getByLabel("Client’s Name").inputValue(), "Alex Grim");
    await d.getByRole("button", { name: "Cancel" }).click();

    await page.getByRole("link", { name: "Go back" }).click();
    await rows(page).filter({ hasText: "FV2353" }).click();
    await page.getByRole("heading", { name: "#FV2353" }).waitFor();
    await page.getByRole("button", { name: "Edit", exact: true }).first().click();
    await d.getByRole("button", { name: "Save Changes" }).click();
    // The draft has no email or client address yet, so all fields are required.
    await d.getByText("- All fields must be added").waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.id), "f-clientEmail");
    await d.getByLabel("Client’s Email").fill("anita@mail.com");
    const groups = d.locator("fieldset.group");
    await fillAddress(groups.nth(1), [
      ["Street Address", "1 Test Road"],
      ["City", "Leeds"],
      ["Post Code", "LS1 1AA"],
      ["Country", "United Kingdom"],
    ]);
    await d.getByRole("button", { name: "Save Changes" }).click();
    await d.waitFor({ state: "detached" });
    assert.equal(await page.locator(".status .badge").innerText(), "Pending");
    assert.equal(
      await page.locator('p.flash[role="status"]').innerText(),
      "Changes saved. Invoice #FV2353 is now pending. No email was sent.",
    );
    assert.ok(await page.getByRole("button", { name: "Mark as Paid" }).first().isVisible());
  }));

test("Mark as Paid stays focusable and busy, then marks paid once", () =>
  fixture(
    async (page) => {
      await rows(page).filter({ hasText: "XM9141" }).click();
      const mark = page.locator(".wide-actions").getByRole("button", { name: "Mark as Paid" });
      await mark.click();
      const busy = page.locator('.wide-actions button[aria-busy="true"]');
      await busy.waitFor();
      assert.equal(await busy.innerText(), "Marking as paid…");
      assert.equal(await busy.isDisabled(), false);
      await busy.click(); // repeat activation is ignored
      await page.locator(".status .badge", { hasText: "Paid" }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Mark as Paid" }).count(), 0);
      assert.equal(await page.evaluate(() => document.activeElement?.className), "status");
      const saved = await stored(page);
      assert.equal(saved.invoices.find((x) => x.id === "XM9141").status, "paid");
      assert.equal(saved.invoices.filter((x) => x.status === "paid").length, 3);
    },
    {
      setup: () => {
        // Hold every storage lock for 400 ms so the busy state is observable.
        if (!navigator.locks) return;
        const original = navigator.locks.request.bind(navigator.locks);
        navigator.locks.request = (name, work) =>
          original(name, () => new Promise((r) => setTimeout(r, 400)).then(work));
      },
    },
  ));

test("a slow save shows busy text at once and a still-working hint after 3 s", () =>
  fixture(
    async (page) => {
      await openNew(page);
      const d = drawer(page);
      await d.getByLabel("Client’s Name").fill("Slow Client");
      await d.getByRole("button", { name: "Save as Draft" }).click();
      const busy = d.locator('button[aria-busy="true"]');
      await busy.waitFor({ timeout: 100 });
      assert.equal(await busy.innerText(), "Saving…");
      await d.getByText(/^Still saving\./).waitFor({ timeout: 4000 });
      await d.waitFor({ state: "detached", timeout: 8000 });
    },
    {
      setup: () => {
        if (!navigator.locks) return;
        const original = navigator.locks.request.bind(navigator.locks);
        navigator.locks.request = (name, work) =>
          original(name, () => new Promise((r) => setTimeout(r, 4500)).then(work));
      },
    },
  ));

test("Delete asks for confirmation; Cancel keeps it; Delete removes it", () =>
  fixture(async (page) => {
    await rows(page).filter({ hasText: "XM9141" }).click();
    const del = page.locator(".wide-actions").getByRole("button", { name: "Delete" });
    await del.click();
    const dialog = page.getByRole("dialog", { name: "Confirm Deletion" });
    await dialog.waitFor();
    assert.ok(
      await dialog
        .getByText("Are you sure you want to delete invoice #XM9141? This action cannot be undone.")
        .isVisible(),
    );
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Cancel");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "Delete");
    await del.click();
    await dialog.getByRole("button", { name: "Delete" }).click();
    await page.waitForURL(new URL("/", target).href);
    await page.getByText("There are 6 total invoices").waitFor();
    assert.equal(await rows(page).filter({ hasText: "XM9141" }).count(), 0);
    const flash = page.locator('p.flash[role="status"]');
    assert.equal(await flash.innerText(), "Invoice #XM9141 was deleted.");
    assert.ok(await flash.isVisible());
    assert.equal(
      await page.evaluate(() => document.activeElement?.textContent),
      "Invoice #XM9141 was deleted.",
    );
    // The next change clears the stale confirmation.
    await page.getByRole("button", { name: /Filter by status/ }).click();
    await page.getByRole("checkbox", { name: "Paid" }).check();
    await page.waitForFunction(() => document.querySelector("p.flash")?.textContent === "");
  }));

test("theme toggles, persists after reload and never flashes light", () =>
  fixture(async (page, context) => {
    await context.addInitScript(() => {
      // Record every theme the document takes from first paint to hydration.
      // Init scripts run before <html> exists, so observe the document itself.
      window.__themes = [];
      if (location.protocol !== "http:") return;
      new MutationObserver((records) => {
        for (const record of records)
          if (record.target === document.documentElement)
            window.__themes.push(document.documentElement.dataset.theme ?? "none");
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ["data-theme"] });
    });
    await page.getByRole("button", { name: "Use dark theme" }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(bg, "rgb(20, 22, 37)");
    await page.reload({ waitUntil: "commit" });
    await page.waitForSelector("body");
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
    await ready(page);
    assert.ok(await page.getByRole("button", { name: "Use light theme" }).isVisible());
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
    const themes = await page.evaluate(() => window.__themes);
    // The observer saw the inline script set dark, and nothing else since.
    assert.ok(themes.includes("dark"), JSON.stringify(themes));
    assert.deepEqual(themes.filter((t) => t !== "dark"), []);
  }));

test("keyboard: New Invoice opens the drawer, Escape closes it and focus returns", () =>
  fixture(async (page) => {
    const button = page.getByRole("button", { name: /New( Invoice)?/ });
    await button.focus();
    await page.keyboard.press("Enter");
    await drawer(page).waitFor();
    assert.ok(await page.evaluate(() => document.querySelector("dialog.drawer")?.contains(document.activeElement)));
    // Tab stays inside the drawer.
    for (let i = 0; i < 40; i++) await page.keyboard.press("Tab");
    assert.ok(await page.evaluate(() => document.querySelector("dialog.drawer")?.contains(document.activeElement)));
    await page.keyboard.press("Escape");
    await drawer(page).waitFor({ state: "detached" });
    assert.match(await page.evaluate(() => document.activeElement?.textContent ?? ""), /New/);
  }));

for (const width of [320, 390, 400]) {
  test(`detail line totals stay visible with no hidden scroll area at ${width}px`, () =>
    fixture(
      async (page) => {
        await page.getByRole("heading", { name: "#XM9141" }).waitFor();
        const totals = page.locator(".items-list .line-total");
        assert.equal(await totals.count(), 2);
        for (const box of await totals.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().right)))
          assert.ok(box <= width - 24, `total right edge ${box}`);
        const overflow = await page.evaluate(() => ({
          page: document.documentElement.scrollWidth - innerWidth,
          scrollers: [...document.querySelectorAll("main *")].filter((el) => {
            const s = getComputedStyle(el);
            return /(auto|scroll)/.test(s.overflowX) && el.scrollWidth > el.clientWidth;
          }).length,
        }));
        assert.deepEqual(overflow, { page: 0, scrollers: 0 });
      },
      { width, path: "/invoices/XM9141" },
    ));
}

test("Payment Terms caret sits 16 px inside the edge with room reserved", () =>
  fixture(async (page) => {
    await openNew(page);
    const style = await drawer(page)
      .getByLabel("Payment Terms")
      .evaluate((el) => {
        const s = getComputedStyle(el);
        return { position: s.backgroundPositionX, padding: parseFloat(s.paddingRight) };
      });
    assert.match(style.position, /16px/);
    assert.ok(style.padding >= 40, String(style.padding));
  }));

test("no native disabled controls, and no text under 16 px, on list, detail and drawer", () =>
  fixture(async (page) => {
    const check = async (where) => {
      const result = await page.evaluate(() => {
        const disabled = document.querySelectorAll("button:disabled, input:disabled, select:disabled").length;
        const small = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const el = node.parentElement;
          if (!node.textContent.trim() || !el || !el.getClientRects().length) continue;
          if (el.closest(".sr-only, noscript, script, style")) continue;
          const size = parseFloat(getComputedStyle(el).fontSize);
          if (size < 16) small.push(node.textContent.trim() + " " + size);
        }
        return { disabled, small };
      });
      assert.deepEqual(result, { disabled: 0, small: [] }, where);
    };
    await check("list");
    await openNew(page);
    await drawer(page).getByRole("button", { name: "Save & Send" }).click();
    await check("drawer with errors");
    await page.keyboard.press("Escape");
    await rows(page).first().click();
    await page.getByText("Amount Due").waitFor();
    await check("detail");
  }));

test("detail pages declare the site name and WebSite JSON-LD too", () =>
  fixture(
    async (page) => {
      assert.equal(
        await page.locator('meta[property="og:site_name"]').getAttribute("content"),
        "Invoice demo",
      );
      const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').innerText());
      assert.equal(ld["@type"], "WebSite");
    },
    { path: "/invoices/XM9141" },
  ));

for (const [path, selector] of [
  ["/", ".row-due, .row-client, .row-amount"],
  ["/invoices/FV2353", ".meta-value, .li-qty, .line-total"],
]) {
  test(`no squeezed or split text at 320px on ${path}`, () =>
    fixture(
      async (page) => {
        await page.locator(selector).first().waitFor();
        const multi = await page.locator(selector).evaluateAll((els) =>
          els
            .filter((el) => {
              const lh = parseFloat(getComputedStyle(el).lineHeight) || 22;
              return el.getBoundingClientRect().height > lh * 1.5 && el.textContent.includes(" ") && el.textContent.length < 20;
            })
            .map((el) => el.textContent),
        );
        assert.deepEqual(multi, []);
      },
      { width: 320, path },
    ));
}

for (const width of [320, 419]) {
  test(`drawer item rows fit at ${width}px with the total on its own line`, () =>
    fixture(
      async (page) => {
        await openNew(page);
        await addItem(page, 1, "Brand Guidelines", "9999", "999999.99");
        const result = await drawer(page).evaluate((d) => {
          const body = d.querySelector(".drawer-body");
          const row = d.querySelector(".item-row");
          const total = d.querySelector(".item-total-value");
          const lh = parseFloat(getComputedStyle(total).lineHeight) || 22;
          return {
            spill: body.scrollWidth - body.clientWidth,
            rowRight: row.getBoundingClientRect().right <= body.getBoundingClientRect().right,
            totalOneLine: total.getBoundingClientRect().height < lh * 1.5,
          };
        });
        assert.deepEqual(result, { spill: 0, rowRight: true, totalOneLine: true });
      },
      { width },
    ));
}

for (const width of [320, 375, 767]) {
  test(`phone detail at ${width}px: action bar spans the page, Go back stays link-sized`, () =>
    fixture(
      async (page) => {
        const bar = page.locator(".narrow-actions");
        await bar.waitFor();
        const box = await bar.boundingBox();
        assert.equal(Math.round(box.x), 0);
        assert.equal(Math.round(box.width), width);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
        const back = await page.locator("a.go-back").boundingBox();
        assert.equal(Math.round(back.x), 24);
        assert.ok(back.width < 150, `Go back is ${back.width}px wide`);
      },
      { width, path: "/invoices/XM9141" },
    ));
}

test("a theme change keeps the latest confirmation", () =>
  fixture(
    async (page) => {
      await page.locator(".wide-actions").getByRole("button", { name: "Mark as Paid" }).click();
      const flash = page.locator('p.flash[role="status"]');
      await page.waitForFunction(() => document.querySelector("p.flash")?.textContent !== "");
      assert.equal(await flash.innerText(), "Invoice #XM9141 is now paid.");
      await page.getByRole("button", { name: "Use dark theme" }).click();
      await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
      assert.equal(await flash.innerText(), "Invoice #XM9141 is now paid.");
    },
    { path: "/invoices/XM9141" },
  ));

for (const width of [400, 767]) {
  test(`after Save Changes at ${width}px the confirmation is focused and below the top bar`, () =>
    fixture(
      async (page) => {
        await page.locator(".narrow-actions").getByRole("button", { name: "Edit" }).click();
        await drawer(page).getByLabel("Client’s Name").fill("Sample Client E");
        await drawer(page).getByRole("button", { name: "Save Changes" }).click();
        await drawer(page).waitFor({ state: "detached" });
        const flash = page.locator('p.flash[role="status"]');
        await page.waitForFunction(() => document.activeElement?.classList.contains("flash"));
        assert.match(await flash.innerText(), /^Changes saved\./);
        const box = await page.evaluate(() => {
          const f = document.querySelector("p.flash").getBoundingClientRect();
          const bar = document.querySelector("header.sidebar").getBoundingClientRect();
          return { left: f.left, top: f.top, bottom: f.bottom, barBottom: bar.bottom, vh: innerHeight };
        });
        assert.equal(Math.round(box.left), 24, JSON.stringify(box));
        assert.ok(box.top >= box.barBottom, JSON.stringify(box));
        assert.ok(box.bottom <= box.vh, JSON.stringify(box));
      },
      { width, height: 700, path: "/invoices/XM9141" },
    ));
}

test("button labels keep normal word spacing: New Invoice, Filter by status", () =>
  fixture(async (page) => {
    const gaps = await page.evaluate(() =>
      [".new-invoice .wide-only", ".filter-button .wide-only"].map((sel) => {
        const tail = document.querySelector(sel);
        const head = tail.previousSibling;
        const range = document.createRange();
        range.selectNodeContents(head);
        const headRight = range.getBoundingClientRect().right;
        range.selectNodeContents(tail);
        return Math.round(range.getBoundingClientRect().left - headRight);
      }),
    );
    // A space is about 4 px; the 12-16 px flex gap must not land between words.
    assert.ok(gaps.every((gap) => gap <= 2), JSON.stringify(gaps));
  }));

for (const width of [768, 1440]) {
  test(`inputs in an address row stay aligned when errors wrap (${width}px)`, () =>
    fixture(
      async (page) => {
        await openNew(page);
        await drawer(page).getByRole("button", { name: "Save & Send" }).click();
        const rows = await drawer(page).evaluate((d) =>
          [...d.querySelectorAll(".address-grid")].map((grid) => {
            const fields = [...grid.querySelectorAll(":scope > .field:not(.addr-street)")];
            return {
              tops: fields.map((f) => Math.round(f.querySelector("input").getBoundingClientRect().top)),
              labelHeights: fields.map((f) => Math.round(f.querySelector(".field-top").getBoundingClientRect().height)),
            };
          }),
        );
        // The check only means something if one error wrapped under its label.
        assert.ok(rows.some((r) => new Set(r.labelHeights).size > 1), JSON.stringify(rows));
        for (const r of rows) assert.equal(new Set(r.tops).size, 1, JSON.stringify(rows));
      },
      { width },
    ));
}

// WCAG 1.4.3: every visible text run reaches 4.5:1 (3:1 when large) against
// the background it is painted on, composited through translucent tints.
function lowContrastText() {
  const parse = (value) => {
    const n = (value.match(/[\d.]+/g) || []).map(Number);
    if (value.startsWith("color(")) return [n[0] * 255, n[1] * 255, n[2] * 255, n[3] ?? 1];
    return [n[0], n[1], n[2], n[3] ?? 1];
  };
  const over = (top, under) => {
    const a = top[3];
    return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1);
  };
  const lum = (c) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const backdrop = (el) => {
    const layers = [];
    for (let node = el; node; node = node.parentElement) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg[3] > 0) layers.push(bg);
      if (bg[3] === 1) break;
    }
    let colour = [255, 255, 255, 1];
    for (const layer of layers.reverse()) colour = over(layer, colour);
    return colour;
  };
  const scope = document.querySelector("dialog[open]") ?? document.body;
  const bad = [];
  for (const el of scope.querySelectorAll("*")) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own || !el.getClientRects().length || el.closest(".sr-only, [aria-hidden=true]")) continue;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || Number(style.opacity) === 0) continue;
    const size = parseFloat(style.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
    const value = ratio(over(parse(style.color), backdrop(el)), backdrop(el));
    if (value < (large ? 3 : 4.5)) bad.push(el.textContent.trim().slice(0, 30) + " " + value.toFixed(2));
  }
  return bad;
}

for (const theme of ["light", "dark"]) {
  for (const [name, path, open] of [
    ["list", "/", null],
    ["detail", "/invoices/XM9141", null],
    ["new invoice errors", "/", "errors"],
  ]) {
    test(`text contrast passes WCAG AA: ${name}, ${theme}`, () =>
      fixture(
        async (page) => {
          if (theme === "dark") {
            await page.getByRole("button", { name: "Use dark theme" }).click();
            await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
          }
          if (open === "errors") {
            await openNew(page);
            await drawer(page).getByRole("button", { name: "Save & Send" }).click();
            await drawer(page).locator(".field-error").first().waitFor();
          }
          await page.waitForTimeout(300);
          assert.deepEqual(await page.evaluate(lowContrastText), []);
        },
        { path },
      ));
  }
}
