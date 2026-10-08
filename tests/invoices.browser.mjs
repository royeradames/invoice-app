import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { mkdir } from "node:fs/promises";
import { STORAGE_KEY } from "../lib/storage.ts";

const target = new URL(process.env.INVOICE_URL ?? "http://127.0.0.1:4395");
assert.ok(
  ["localhost", "127.0.0.1"].includes(target.hostname),
  "Local-only synthetic helper; hosted access requires an independent scoped transport.",
);
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
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
async function fixture(run, setup, options = {}) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
    ...options,
  });
  const errors = [];
  const network = [];
  context.on("page", (page) =>
    page.on("pageerror", (error) => errors.push(error.message)),
  );
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (
      new URL(request.url()).origin !== target.origin ||
      !["GET", "HEAD"].includes(request.method())
    ) {
      network.push(request.method() + " " + new URL(request.url()).pathname);
      await route.abort();
      return;
    }
    await route.continue();
  });
  try {
    if (setup) await context.addInitScript(setup);
    const page = await context.newPage();
    await page.goto(target.href);
    if (options.javaScriptEnabled !== false)
      await page.waitForFunction(() => {
        const select = document.querySelector("select");
        return select && !select.disabled;
      });
    await run(page, context);
    assert.deepEqual(errors, []);
    assert.deepEqual(network, []);
  } finally {
    await context.close();
  }
}
async function state(page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    STORAGE_KEY,
  );
}
async function save(page, name) {
  const before = await page.evaluate(
    (key) => localStorage.getItem(key),
    STORAGE_KEY,
  );
  await page.getByRole("button", { name, exact: true }).click();
  await page.waitForFunction(
    ({ key, before }) => localStorage.getItem(key) !== before,
    { key: STORAGE_KEY, before },
  );
}
async function create(page) {
  await page.getByRole("link", { name: "New invoice", exact: true }).click();
  await page
    .getByRole("heading", { name: "New invoice", exact: true })
    .waitFor();
  await page.getByLabel("Client name", { exact: true }).waitFor();
}
async function fillComplete(page) {
  for (const [name, value] of [
    ["Sender address", "Synthetic sender"],
    ["Client name", "Synthetic test client"],
    ["Client email", "client@example.com"],
    ["Client address", "Synthetic address"],
    ["Description", "Exact money test"],
    ["Issue date", "2024-02-28"],
  ])
    await page.getByLabel(name, { exact: true }).fill(value);
  await page
    .getByRole("combobox", { name: "Payment terms", exact: true })
    .selectOption("1");
  for (const [index, price] of [
    [1, "0.10"],
    [2, "0.20"],
  ]) {
    await page.getByRole("button", { name: "Add item", exact: true }).click();
    const region = page.getByRole("region", {
      name: "Item " + index,
      exact: true,
    });
    await region
      .getByLabel("Item name", { exact: true })
      .fill("Synthetic item " + index);
    await region.getByLabel("Quantity", { exact: true }).fill("1");
    await region.getByLabel("Unit price (GBP)", { exact: true }).fill(price);
  }
}

test("incomplete draft saves/reloads without fabricating required details", async () =>
  fixture(async (page) => {
    await create(page);
    await page
      .getByLabel("Client name", { exact: true })
      .fill("Partial synthetic client");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await page.waitForURL(/\/invoices\/[a-f0-9-]+\/edit$/);
    await page.getByLabel("Client name", { exact: true }).waitFor();
    assert.equal(
      await page.getByLabel("Client name", { exact: true }).inputValue(),
      "Partial synthetic client",
    );
    assert.equal(
      await page.getByLabel("Client email", { exact: true }).inputValue(),
      "",
    );
    const saved = await state(page);
    const item = saved.invoices.find(
      (x) => x.draft?.clientName === "Partial synthetic client",
    );
    assert.equal(item.status, "draft");
    assert.equal(saved.invoices.length, 4);
    await page.reload();
    await page.getByLabel("Client name", { exact: true }).waitFor();
    assert.equal(
      await page.getByLabel("Client name", { exact: true }).inputValue(),
      "Partial synthetic client",
    );
  }));

