import { z } from "zod";

export const MAX_INVOICES = 100;
export const MAX_ITEMS = 50;
export const MAX_PRICE = 99_999_999;
export const MAX_BYTES = 2_000_000;
export const idSchema = z.uuid();
export const filterSchema = z.enum(["all", "draft", "pending", "paid"]);
export type Filter = z.infer<typeof filterSchema>;

export function isCalendarDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [year, month, day] = text.split("-").map(Number);
  if (!year || !month || !day || year < 1900 || year > 9998) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
export function addDays(date: string, days: number): string {
  if (!isCalendarDate(date) || ![1, 7, 14, 30].includes(days))
    throw new Error("Invalid invoice date or terms.");
  const value = new Date(date + "T00:00:00.000Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function parseMinor(text: string): number | null {
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole = "", fraction = ""] = text.split(".");
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(value) && value <= MAX_PRICE ? value : null;
}
export function priceText(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor < 0)
    throw new Error("Invalid money.");
  return Math.floor(minor / 100) + "." + String(minor % 100).padStart(2, "0");
}
export function money(minor: number): string {
  const exact = priceText(minor);
  const [whole = "", cents = ""] = exact.split(".");
  return "£" + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + cents;
}
const text = z.string().max(400, "Use at most 400 characters.");
export const itemDraftSchema = z
  .object({
    id: idSchema,
    name: z.string().max(100),
    quantity: z.string().max(10),
    price: z.string().max(16),
  })
  .strict();
export const draftSchema = z
  .object({
    senderAddress: text,
    clientName: z.string().max(100),
    clientEmail: z.string().max(254),
    clientAddress: text,
    description: z.string().max(200),
    issueDate: z.string().max(10),
    terms: z.enum(["1", "7", "14", "30"]),
    items: z.array(itemDraftSchema).max(MAX_ITEMS),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.items.map((x) => x.id)).size !== v.items.length)
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "Line item IDs must be unique.",
      });
  });
export type Draft = z.infer<typeof draftSchema>;
const itemSchema = z
  .object({
    id: idSchema,
    name: z.string().trim().min(1).max(100),
    quantity: z.number().int().min(1).max(9999),
    unitMinor: z.number().int().min(0).max(MAX_PRICE),
  })
  .strict();
const detailsSchema = z
  .object({
    senderAddress: text.trim().min(1),
    clientName: z.string().trim().min(1).max(100),
    clientEmail: z.email().max(254),
    clientAddress: text.trim().min(1),
    description: z.string().trim().min(1).max(200),
    issueDate: z.string().refine(isCalendarDate),
    terms: z.union([z.literal(1), z.literal(7), z.literal(14), z.literal(30)]),
    items: z.array(itemSchema).min(1).max(MAX_ITEMS),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.items.map((x) => x.id)).size !== v.items.length)
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "Line item IDs must be unique.",
      });
  });
export type Details = z.infer<typeof detailsSchema>;
const base = {
  id: idSchema,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  currency: z.literal("GBP"),
};
export const invoiceSchema = z.discriminatedUnion("status", [
  z
    .object({ ...base, status: z.literal("draft"), draft: draftSchema })
    .strict(),
  z
    .object({ ...base, status: z.literal("pending"), details: detailsSchema })
    .strict(),
  z
    .object({
      ...base,
      status: z.literal("paid"),
      details: detailsSchema,
      paidOn: z.string().refine(isCalendarDate),
    })
    .strict(),
]);
export type Invoice = z.infer<typeof invoiceSchema>;
export const librarySchema = z
  .object({
    version: z.literal(1),
    revision: idSchema,
    invoices: z.array(invoiceSchema).max(MAX_INVOICES),
    theme: z.enum(["light", "dark"]),
    filter: filterSchema,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.invoices.map((x) => x.id)).size !== v.invoices.length)
      ctx.addIssue({
        code: "custom",
        path: ["invoices"],
        message: "Invoice IDs must be unique.",
      });
  });
export type Library = z.infer<typeof librarySchema>;
export function emptyDraft(): Draft {
  return {
    senderAddress: "",
    clientName: "",
    clientEmail: "",
    clientAddress: "",
    description: "",
    issueDate: "",
    terms: "30",
    items: [],
  };
}
export function toDraft(invoice: Invoice): Draft {
  if (invoice.status === "draft") return structuredClone(invoice.draft);
  const { items, terms, ...rest } = invoice.details;
  const termText = { 1: "1", 7: "7", 14: "14", 30: "30" } satisfies Record<
    Details["terms"],
    Draft["terms"]
  >;
  return {
    ...rest,
    terms: termText[terms],
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: String(item.quantity),
      price: priceText(item.unitMinor),
    })),
  };
}
export type Validation =
  | { kind: "valid"; details: Details }
  | { kind: "invalid"; errors: Record<string, string> };
