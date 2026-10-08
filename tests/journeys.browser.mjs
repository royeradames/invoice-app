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
  await d.getByLabel("Item Name for item " + n).fill(name);
  await d.getByLabel("Qty. for item " + n).fill(qty);
  await d.getByLabel("Price for item " + n).fill(price);
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
    await d.getByLabel("Item Name for item 1").focus(); // blur the last price
    assert.equal((await totals.allInnerTexts()).join("|"), "156.00|400.00|3.00");
    assert.equal(await totals.count(), 3);
    assert.equal(await d.getByLabel("Price for item 1").inputValue(), "156.00");
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
  }));

test("theme toggles, persists after reload and applies before first paint", () =>
  fixture(async (page) => {
    await page.getByRole("button", { name: "Use dark theme" }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(bg, "rgb(20, 22, 37)");
    await page.reload({ waitUntil: "commit" });
    await page.waitForSelector("body");
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
    await ready(page);
    assert.ok(await page.getByRole("button", { name: "Use light theme" }).isVisible());
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
