import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  displayDate,
  dueDate,
  draftSchema,
  draftTotal,
  emptyDraft,
  invoiceSchema,
  isCalendarDate,
  librarySchema,
  markPaid,
  MAX_BYTES,
  money,
  parseMinor,
  removeInvoice,
  saveInvoice,
  totalMinor,
  toDraft,
  validatePending,
  type Draft,
  termsLabel,
} from "../lib/invoices.ts";
import { seedLibrary } from "../lib/fixtures.ts";
import {
  readLibrary,
  STORAGE_KEY,
  writeLibrary,
  type Exclusive,
  type Port,
} from "../lib/storage.ts";
const id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const itemId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const revA = "11111111-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const revB = "22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
function complete(): Draft {
  return {
    senderAddress: "Synthetic sender",
    clientName: "Synthetic client",
    clientEmail: "client@example.com",
    clientAddress: "Synthetic address",
    description: "Exact-money exercise",
    issueDate: "2024-02-28",
    terms: "1",
    items: [{ id: itemId, name: "Example", quantity: "3", price: "0.10" }],
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
test("incomplete drafts persist but cannot become pending or paid", () => {
  const draft = saveInvoice(seedLibrary, id, emptyDraft(), "draft", 1);
  assert.equal(draft.invoices.find((x) => x.id === id)?.status, "draft");
  assert.throws(() => saveInvoice(draft, id, emptyDraft(), "pending", 2));
  assert.throws(() => markPaid(draft, id, "2026-10-07"));
  assert.equal(draft.invoices.length, 4);
});
test("draft to pending to paid is explicit; repeated paid is idempotent and edits/reversion fail", () => {
  const draft = saveInvoice(seedLibrary, id, complete(), "draft", 1);
  const pending = saveInvoice(draft, id, complete(), "pending", 2);
  assert.throws(() => saveInvoice(pending, id, complete(), "draft", 3));
  const paid = markPaid(pending, id, "2024-02-29");
  assert.equal(paid.invoices.find((x) => x.id === id)?.status, "paid");
  assert.equal(markPaid(paid, id, "2024-03-01"), paid);
  assert.throws(() => saveInvoice(paid, id, complete(), "pending", 3));
  assert.equal(seedLibrary.invoices.length, 3);
});
test("minor units have independently known exact fractional totals", () => {
  assert.equal(parseMinor("0.10"), 10);
  assert.equal(parseMinor("0.2"), 20);
  assert.equal(parseMinor("999999.99"), 99_999_999);
  for (const bad of [
    "-1",
    "1e3",
    "1.001",
    "1000000.00",
    "NaN",
    "",
    ".1",
    " 1",
    "1,00",
  ])
    assert.equal(parseMinor(bad), null);
  const input = complete();
  input.items.push({
    id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    name: "Second",
    quantity: "1",
    price: "0.20",
  });
  const valid = validatePending(input);
  assert.equal(valid.kind, "valid");
  if (valid.kind === "valid") assert.equal(totalMinor(valid.details), 50);
  assert.equal(money(30), "£0.30");
  assert.equal(money(123456), "£1,234.56");
  assert.equal(draftTotal(emptyDraft()), null);
});
test("item errors have stable identity and explicit quantity/price bounds", () => {
  const input = complete();
  input.items[0] = { id: itemId, name: "", quantity: "10000", price: "1.234" };
  const invalid = validatePending(input);
  assert.equal(invalid.kind, "invalid");
  if (invalid.kind === "invalid") {
    assert.ok(invalid.errors[itemId + ".name"]);
    assert.ok(invalid.errors[itemId + ".quantity"]);
    assert.ok(invalid.errors[itemId + ".price"]);
  }
  input.items[0] = {
    id: itemId,
    name: "Max",
    quantity: "9999",
    price: "999999.99",
  };
  const valid = validatePending(input);
  assert.equal(valid.kind, "valid");
  if (valid.kind === "valid")
    assert.equal(totalMinor(valid.details), 999_899_990_001);
});
test("calendar arithmetic preserves leap/year boundaries in UTC and AST", () => {
  assert.equal(isCalendarDate("2024-02-29"), true);
  for (const text of [
    "2023-02-29",
    "2024-04-31",
    "2024-00-01",
    "24-01-01",
    "1899-12-31",
    "9999-01-01",
  ])
    assert.equal(isCalendarDate(text), false);
  for (const tz of ["UTC", "America/Santo_Domingo"]) {
    const previous = process.env.TZ;
    try {
      process.env.TZ = tz;
      assert.equal(addDays("2024-02-28", 1), "2024-02-29");
      assert.equal(addDays("2024-12-31", 1), "2025-01-01");
      assert.equal(addDays("2024-02-29", 30), "2024-03-30");
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  }
});
test("deleting one identity never modifies another record or reuses its ID", () => {
  const original = structuredClone(seedLibrary);
  const removed = removeInvoice(
    seedLibrary,
    "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  );
  const next = saveInvoice(removed, id, complete(), "draft", 1);
  assert.equal(next.invoices.length, 3);
  assert.equal(new Set(next.invoices.map((x) => x.id)).size, 3);
  assert.deepEqual(next.invoices[0], original.invoices[0]);
  assert.deepEqual(seedLibrary, original);
});
test("saved schemas reject duplicate IDs, extra fields, oversized text and invalid states", () => {
  assert.equal(
    librarySchema.safeParse({
      ...seedLibrary,
      invoices: [...seedLibrary.invoices, seedLibrary.invoices[0]],
    }).success,
    false,
  );
  const draft = complete();
  const line = draft.items[0];
  assert.ok(line);
  draft.items.push(structuredClone(line));
  assert.equal(draftSchema.safeParse(draft).success, false);
  assert.equal(
    draftSchema.safeParse({ ...complete(), clientName: "x".repeat(101) })
      .success,
    false,
  );
  const first = seedLibrary.invoices[0];
  assert.ok(first);
  assert.equal(
    invoiceSchema.safeParse({ ...first, status: "paid" }).success,
    false,
  );
  assert.equal(
    librarySchema.safeParse({ ...seedLibrary, version: 2 }).success,
    false,
  );
  assert.equal(
    librarySchema.safeParse({ ...seedLibrary, extra: "fictional" }).success,
    false,
  );
});
test("saved form conversion retains every field, line ID and exact price", () => {
  const next = saveInvoice(seedLibrary, id, complete(), "pending", 1);
  const record = next.invoices.find((x) => x.id === id);
  assert.ok(record);
  assert.deepEqual(toDraft(record), complete());
});
test("parallel saves serialize and a stale preference/deletion cannot overwrite newer data", async () => {
  const port = memory();
  const lock = exclusive();
  const [first, stale] = await Promise.all([
    writeLibrary(
      port,
      lock,
      null,
      saveInvoice(seedLibrary, id, complete(), "draft", 1),
      revA,
    ),
    writeLibrary(
      port,
      lock,
      null,
      {
        ...removeInvoice(seedLibrary, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
        theme: "dark",
      },
      revB,
    ),
  ]);
  assert.equal(first.kind, "saved");
  assert.equal(stale.kind, "failed");
  const read = readLibrary(port, seedLibrary);
  assert.equal(read.kind, "loaded");
  if (read.kind === "loaded") {
    assert.equal(read.snapshot.library.invoices.length, 4);
    assert.equal(read.snapshot.library.theme, "light");
  }
});
test("corruption, over-limit bytes, denied/quota storage and absent locks preserve prior bytes", async () => {
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
  assert.equal(
    (await writeLibrary(quota, exclusive(), before, seedLibrary, revA)).kind,
    "failed",
  );
  assert.equal(quota.getItem(STORAGE_KEY), before);
  assert.equal(
    (await writeLibrary(memory(before), null, before, seedLibrary, revA)).kind,
    "failed",
  );
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
test("collection and item boundaries are independent from the UTF-8 byte limit", async () => {
  const uuid = (n: number) =>
    n.toString(16).padStart(8, "0") + "-dddd-4ddd-8ddd-dddddddddddd";
  const draft = complete();
  const first = draft.items[0];
  assert.ok(first);
  draft.items = Array.from({ length: 50 }, (_, index) => ({
    ...first,
    id: uuid(index + 1),
    name: "界".repeat(100),
  }));
  draft.senderAddress = "界".repeat(400);
  draft.clientAddress = "界".repeat(400);
  assert.equal(draftSchema.safeParse(draft).success, true);
  assert.equal(
    draftSchema.safeParse({
      ...draft,
      items: [...draft.items, { ...first, id: uuid(51) }],
    }).success,
    false,
  );
  const base = seedLibrary.invoices[0];
  assert.ok(base && base.status === "draft");
  const full = {
    ...seedLibrary,
    invoices: Array.from({ length: 100 }, (_, index) => ({
      ...base,
      id: uuid(index + 1),
      draft,
    })),
  };
  assert.equal(librarySchema.safeParse(full).success, true);
  assert.equal(
    librarySchema.safeParse({
      ...full,
      invoices: [...full.invoices, { ...base, id: uuid(101) }],
    }).success,
    false,
  );
  assert.ok(new TextEncoder().encode(JSON.stringify(full)).length > MAX_BYTES);
  const unchanged = JSON.stringify(seedLibrary);
  const port = memory(unchanged);
  assert.equal(
    (await writeLibrary(port, exclusive(), unchanged, full, revA)).kind,
    "failed",
  );
  assert.equal(port.getItem(STORAGE_KEY), unchanged);
});

test("payment terms read naturally for one day and many days", () => {
  assert.equal(termsLabel("1"), "1 day");
  assert.equal(termsLabel("30"), "30 days");
});

test("list dates use the design format and drafts derive due from terms", () => {
  assert.equal(displayDate("2026-10-07"), "07 Oct 2026");
  assert.equal(displayDate("incomplete"), "incomplete");
  const [draft, pending, paid] = seedLibrary.invoices;
  assert.equal(dueDate(draft!), "2026-11-06");
  assert.equal(dueDate(pending!), "2026-10-08");
  assert.equal(dueDate(paid!), "2026-10-09");
  assert.equal(
    dueDate({ ...draft!, draft: { ...complete(), issueDate: "" } } as never),
    null,
  );
});
