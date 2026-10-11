import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  createInvoice,
  displayDate,
  emptyForm,
  formTotal,
  invoiceSchema,
  invoiceTotal,
  librarySchema,
  markPaid,
  MAX_BYTES,
  money,
  newInvoiceId,
  parsePrice,
  parseQuantity,
  paymentDue,
  removeInvoice,
  termsLabel,
  toForm,
  updateInvoice,
  validateForm,
  visibleInvoices,
  type FormValues,
  type Library,
} from "../lib/invoices.ts";
import { seedLibrary } from "../lib/fixtures.ts";
import {
  readLibrary,
  STORAGE_KEY,
  writeLibrary,
  type Exclusive,
  type Port,
} from "../lib/storage.ts";

const revA = "11111111-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const revB = "22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const itemA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const itemB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
function complete(): FormValues {
  const address = { street: "84 Church Way", city: "Bradford", postCode: "BD1 9PB", country: "United Kingdom" };
  return {
    senderAddress: { street: "19 Union Terrace", city: "London", postCode: "E1 3EZ", country: "United Kingdom" },
    clientName: "Alex Grim",
    clientEmail: "alexgrim@mail.com",
    clientAddress: address,
    createdAt: "2021-08-21",
    paymentTerms: "30",
    description: "Graphic Design",
    items: [
      { id: itemA, name: "Banner Design", quantity: "1", price: "156.00" },
      { id: itemB, name: "Email Design", quantity: "2", price: "200" },
    ],
  };
}
function memory(initial: string | null = null): Port {
  let raw = initial;
  return {
    getItem: () => raw,
    setItem: (_key, value) => {
      raw = value;
    },
  };
}
function exclusive(): Exclusive {
  let tail: Promise<unknown> = Promise.resolve();
  return (work) => {
    const next = tail.then(work);
    tail = next.catch(() => undefined);
    return next;
  };
}
function fields(values: FormValues, intent: "draft" | "send" = "send") {
  const result = validateForm(values, intent);
  assert.ok(result.ok, JSON.stringify(!result.ok && result.errors));
  return result.fields;
}

test("seed is the brief's data.json: 7 invoices, its totals and its due dates", () => {
  const expected = [
    ["RT3080", "paid", "2021-08-19", 180090],
    ["XM9141", "pending", "2021-09-20", 55600],
    ["RG0314", "paid", "2021-10-01", 1400233],
    ["RT2080", "pending", "2021-10-12", 10204],
    ["AA1449", "pending", "2021-10-14", 403233],
    ["TY9141", "pending", "2021-10-31", 615591],
    ["FV2353", "draft", "2021-11-12", 310204],
  ] as const;
  assert.deepEqual(
    seedLibrary.invoices.map((x) => [x.id, x.status, paymentDue(x), invoiceTotal(x)]),
    expected,
  );
  assert.equal(money(invoiceTotal(seedLibrary.invoices[2])), "£ 14,002.33");
  assert.deepEqual(seedLibrary.filter, []);
});

test("new IDs are two uppercase letters and four digits, never reusing one", () => {
  for (let i = 0; i < 200; i++) assert.match(newInvoiceId(new Set()), /^[A-Z]{2}\d{4}$/);
  // A random source that first returns a taken ID, then a free one.
  const values = [0, 0, 0, 0, 0, 0, 0.99, 0, 0, 0, 0, 0];
  let i = 0;
  assert.equal(newInvoiceId(new Set(["AA0000"]), () => values[i++]), "ZA0000");
});

