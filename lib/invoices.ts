import * as z from "zod/mini";
import en from "zod/v4/locales/en.js";

// Zod Mini ships no locale. English keeps the default issue messages classic Zod gave.
z.config(en());

// Domain for the Frontend Mentor invoice brief. Money is kept in pence
// (integers) so totals never pick up binary floating-point error. Totals and
// payment due dates are derived, never stored.

/** An error whose message is plain language, safe to show to people. */
export class InvoiceError extends Error {}

export const STATUSES = ["draft", "pending", "paid"] as const;
export type Status = (typeof STATUSES)[number];
export const TERMS = [1, 7, 14, 30] as const;
export type Terms = (typeof TERMS)[number];
export const MAX_INVOICES = 200;
export const MAX_ITEMS = 50;
export const MAX_QUANTITY = 9999;
export const MAX_PRICE_MINOR = 99_999_999; // £999,999.99
export const MAX_BYTES = 2_000_000;

export const invoiceIdSchema = z.string().check(z.regex(/^[A-Z]{2}\d{4}$/));
export const statusSchema = z.enum(STATUSES);
export const filterSchema = z.array(statusSchema).check(z.maxLength(3));
export type Filter = z.infer<typeof filterSchema>;

// ---------- dates ----------
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
  if (!isCalendarDate(date)) throw new Error("Invalid invoice date.");
  const value = new Date(date + "T00:00:00.000Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate())
  );
}
export const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
// Design format "01 Oct 2021", built by hand so it never depends on locale.
export function displayDate(date: string): string {
  if (!isCalendarDate(date)) return date;
  const [year, month, day] = date.split("-");
  return day + " " + MONTHS[Number(month) - 1] + " " + year;
}

// ---------- money ----------
// Accepts "156", "156.5", "156.50" and an optional thousands comma.
export function parsePrice(text: string): number | null {
  const clean = text.trim().replace(/,/g, "");
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(clean)) return null;
  const [whole = "", fraction = ""] = clean.split(".");
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(value) && value <= MAX_PRICE_MINOR ? value : null;
}
export function parseQuantity(text: string): number | null {
  const clean = text.trim();
  if (!/^\d{1,4}$/.test(clean)) return null;
  const value = Number(clean);
  return value >= 1 && value <= MAX_QUANTITY ? value : null;
}
function grouped(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor < 0) throw new Error("Invalid money.");
  const whole = String(Math.floor(minor / 100)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ",",
  );
  return whole + "." + String(minor % 100).padStart(2, "0");
}
/** "156.00" for form inputs. */
export function priceText(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor < 0) throw new Error("Invalid money.");
  return Math.floor(minor / 100) + "." + String(minor % 100).padStart(2, "0");
}
/** "1,800.90" for the form's read-only line totals. */
export function amountText(minor: number): string {
  return grouped(minor);
}
/** "£ 1,800.90" as in the design, with a no-break space. */
export function money(minor: number): string {
  return "£ " + grouped(minor);
}

// ---------- stored records ----------
const text = (max: number) => z.string().check(z.maxLength(max));
export const addressSchema = z.strictObject({
  street: text(100),
  city: text(60),
  postCode: text(20),
  country: text(60),
});
export type Address = z.infer<typeof addressSchema>;
export const itemSchema = z.strictObject({
  id: z.uuid(),
  name: text(100),
  quantity: z.nullable(z.number().check(z.int(), z.gte(1), z.lte(MAX_QUANTITY))),
  priceMinor: z.nullable(z.number().check(z.int(), z.gte(0), z.lte(MAX_PRICE_MINOR))),
});
export type Item = z.infer<typeof itemSchema>;
const termsSchema = z.union([
  z.literal(1),
  z.literal(7),
  z.literal(14),
  z.literal(30),
]);
export const invoiceSchema = z
  .strictObject({
    id: invoiceIdSchema,
    status: statusSchema,
    createdAt: z.string().check(z.maxLength(10)),
    paymentTerms: termsSchema,
    description: text(200),
    clientName: text(100),
    clientEmail: text(254),
    senderAddress: addressSchema,
    clientAddress: addressSchema,
    items: z.array(itemSchema).check(z.maxLength(MAX_ITEMS)),
  })
  .check(
    z.superRefine((invoice, ctx) => {
      // Drafts may be partial; pending and paid must be complete.
      const problems = issues(invoice, invoice.status === "draft" ? "draft" : "send");
      if (problems.length)
        ctx.addIssue({ code: "custom", message: problems.join(" ") });
      if (new Set(invoice.items.map((x) => x.id)).size !== invoice.items.length)
        ctx.addIssue({ code: "custom", message: "Line item IDs must be unique." });
    }),
  );