test("pending creation, same-mounted repeated Save and reload retain exact form and totals", async () =>
  fixture(async (page) => {
    await create(page);
    await fillComplete(page);
    await page
      .getByRole("button", { name: "Save as pending", exact: true })
      .click();
    await page.waitForURL(/\/invoices\/[a-f0-9-]+\/edit$/);
    await page.getByLabel("Client name", { exact: true }).waitFor();
    const client = page.getByLabel("Client name", { exact: true });
    await client.fill("Renamed synthetic client");
    await save(page, "Save changes");
    assert.equal(await client.inputValue(), "Renamed synthetic client");
    assert.equal(await page.locator(".total strong").innerText(), "£0.30");
    const first = await state(page);
    await save(page, "Save changes");
    const second = await state(page);
    assert.notEqual(first.revision, second.revision);
    const edited = second.invoices.find(
      (x) => x.details?.clientName === "Renamed synthetic client",
    );
    assert.equal(edited.details.items[0].unitMinor, 10);
    assert.equal(edited.details.items[1].unitMinor, 20);
    await page.reload();
    await client.waitFor();
    assert.equal(await client.inputValue(), "Renamed synthetic client");
    await page.getByRole("link", { name: "Back without saving" }).click();
    // Payment due uses the design date format; 2024 is a leap year.
    await page.getByRole("heading", { name: "Payment due", exact: true }).waitFor();
    await page.getByText("29 Feb 2024", { exact: true }).waitFor();
  }));

test("pending to paid changes only the selected record and removes edit/mark controls", async () =>
  fixture(async (page) => {
    await page.getByRole("link", { name: /INV-BBBBBBBB/ }).click();
    await save(page, "Mark paid");
    await page.getByText("paid", { exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Mark paid", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await page
        .getByRole("link", { name: "Edit invoice", exact: true })
        .count(),
      0,
    );
    const saved = await state(page);
    assert.equal(
      saved.invoices.find((x) => x.id.startsWith("bbbb")).status,
      "paid",
    );
    assert.equal(
      saved.invoices.find((x) => x.id.startsWith("aaaa")).status,
      "draft",
    );
  }));

test("named deletion traps focus, Escape cancels, confirmation deletes just one ID", async () =>
  fixture(async (page) => {
    await page.getByRole("link", { name: /INV-AAAAAAAA/ }).click();
    const remove = page.getByRole("button", {
      name: "Delete invoice",
      exact: true,
    });
    await remove.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", {
      name: "Delete INV-AAAAAAAA?",
      exact: true,
    });
    await dialog.waitFor();
    for (let index = 0; index < 6; index++) {
      await page.keyboard.press("Tab");
      assert.equal(
        await page.evaluate(() =>
          Boolean(document.activeElement?.closest("dialog")),
        ),
        true,
      );
    }
    await page.keyboard.press("Escape");
    assert.equal(
      await remove.evaluate((node) => node === document.activeElement),
      true,
    );
    await remove.click();
    await page
      .getByRole("button", { name: "Confirm deletion", exact: true })
      .click();
    await page.waitForURL(target.href);
    await page
      .getByRole("heading", { name: "Invoices", exact: true })
      .waitFor();
    const saved = await state(page);
    assert.equal(saved.invoices.length, 2);
    assert.equal(
      saved.invoices.some((x) => x.id.startsWith("aaaa")),
      false,
    );
  }));