test("Save & Send requires every field and an item; errors name each field", () => {
  const blank = validateForm(emptyForm(""), "send");
  assert.equal(blank.ok, false);
  if (blank.ok) return;
  for (const path of [
    "senderAddress.street",
    "senderAddress.city",
    "senderAddress.postCode",
    "senderAddress.country",
    "clientName",
    "clientEmail",
    "clientAddress.street",
    "clientAddress.city",
    "clientAddress.postCode",
    "clientAddress.country",
    "createdAt",
    "description",
    "items",
  ])
    assert.ok(blank.errors[path], path);
  assert.equal(blank.errors.clientName, "can't be empty");
  assert.deepEqual(blank.summary, ["All fields must be added", "An item must be added"]);
  const values = complete();
  values.items.push({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "", quantity: "", price: "" });
  const partialItem = validateForm(values, "send");
  assert.equal(partialItem.ok, false);
  if (!partialItem.ok)
    assert.deepEqual(Object.keys(partialItem.errors).sort(), [
      "items.cccccccc-cccc-4ccc-8ccc-cccccccccccc.name",
      "items.cccccccc-cccc-4ccc-8ccc-cccccccccccc.price",
      "items.cccccccc-cccc-4ccc-8ccc-cccccccccccc.quantity",
    ]);
});

test("Save as Draft accepts blanks but still rejects what is typed wrong", () => {
  const blank = validateForm(emptyForm(""), "draft");
  assert.equal(blank.ok, true);
  const values = emptyForm("2021-08-21");
  values.clientEmail = "not-an-email";
  values.items = [{ id: itemA, name: "", quantity: "1.5", price: "12.345" }];
  const bad = validateForm(values, "draft");
  assert.equal(bad.ok, false);
  if (bad.ok) return;
  assert.deepEqual(Object.keys(bad.errors).sort(), [
    "clientEmail",
    `items.${itemA}.price`,
    `items.${itemA}.quantity`,
  ]);
  assert.equal(bad.errors.clientEmail, "invalid email");
  assert.equal(bad.summary.includes("All fields must be added"), false);
});

test("drafts save partially; Save Changes makes a draft pending; pending becomes paid once", () => {
  const draftValues = emptyForm("2021-08-21");
  draftValues.clientName = "Partial client";
  const created = createInvoice(seedLibrary, fields(draftValues, "draft"), "draft", "AB1234");
  const draft = created.library.invoices.find((x) => x.id === "AB1234");
  assert.equal(draft?.status, "draft");
  assert.equal(created.library.invoices.length, 8);
  assert.throws(() => markPaid(created.library, "AB1234"));
  // Storage refuses an incomplete pending record even if a caller skips validation.
  assert.throws(() => updateInvoice(created.library, "AB1234", fields(draftValues, "draft")));
  const pending = updateInvoice(created.library, "AB1234", fields(complete()));
  assert.equal(pending.invoices.find((x) => x.id === "AB1234")?.status, "pending");
  const paid = markPaid(pending, "AB1234");
  assert.equal(paid.invoices.find((x) => x.id === "AB1234")?.status, "paid");
  assert.equal(markPaid(paid, "AB1234"), paid);
  // Editing a paid invoice keeps it paid.
  assert.equal(
    updateInvoice(paid, "AB1234", fields(complete())).invoices.find((x) => x.id === "AB1234")?.status,
    "paid",
  );
  // The new invoice sits at the top; other records are untouched throughout.
  assert.equal(paid.invoices[0]?.id, "AB1234");
  assert.deepEqual(paid.invoices.slice(1), seedLibrary.invoices);
});

test("payment due is the invoice date plus the terms, across month, leap and year ends", () => {
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addDays("2023-02-28", 1), "2023-03-01");
  assert.equal(addDays("2021-12-25", 7), "2022-01-01");
  assert.equal(paymentDue({ createdAt: "2021-08-21", paymentTerms: 30 }), "2021-09-20");
  assert.equal(paymentDue({ createdAt: "", paymentTerms: 30 }), null);
  assert.equal(displayDate("2021-10-01"), "01 Oct 2021");
  assert.equal(termsLabel(1), "Net 1 Day");
  assert.equal(termsLabel(30), "Net 30 Days");
});