export type Invoice = z.infer<typeof invoiceSchema>;
export type InvoiceFields = Omit<Invoice, "id" | "status">;

export const librarySchema = z
  .strictObject({
    version: z.literal(2),
    revision: z.uuid(),
    invoices: z.array(invoiceSchema).check(z.maxLength(MAX_INVOICES)),
    theme: z.enum(["light", "dark"]),
    filter: filterSchema,
  })
  .check(
    z.superRefine((v, ctx) => {
      if (new Set(v.invoices.map((x) => x.id)).size !== v.invoices.length)
        ctx.addIssue({
          code: "custom",
          path: ["invoices"],
          message: "Invoice IDs must be unique.",
        });
    }),
  );
export type Library = z.infer<typeof librarySchema>;

const EMAIL = z.email();
function addressBlank(a: Address): boolean {
  return !a.street.trim() || !a.city.trim() || !a.postCode.trim() || !a.country.trim();
}
// Plain-language problems with a stored record, used by the storage schema.
function issues(invoice: InvoiceFields, intent: "draft" | "send"): string[] {
  const out: string[] = [];
  if (invoice.createdAt && !isCalendarDate(invoice.createdAt))
    out.push("Invoice date is not a real date.");
  if (invoice.clientEmail && !EMAIL.safeParse(invoice.clientEmail).success)
    out.push("Client email is invalid.");
  if (intent === "draft") return out;
  if (
    !invoice.createdAt ||
    !invoice.description.trim() ||
    !invoice.clientName.trim() ||
    !invoice.clientEmail ||
    addressBlank(invoice.senderAddress) ||
    addressBlank(invoice.clientAddress)
  )
    out.push("All fields must be added.");
  if (!invoice.items.length) out.push("An item must be added.");
  if (
    invoice.items.some(
      (item) => !item.name.trim() || item.quantity === null || item.priceMinor === null,
    )
  )
    out.push("Every item needs a name, quantity and price.");
  return out;
}

// ---------- derived values ----------
export function lineTotal(item: Pick<Item, "quantity" | "priceMinor">): number {
  return (item.quantity ?? 0) * (item.priceMinor ?? 0);
}
export function invoiceTotal(invoice: Pick<Invoice, "items">): number {
  const total = invoice.items.reduce((sum, item) => sum + lineTotal(item), 0);
  if (!Number.isSafeInteger(total)) throw new Error("Invoice total is too large.");
  return total;
}
export function paymentDue(invoice: Pick<Invoice, "createdAt" | "paymentTerms">): string | null {
  return isCalendarDate(invoice.createdAt)
    ? addDays(invoice.createdAt, invoice.paymentTerms)
    : null;
}
export function termsLabel(terms: Terms): string {
  return terms === 1 ? "Net 1 Day" : "Net " + terms + " Days";
}
export function statusLabel(status: Status): string {
  return status === "draft" ? "Draft" : status === "pending" ? "Pending" : "Paid";
}
export function addressLines(address: Address): string[] {
  return [address.street, address.city, address.postCode, address.country].filter(
    (line) => line.trim(),
  );
}

// ---------- IDs ----------
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/** Two random uppercase letters and four random digits, unique in the library. */
export function newInvoiceId(
  taken: ReadonlySet<string>,
  random: () => number = Math.random,
): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const pick = (chars: string) => chars[Math.floor(random() * chars.length)];
    const id =
      pick(LETTERS) +
      pick(LETTERS) +
      pick("0123456789") +
      pick("0123456789") +
      pick("0123456789") +
      pick("0123456789");
    if (!taken.has(id)) return id;
  }
  throw new InvoiceError("Could not create a unique invoice ID.");
}

