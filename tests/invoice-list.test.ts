import { test } from "node:test";
import assert from "node:assert/strict";
import { createInvoice, librarySchema, searchInvoices, type Invoice, type Library } from "../lib/invoices.ts";
import { seedLibrary } from "../lib/fixtures.ts";

const blank = { street: "", city: "", postCode: "", country: "" };
// Synthetic drafts, stored newest first: SY{count} is the newest.
function library(count: number): Library {
  const invoices: Invoice[] = Array.from({ length: count }, (_, index) => ({
    id: "SY" + String(count - index).padStart(4, "0"),
    status: "draft",
    createdAt: "2026-01-01",
    paymentTerms: 30,
    description: "",
    clientName: "Client " + (count - index),
    clientEmail: "",
    senderAddress: blank,
    clientAddress: blank,
    items: [],
  }));
  return librarySchema.parse({ ...seedLibrary, invoices });
}
const draftFields = { createdAt: "2026-02-01", paymentTerms: 30 as const, description: "", clientName: "Newest Client", clientEmail: "", senderAddress: blank, clientAddress: blank, items: [] };

for (const { count, clientMatches } of [
  { count: 1, clientMatches: ["SY0001"] },
  { count: 6, clientMatches: ["SY0001"] },
  { count: 30, clientMatches: ["SY0019", "SY0018", "SY0017", "SY0016", "SY0015", "SY0014", "SY0013", "SY0012", "SY0011", "SY0010", "SY0001"] },
  { count: 100, clientMatches: ["SY0100", "SY0019", "SY0018", "SY0017", "SY0016", "SY0015", "SY0014", "SY0013", "SY0012", "SY0011", "SY0010", "SY0001"] },
]) {
  test(`${count} invoices: a new invoice goes to the top of the list`, () => {
    const created = createInvoice(library(count), draftFields, "draft", "NW0001");
    assert.equal(created.library.invoices[0]?.id, "NW0001");
    assert.equal(created.library.invoices.length, count + 1);
    assert.equal(created.library.invoices.at(-1)?.id, "SY0001");
  });

  test(`${count} invoices: search finds one by client name or ID, ignoring case, spaces and a leading #`, () => {
    const { invoices } = library(count);
    assert.deepEqual(searchInvoices(invoices, "").length, count);
    assert.deepEqual(searchInvoices(invoices, "  #sy0001 ").map((x) => x.id), ["SY0001"]);
    for (const query of ["CLIENT 1", "client 1"])
      assert.deepEqual(searchInvoices(invoices, query).map((x) => x.id), clientMatches);
    assert.deepEqual(searchInvoices(invoices, "nobody"), []);
  });
}