test("line items total exactly in pence, including after adding and removing items", () => {
  assert.equal(parsePrice("0.1"), 10);
  assert.equal(parsePrice("1,800.90"), 180090);
  assert.equal(parsePrice("12.345"), null);
  assert.equal(parsePrice("-1"), null);
  assert.equal(parseQuantity("0"), null);
  assert.equal(parseQuantity("10000"), null);
  const values = complete();
  assert.equal(formTotal(values), 55600);
  values.items.push({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "x", quantity: "3", price: "0.10" });
  assert.equal(formTotal(values), 55630);
  values.items = values.items.filter((x) => x.id !== itemB);
  assert.equal(formTotal(values), 15630);
  // A blank or invalid row counts as zero until it is fixed.
  values.items.push({ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", name: "", quantity: "", price: "" });
  assert.equal(formTotal(values), 15630);
});

test("form round trip keeps every field, item ID and price", () => {
  const created = createInvoice(seedLibrary, fields(complete()), "pending", "ZZ0001");
  const saved = created.library.invoices.find((x) => x.id === "ZZ0001")!;
  const back = toForm(saved);
  assert.deepEqual(back, { ...complete(), items: complete().items.map((x) => ({ ...x, price: x.id === itemB ? "200.00" : x.price })) });
});

test("delete removes only the chosen invoice; filters show any mix of statuses", () => {
  const next = removeInvoice(seedLibrary, "XM9141");
  assert.deepEqual(
    next.invoices.map((x) => x.id),
    seedLibrary.invoices.map((x) => x.id).filter((x) => x !== "XM9141"),
  );
  const filtered = (filter: Library["filter"]) =>
    visibleInvoices({ ...seedLibrary, filter }).map((x) => x.id);
  assert.deepEqual(filtered([]).length, 7);
  assert.deepEqual(filtered(["draft"]), ["FV2353"]);
  assert.deepEqual(filtered(["paid", "draft"]), ["RT3080", "RG0314", "FV2353"]);
});

test("stored schema rejects bad IDs, extra fields and incomplete pending records", () => {
  const good = seedLibrary.invoices[1];
  assert.equal(invoiceSchema.safeParse(good).success, true);
  assert.equal(invoiceSchema.safeParse({ ...good, id: "xm9141" }).success, false);
  assert.equal(invoiceSchema.safeParse({ ...good, extra: 1 }).success, false);
  assert.equal(invoiceSchema.safeParse({ ...good, clientName: "" }).success, false);
  assert.equal(invoiceSchema.safeParse({ ...good, status: "draft", clientName: "" }).success, true);
  assert.equal(
    librarySchema.safeParse({ ...seedLibrary, invoices: [good, good] }).success,
    false,
  );
});

test("parallel saves serialize and a stale write cannot overwrite newer data", async () => {
  const port = memory();
  const lock = exclusive();
  const [first, stale] = await Promise.all([
    writeLibrary(port, lock, null, removeInvoice(seedLibrary, "RT3080"), revA),
    writeLibrary(port, lock, null, { ...seedLibrary, theme: "dark" }, revB),
  ]);
  assert.equal(first.kind, "saved");
  assert.equal(stale.kind, "failed");
  const read = readLibrary(port, seedLibrary);
  assert.equal(read.kind, "loaded");
  if (read.kind === "loaded") {
    assert.equal(read.snapshot.library.invoices.length, 6);
    assert.equal(read.snapshot.library.theme, "light");
  }
});

test("corrupt, oversized, denied and lock-less storage keep the saved bytes", async () => {
  for (const raw of ["{broken", "x".repeat(MAX_BYTES + 1)]) {
    const port = memory(raw);
    assert.equal(readLibrary(port, seedLibrary).kind, "invalid");
    assert.equal(port.getItem(STORAGE_KEY), raw);
  }
  const before = JSON.stringify(seedLibrary);
  const quota: Port = {
    getItem: () => before,
    setItem: () => {
      throw new Error("quota");
    },
  };
  assert.equal((await writeLibrary(quota, exclusive(), before, seedLibrary, revA)).kind, "failed");
  assert.equal((await writeLibrary(memory(before), null, before, seedLibrary, revA)).kind, "failed");
  assert.equal(
    readLibrary(
      {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {},
      },
      seedLibrary,
    ).kind,
    "unavailable",
  );
});