export function validatePending(input: Draft): Validation {
  const errors: Record<string, string> = {};
  for (const [key, label] of [
    ["senderAddress", "Sender address"],
    ["clientName", "Client name"],
    ["clientAddress", "Client address"],
    ["description", "Description"],
  ] as const) {
    if (!input[key].trim()) errors[key] = label + " is required.";
  }
  if (!z.email().safeParse(input.clientEmail.trim()).success)
    errors.clientEmail = "Enter a valid client email.";
  if (!isCalendarDate(input.issueDate))
    errors.issueDate = "Enter a valid date from 1900 through 9998.";
  if (input.items.length < 1) errors.items = "Add at least one item.";
  const items = input.items.map((item) => {
    if (!item.name.trim()) errors[item.id + ".name"] = "Item name is required.";
    const quantity = /^\d{1,4}$/.test(item.quantity)
      ? Number(item.quantity)
      : 0;
    if (quantity < 1 || quantity > 9999)
      errors[item.id + ".quantity"] = "Use a whole quantity from 1 to 9999.";
    const unitMinor = parseMinor(item.price);
    if (unitMinor === null)
      errors[item.id + ".price"] =
        "Use a price from 0 to 999999.99 with at most two decimals.";
    return {
      id: item.id,
      name: item.name.trim(),
      quantity,
      unitMinor: unitMinor ?? 0,
    };
  });
  if (Object.keys(errors).length) return { kind: "invalid", errors };
  const parsed = detailsSchema.safeParse({
    ...input,
    clientEmail: input.clientEmail.trim(),
    terms: Number(input.terms),
    items,
  });
  if (!parsed.success)
    return {
      kind: "invalid",
      errors: { form: "Check field lengths and unique line items." },
    };
  return { kind: "valid", details: parsed.data };
}
export function totalMinor(details: Details): number {
  const total = details.items.reduce(
    (sum, item) => sum + item.quantity * item.unitMinor,
    0,
  );
  if (!Number.isSafeInteger(total) || total < 0)
    throw new Error("Invoice total is outside the supported range.");
  return total;
}
export function draftTotal(draft: Draft): number | null {
  if (!draft.items.length) return null;
  let total = 0;
  for (const item of draft.items) {
    const price = parseMinor(item.price);
    if (
      price === null ||
      !/^\d{1,4}$/.test(item.quantity) ||
      Number(item.quantity) < 1
    )
      return null;
    total += Number(item.quantity) * price;
  }
  return Number.isSafeInteger(total) ? total : null;
}
export function saveInvoice(
  library: Library,
  id: string,
  draft: Draft,
  status: "draft" | "pending",
  now: number,
): Library {
  const current = library.invoices.find((x) => x.id === id);
  if (!current && library.invoices.length >= MAX_INVOICES)
    throw new Error(
      "This local library has 100 invoices. Download a backup and remove an older record before adding another.",
    );
  if (current?.status === "paid")
    throw new Error("Paid demo records are read-only.");
  if (current?.status === "pending" && status !== "pending")
    throw new Error("Pending records cannot revert to draft.");
  const common = {
    id,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
    currency: "GBP",
  };
  const ready = status === "pending" ? validatePending(draft) : null;
  if (ready?.kind === "invalid")
    throw new Error("Complete the invoice before marking it pending.");
  const value = invoiceSchema.parse(
    status === "draft"
      ? { ...common, status, draft: draftSchema.parse(draft) }
      : {
          ...common,
          status,
          details: ready?.kind === "valid" ? ready.details : null,
        },
  );
  return librarySchema.parse({
    ...library,
    invoices: current
      ? library.invoices.map((x) => (x.id === id ? value : x))
      : [...library.invoices, value],
  });
}
export function markPaid(library: Library, id: string, date: string): Library {
  const current = library.invoices.find((x) => x.id === id);
  if (!current) throw new Error("Invoice is missing.");
  if (current.status === "paid") return library;
  if (current.status !== "pending")
    throw new Error("Only pending invoices can be marked paid.");
  const paid = invoiceSchema.parse({
    ...current,
    status: "paid",
    paidOn: date,
  });
  return librarySchema.parse({
    ...library,
    invoices: library.invoices.map((x) => (x.id === id ? paid : x)),
  });
}
export function removeInvoice(library: Library, id: string): Library {
  return { ...library, invoices: library.invoices.filter((x) => x.id !== id) };
}
export function label(invoice: Invoice): string {
  return "INV-" + invoice.id.slice(0, 8).toUpperCase();
}

export function termsLabel(terms: Draft["terms"]): string {
  return terms === "1" ? "1 day" : `${terms} days`;
}