// ---------- the form ----------
export type ItemValues = { id: string; name: string; quantity: string; price: string };
export type FormValues = {
  senderAddress: Address;
  clientName: string;
  clientEmail: string;
  clientAddress: Address;
  createdAt: string;
  paymentTerms: "1" | "7" | "14" | "30";
  description: string;
  items: ItemValues[];
};
const blankAddress = (): Address => ({ street: "", city: "", postCode: "", country: "" });
export function emptyForm(today: string): FormValues {
  return {
    senderAddress: blankAddress(),
    clientName: "",
    clientEmail: "",
    clientAddress: blankAddress(),
    createdAt: today,
    paymentTerms: "30",
    description: "",
    items: [],
  };
}
export function toForm(invoice: Invoice): FormValues {
  return {
    senderAddress: { ...invoice.senderAddress },
    clientName: invoice.clientName,
    clientEmail: invoice.clientEmail,
    clientAddress: { ...invoice.clientAddress },
    createdAt: invoice.createdAt,
    paymentTerms: String(invoice.paymentTerms) as FormValues["paymentTerms"],
    description: invoice.description,
    items: invoice.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity === null ? "" : String(item.quantity),
      price: item.priceMinor === null ? "" : priceText(item.priceMinor),
    })),
  };
}
export function formLineTotal(item: ItemValues): number {
  return (parseQuantity(item.quantity) ?? 0) * (parsePrice(item.price) ?? 0);
}
export function formTotal(values: FormValues): number {
  return values.items.reduce((sum, item) => sum + formLineTotal(item), 0);
}

/** Field paths used for errors, in the order the form shows them. */
export const ADDRESS_KEYS = ["street", "city", "postCode", "country"] as const;
export type Intent = "draft" | "send";
export type FormResult =
  | { ok: true; fields: InvoiceFields }
  | { ok: false; errors: Record<string, string>; summary: string[] };

export const MESSAGES = {
  empty: "can't be empty",
  email: "invalid email",
  date: "invalid date",
  quantity: "1 to 9999",
  price: "invalid price",
} as const;

/**
 * "send" (Save & Send, Save Changes) needs every field and one item.
 * "draft" (Save as Draft) accepts blanks, but anything typed must be valid.
 */
export function validateForm(values: FormValues, intent: Intent): FormResult {
  const errors: Record<string, string> = {};
  let missing = false;
  const required = (path: string, value: string) => {
    if (intent === "send" && !value.trim()) {
      errors[path] = MESSAGES.empty;
      missing = true;
    }
  };
  for (const key of ADDRESS_KEYS) required("senderAddress." + key, values.senderAddress[key]);
  required("clientName", values.clientName);
  const email = values.clientEmail.trim();
  if (email && !EMAIL.safeParse(email).success) errors.clientEmail = MESSAGES.email;
  else required("clientEmail", email);
  for (const key of ADDRESS_KEYS) required("clientAddress." + key, values.clientAddress[key]);
  if (values.createdAt && !isCalendarDate(values.createdAt)) errors.createdAt = MESSAGES.date;
  else required("createdAt", values.createdAt);
  required("description", values.description);
  let badNumber = false;
  const items: Item[] = values.items.map((item) => {
    const base = "items." + item.id + ".";
    required(base + "name", item.name);
    const quantity = item.quantity.trim() ? parseQuantity(item.quantity) : null;
    if (item.quantity.trim() && quantity === null) {
      errors[base + "quantity"] = MESSAGES.quantity;
      badNumber = true;
    } else required(base + "quantity", item.quantity);
    const priceMinor = item.price.trim() ? parsePrice(item.price) : null;
    if (item.price.trim() && priceMinor === null) {
      errors[base + "price"] = MESSAGES.price;
      badNumber = true;
    } else required(base + "price", item.price);
    return { id: item.id, name: item.name.trim(), quantity, priceMinor };
  });
  const noItems = intent === "send" && values.items.length === 0;
  if (noItems) errors.items = "An item must be added";
  const summary: string[] = [];
  if (missing) summary.push("All fields must be added");
  if (noItems) summary.push("An item must be added");
  if (errors.clientEmail === MESSAGES.email) summary.push("Client's email must be a valid address");
  if (errors.createdAt === MESSAGES.date) summary.push("Invoice date must be a real date");
  if (badNumber)
    summary.push(
      "Quantities must be whole numbers from 1 to 9999; prices up to 999,999.99 with two decimals at most",
    );
  if (Object.keys(errors).length) return { ok: false, errors, summary };
  return {
    ok: true,
    fields: {
      createdAt: values.createdAt,
      paymentTerms: Number(values.paymentTerms) as Terms,
      description: values.description.trim(),
      clientName: values.clientName.trim(),
      clientEmail: email,
      senderAddress: trimAddress(values.senderAddress),
      clientAddress: trimAddress(values.clientAddress),
      items,
    },
  };
}
function trimAddress(a: Address): Address {
  return {
    street: a.street.trim(),
    city: a.city.trim(),
    postCode: a.postCode.trim(),
    country: a.country.trim(),
  };
}