test("app navigation preserves unsaved work through cancel, save and discard choices", async () =>
  fixture(async (page) => {
    await page.getByRole("link", { name: /INV-AAAAAAAA/ }).click();
    await page.getByRole("link", { name: "Edit invoice", exact: true }).click();
    const name = page.getByLabel("Client name", { exact: true });
    await name.fill("Keep this draft");
    const back = page.getByRole("link", { name: "Back without saving" });
    await back.focus();
    await page.keyboard.press("Enter");
    await page
      .getByRole("dialog", { name: "Keep your unsaved changes?" })
      .waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await name.inputValue(), "Keep this draft");
    assert.equal(
      await back.evaluate((node) => node === document.activeElement),
      true,
    );
    await back.click();
    await page
      .getByRole("button", { name: "Save and continue", exact: true })
      .click();
    await page.waitForURL(/\/invoices\/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa$/);
    await page.getByText("Keep this draft", { exact: true }).waitFor();
    await page.getByRole("link", { name: "Edit invoice", exact: true }).click();
    await name.fill("Discard this change");
    await back.click();
    await page
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
    await page.waitForURL(/\/invoices\/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa$/);
    assert.equal(
      (await state(page)).invoices[0].draft.clientName,
      "Keep this draft",
    );
  }));

test("stable item errors do not move onto another row after removal", async () =>
  fixture(async (page) => {
    await create(page);
    await fillComplete(page);
    const first = page.getByRole("region", { name: "Item 1", exact: true });
    await first.getByLabel("Unit price (GBP)", { exact: true }).fill("1.001");
    await page
      .getByRole("button", { name: "Save as pending", exact: true })
      .click();
    assert.equal(await first.locator('[aria-invalid="true"]').count(), 1);
    const secondValue = await page
      .getByRole("region", { name: "Item 2", exact: true })
      .getByLabel("Unit price (GBP)", { exact: true })
      .inputValue();
    await page
      .getByRole("button", { name: "Remove item 1", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("region", { name: "Item 1", exact: true })
        .locator('[aria-invalid="true"]')
        .count(),
      0,
    );
    assert.equal(
      await page
        .getByRole("region", { name: "Item 1", exact: true })
        .getByLabel("Unit price (GBP)", { exact: true })
        .inputValue(),
      secondValue,
    );
  }));

test("quota failure in Save-and-continue exposes modal error and preserves draft", async () =>
  fixture(
    async (page) => {
      await create(page);
      await page
        .getByLabel("Client name", { exact: true })
        .fill("Quota-safe draft");
      await page.getByRole("link", { name: "Back without saving" }).click();
      const dialog = page.getByRole("dialog", {
        name: "Keep your unsaved changes?",
      });
      await dialog
        .getByRole("button", { name: "Save and continue", exact: true })
        .focus();
      await page.keyboard.press("Enter");
      const alert = dialog.getByRole("alert");
      await alert.waitFor();
      assert.match(await alert.innerText(), /Saving failed|storage/i);
      await page.waitForFunction(
        () =>
          document.activeElement ===
          document.querySelector("dialog [role=alert]"),
      );
      await page.keyboard.press("Escape");
      assert.equal(
        await page.getByLabel("Client name", { exact: true }).inputValue(),
        "Quota-safe draft",
      );
      assert.equal(
        await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
        null,
      );
    },
    () => {
      Storage.prototype.setItem = () => {
        throw new DOMException("Full", "QuotaExceededError");
      };
    },
  ));

test("malformed storage remains intact until named reset, including Escape cancellation", async () =>
  fixture(
    async (page) => {
      await page
        .getByRole("button", { name: "Reset unreadable data", exact: true })
        .click();
      await page.keyboard.press("Escape");
      assert.equal(
        await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
        "{broken",
      );
      await page
        .getByRole("button", { name: "Reset unreadable data", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Reset saved library", exact: true })
        .click();
      await page.waitForFunction(
        (key) => localStorage.getItem(key) !== "{broken",
        STORAGE_KEY,
      );
      assert.equal((await state(page)).invoices.length, 3);
    },
    () => {
      // Init scripts also run in the context's about:blank, where storage is denied.
      if (location.protocol === "http:")
        localStorage.setItem("invoice-synthetic-demo-v1", "{broken");
    },
  ));

test("two real tabs reject a stale invoice save after a theme write and keep the form", async () =>
  fixture(async (first, context) => {
    const second = await context.newPage();
    await second.goto(target.href);
    await second.getByRole("link", { name: /INV-AAAAAAAA/ }).click();
    await second
      .getByRole("link", { name: "Edit invoice", exact: true })
      .click();
    await second
      .getByLabel("Client name", { exact: true })
      .fill("Other tab draft");
    await first
      .getByRole("button", { name: "Use dark theme", exact: true })
      .click();
    await first.locator('[data-theme="dark"]').waitFor();
    await second
      .getByRole("button", { name: "Save draft", exact: true })
      .click();
    await second.getByText(/Another tab changed this library/).waitFor();
    assert.equal(
      await second.getByLabel("Client name", { exact: true }).inputValue(),
      "Other tab draft",
    );
    const saved = await state(first);
    assert.equal(saved.theme, "dark");
    assert.equal(saved.invoices[0].draft.clientName, "Sample Client A");
    await second.close();
  }));

test("both themes, filters, search, responsive fields and direct missing routes", async () =>
  fixture(async (page) => {
    await mkdir(".test-state", { recursive: true });
    for (const width of [400, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ["light", "dark"]) {
        if ((await page.locator(".app").getAttribute("data-theme")) !== theme)
          await page
            .getByRole("button", {
              name: "Use " + theme + " theme",
              exact: true,
            })
            .click();
        await page.locator('[data-theme="' + theme + '"]').waitFor();
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
        await page.screenshot({
          path: ".test-state/invoice-list-" + width + "-" + theme + ".png",
          fullPage: true,
        });
      }
    }
    await page
      .getByRole("combobox", { name: "Status", exact: true })
      .selectOption("pending");
    await page.waitForFunction(
      () => document.querySelectorAll(".invoice-card").length === 1,
    );
    await page.getByLabel("Search invoices", { exact: true }).fill("no match");
    await page.getByRole("heading", { name: "No matching invoices" }).waitFor();
    await page.getByLabel("Search invoices", { exact: true }).press("Escape");
    assert.equal(await page.locator(".invoice-card").count(), 1);
    await page.reload();
    await page.locator('[data-theme="dark"]').waitFor();
    assert.equal(
      await page
        .getByRole("combobox", { name: "Status", exact: true })
        .inputValue(),
      "pending",
    );
    await page.goto(target.origin + "/invoices/not-a-uuid");
    await page
      .getByRole("heading", { name: "Invoice route not found" })
      .waitFor();
    await page.goto(
      target.origin + "/invoices/dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    );
    await page
      .getByRole("heading", { name: "Invoice not found in this browser" })
      .waitFor();
  }));

test("no JavaScript honestly reports local editing requirement with no form submission", async () =>
  fixture(
    async (page) => {
      assert.match(
        await page.locator("noscript").innerText(),
        /JavaScript is needed/,
      );
      assert.equal(await page.locator("form").count(), 0);
    },
    undefined,
    { javaScriptEnabled: false },
  ));

test("pending Save-and-continue announces validation inside its modal", async () =>
  fixture(async (page) => {
    await page.getByRole("link", { name: /INV-BBBBBBBB/ }).click();
    await page.getByRole("link", { name: "Edit invoice", exact: true }).click();
    await page.getByLabel("Client name", { exact: true }).fill("");
    await page.getByRole("link", { name: "Back without saving" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Keep your unsaved changes?",
    });
    await dialog
      .getByRole("button", { name: "Save and continue", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await dialog.getByRole("alert").waitFor();
    await page.waitForFunction(
      () =>
        document.activeElement ===
        document.querySelector("dialog [role=alert]"),
    );
    for (let step = 0; step < 6; step++) {
      await page.keyboard.press("Tab");
      assert.equal(
        await page.evaluate(() =>
          Boolean(document.activeElement?.closest("dialog")),
        ),
        true,
      );
    }
    await page.keyboard.press("Escape");
    assert.equal(
      await page.getByLabel("Client name", { exact: true }).inputValue(),
      "",
    );
    assert.equal(
      await page
        .getByLabel("Client name", { exact: true })
        .getAttribute("aria-invalid"),
      "true",
    );
    assert.equal(
      await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY),
      null,
    );
  }));
test("denied storage retains the working draft and its explicit download", async () =>
  fixture(
    async (page) => {
      await create(page);
      await page
        .getByLabel("Client name", { exact: true })
        .fill("Offline synthetic draft");
      await page
        .getByRole("button", { name: "Save draft", exact: true })
        .click();
      await page.getByText(/denied storage/i).waitFor();
      assert.equal(
        await page.getByLabel("Client name", { exact: true }).inputValue(),
        "Offline synthetic draft",
      );
      const download = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Download current draft", exact: true })
        .click();
      const result = await download;
      const stream = await result.createReadStream();
      assert.ok(stream);
      let json = "";
      for await (const chunk of stream) json += chunk;
      assert.equal(JSON.parse(json).clientName, "Offline synthetic draft");
    },
    () => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("Denied storage", "SecurityError");
        },
      });
    },
  ));
test("long content fits editor/detail at responsive boundaries in both themes", async () =>
  fixture(async (page) => {
    await mkdir(".test-state", { recursive: true });
    await create(page);
    await fillComplete(page);
    await page.getByLabel("Client name", { exact: true }).fill("W".repeat(100));
    await page.getByLabel("Description", { exact: true }).fill("W".repeat(200));
    await page
      .getByRole("button", { name: "Save as pending", exact: true })
      .click();
    await page.waitForURL(/\/invoices\/[a-f0-9-]+\/edit$/);
    await page.getByLabel("Client name", { exact: true }).waitFor();
    const editUrl = page.url();
    const detailUrl = editUrl.replace(/\/edit$/, "");
    for (const theme of ["light", "dark"]) {
      await page.goto(target.href);
      await page.getByRole("button", { name: /Use .* theme/ }).waitFor();
      if ((await page.locator(".app").getAttribute("data-theme")) !== theme)
        await page
          .getByRole("button", { name: "Use " + theme + " theme", exact: true })
          .click();
      await page.locator('[data-theme="' + theme + '"]').waitFor();
      for (const width of [400, 600, 601, 768, 900, 901, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const [kind, url] of [
          ["editor", editUrl],
          ["detail", detailUrl],
        ]) {
          await page.goto(url);
          await page.locator(".paper").waitFor();
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            true,
            kind + " fits " + width,
          );
          const small = await page
            .locator("main :is(a,button,input,select,label,p,th,td)")
            .evaluateAll((nodes) =>
              nodes
                .filter(
                  (node) =>
                    node.getClientRects().length &&
                    parseFloat(getComputedStyle(node).fontSize) < 16,
                )
                .map((node) => node.tagName),
            );
          assert.deepEqual(small, []);
          const controls = await page
            .locator("main :is(button,input,select)")
            .evaluateAll((nodes) =>
              nodes
                .filter((node) => node.getClientRects().length)
                .map((node) => {
                  const r = node.getBoundingClientRect();
                  return { x: r.x, right: r.right, height: r.height };
                }),
            );
          assert.ok(
            controls.every(
              (r) => r.height >= 44 && r.x >= 0 && r.right <= width,
            ),
            kind + " controls fit",
          );
          if ([400, 1440].includes(width))
            await page.screenshot({
              path:
                ".test-state/invoice-" +
                kind +
                "-" +
                width +
                "-" +
                theme +
                ".png",
              fullPage: true,
            });
        }
      }
    }
  }));
test("native browser Back can cancel navigation and retain the unsaved draft", async () =>
  fixture(async (page) => {
    await create(page);
    await page
      .getByLabel("Client name", { exact: true })
      .fill("Keep on browser Back");
    const current = page.url();
    const event = page.waitForEvent("dialog");
    // A dismissed beforeunload cancels the history navigation; Chrome may abort
    // goBack or leave it waiting for a load that never comes.
    const navigation = page.goBack({ timeout: 5000 }).catch((error) => {
      assert.match(error.message, /ERR_ABORTED|Timeout 5000ms exceeded/);
      return null;
    });
    const dialog = await event;
    assert.equal(dialog.type(), "beforeunload");
    await dialog.dismiss();
    await navigation;
    assert.equal(page.url(), current);
    assert.equal(
      await page.getByLabel("Client name", { exact: true }).inputValue(),
      "Keep on browser Back",
    );
  }));