// ---------- library changes ----------
function withInvoices(library: Library, invoices: Invoice[]): Library {
  return librarySchema.parse({ ...library, invoices });
}
export function createInvoice(
  library: Library,
  fields: InvoiceFields,
  status: "draft" | "pending",
  id: string = newInvoiceId(new Set(library.invoices.map((x) => x.id))),
): { library: Library; id: string } {
  if (library.invoices.length >= MAX_INVOICES)
    throw new InvoiceError(
      "This browser already holds " + MAX_INVOICES + " invoices. Delete one before adding another.",
    );
  const invoice = invoiceSchema.parse({ ...fields, id, status });
  // A new invoice goes to the top of the list, where the person who made it looks for it.
  return { library: withInvoices(library, [invoice, ...library.invoices]), id };
}
/** Save Changes: a draft becomes pending; pending and paid keep their status. */
export function updateInvoice(library: Library, id: string, fields: InvoiceFields): Library {
  const current = library.invoices.find((x) => x.id === id);
  if (!current) throw new InvoiceError("This invoice no longer exists in this browser.");
  const status: Status = current.status === "draft" ? "pending" : current.status;
  const next = invoiceSchema.parse({ ...fields, id, status });
  return withInvoices(
    library,
    library.invoices.map((x) => (x.id === id ? next : x)),
  );
}
export function markPaid(library: Library, id: string): Library {
  const current = library.invoices.find((x) => x.id === id);
  if (!current) throw new InvoiceError("This invoice no longer exists in this browser.");
  if (current.status === "paid") return library;
  if (current.status !== "pending")
    throw new InvoiceError("Only pending invoices can be marked as paid.");
  return withInvoices(
    library,
    library.invoices.map((x) => (x.id === id ? { ...x, status: "paid" as const } : x)),
  );
}
export function removeInvoice(library: Library, id: string): Library {
  return { ...library, invoices: library.invoices.filter((x) => x.id !== id) };
}
export function visibleInvoices(library: Library): Invoice[] {
  return library.filter.length
    ? library.invoices.filter((x) => library.filter.includes(x.status))
    : library.invoices;
}

// The list offers a client or ID search once it passes SEARCH_ABOVE invoices,
// and shows LIST_STEP rows at a time.
export const SEARCH_ABOVE = 10;
export const LIST_STEP = 10;
export function searchInvoices(invoices: Invoice[], query: string): Invoice[] {
  const needle = query.trim().replace(/^#/, "").toLocaleLowerCase();
  if (!needle) return invoices;
  return invoices.filter(
    (x) =>
      x.id.toLocaleLowerCase().includes(needle) ||
      x.clientName.toLocaleLowerCase().includes(needle),
  );
}
