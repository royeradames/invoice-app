"use client";
import { useForm } from "@tanstack/react-form";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ADDRESS_KEYS,
  amountText,
  createInvoice,
  emptyForm,
  formLineTotal,
  isoDate,
  MAX_ITEMS,
  parsePrice,
  priceText,
  toForm,
  updateInvoice,
  validateForm,
  type FormValues,
  type Intent,
  type Invoice,
} from "../lib/invoices.ts";
import { DatePicker } from "./date-picker";
import { SlowHint } from "./slow-hint";
import { trapTab } from "./dialog";
import { ArrowLeftIcon, DeleteIcon } from "./icons";
import { useLibrary } from "./library-provider";

const ADDRESS_LABELS = {
  street: "Street Address",
  city: "City",
  postCode: "Post Code",
  country: "Country",
} as const;
const domId = (path: string) => "f-" + path.replace(/[^a-zA-Z0-9-]/g, "-");

function Field({
  path,
  label,
  error,
  className,
  srSuffix,
  children,
}: {
  path: string;
  label: ReactNode;
  /** Extra words for screen readers only, kept out of the visible label box. */
  srSuffix?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={"field " + (className ?? "") + (error ? " has-error" : "")}>
      <div className="field-top">
        <label id={domId(path) + "-label"} htmlFor={domId(path)}>
          {label}
        </label>
        {error && (
          <span id={domId(path) + "-error"} className="field-error">
            {error}
          </span>
        )}
      </div>
      {srSuffix && (
        <span id={domId(path) + "-sr"} className="sr-only">
          {srSuffix}
        </span>
      )}
      {children}
    </div>
  );
}

/**
 * New Invoice / Edit drawer. It slides out from the sidebar on tablet and
 * desktop and fills the screen under the header on phones.
 */
export function InvoiceForm({
  invoice,
  onClose,
  returnFocusTo,
}: {
  invoice?: Invoice;
  onClose: (message?: string) => void;
  /** Where focus goes when the drawer closes; defaults to the element focused when it opened. */
  returnFocusTo?: Element | null;
}) {
  const { busy, commit } = useLibrary();
  const [defaults] = useState<FormValues>(() =>
    invoice ? toForm(invoice) : emptyForm(isoDate(new Date())),
  );
  const form = useForm({ defaultValues: defaults });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<string[]>([]);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState<"" | Intent>("");
  const savingRef = useRef(false);
  const [focusTick, setFocusTick] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const errorsRef = useRef(errors);
  useEffect(() => {
    errorsRef.current = errors;
  });

  const returnFocusRef = useRef(returnFocusTo);
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = returnFocusRef.current ?? document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  // After a failed save, move focus to the first invalid field.
  useEffect(() => {
    if (!focusTick) return;
    const first = bodyRef.current?.querySelector<HTMLElement>(
      '[aria-invalid="true"], .date-button.invalid',
    );
    if (first) first.focus();
    else if (errorsRef.current.items) addRef.current?.focus();
  }, [focusTick]);
  useEffect(() => {
    if (saveError) alertRef.current?.focus();
  }, [saveError]);
  // After adding or removing an item, put focus on a sensible neighbour.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    (document.getElementById(target) ?? addRef.current)?.focus();
  });

  function clearError(path: string) {
    setErrors((current) => {
      if (!(path in current)) return current;
      const next = { ...current };
      delete next[path];
      if (Object.keys(next).length === 0) setSummary([]);
      return next;
    });
  }
  function close(message?: string) {
    if (savingRef.current) return;
    onClose(message);
  }
  async function save(intent: Intent) {
    if (savingRef.current || busy) return;
    setSaveError("");
    const result = validateForm(form.state.values, intent);
    if (!result.ok) {
      setErrors(result.errors);
      setSummary(result.summary);
      setFocusTick((t) => t + 1);
      return;
    }
    setErrors({});
    setSummary([]);
    savingRef.current = true;
    setSaving(intent);
    let savedId = invoice?.id ?? "";
    const written = await commit((library) => {
      if (invoice) return updateInvoice(library, invoice.id, result.fields);
      const created = createInvoice(
        library,
        result.fields,
        intent === "draft" ? "draft" : "pending",
      );
      savedId = created.id;
      return created.library;
    });
    savingRef.current = false;
    setSaving("");
    if (!written.ok) {
      setSaveError(written.message);
      return;
    }
    onClose(
      invoice
        ? invoice.status === "draft"
          ? "Changes saved. Invoice #" + savedId + " is now pending. No email was sent."
          : "Changes saved. Invoice #" + savedId + " is still " + invoice.status + "."
        : intent === "draft"
          ? "Invoice #" + savedId + " saved as a draft."
          : "Invoice #" + savedId + " saved as pending. No email was sent.",
    );
  }
  const describe = (path: string) => (errors[path] ? domId(path) + "-error" : undefined);
  function textInput(
    path: string,
    label: string,
    options: {
      className?: string;
      type?: string;
      inputMode?: "text" | "email" | "numeric" | "decimal";
      autoComplete?: string;
      placeholder?: string;
      maxLength: number;
    },
  ) {
    return (
      <form.Field
        key={path}
        name={path as "clientName"}
      >
        {(field) => (
          <Field path={path} label={label} error={errors[path]} className={options.className}>
            <input
              id={domId(path)}
              className={"input" + (errors[path] ? " invalid" : "")}
              type={options.type ?? "text"}
              inputMode={options.inputMode}
              autoComplete={options.autoComplete ?? "off"}
              placeholder={options.placeholder}
              maxLength={options.maxLength}
              value={field.state.value}
              readOnly={saving !== ""}
              aria-invalid={Boolean(errors[path]) || undefined}
              aria-describedby={describe(path)}
              onChange={(event) => {
                field.handleChange(event.target.value);
                clearError(path);
              }}
              onBlur={field.handleBlur}
            />
          </Field>
        )}
      </form.Field>
    );
  }
  function address(prefix: "senderAddress" | "clientAddress") {
    return (
      <div className="address-grid">
        {ADDRESS_KEYS.map((key) =>
          textInput(prefix + "." + key, ADDRESS_LABELS[key], {
            className: "addr-" + key,
            maxLength: key === "street" ? 100 : key === "postCode" ? 20 : 60,
            autoComplete: "off",
          }),
        )}
      </div>
    );
  }
  const title = invoice ? (
    <>
      Edit <span className="hash">#</span>
      {invoice.id}
    </>
  ) : (
    "New Invoice"
  );
  return (
    <dialog
      ref={dialogRef}
      className="drawer"
      aria-labelledby="drawer-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onKeyDown={trapTab}
    >
      <form
        className="drawer-form"
        noValidate
        aria-busy={saving !== "" || undefined}
        onSubmit={(event) => {
          event.preventDefault();
          void save("send");
        }}
      >
        <div className="drawer-body" ref={bodyRef}>
          <button type="button" className="go-back narrow-only" onClick={() => close()}>
            <ArrowLeftIcon />
            Go back
          </button>
          <h2 id="drawer-title" className="drawer-title">
            {title}
          </h2>
          <p className="demo-note">
            Demo: invoices are saved only in this browser.{" "}
            {invoice ? "Nothing is emailed." : "Save & Send doesn't email anyone."}
          </p>
          <fieldset className="group">
            <legend className="group-title">Bill From</legend>
            {address("senderAddress")}
          </fieldset>
          <fieldset className="group">
            <legend className="group-title">Bill To</legend>
            <div className="stack">
              {textInput("clientName", "Client’s Name", { maxLength: 100 })}
              {textInput("clientEmail", "Client’s Email", {
                type: "email",
                inputMode: "email",
                placeholder: "e.g. email@example.com",
                maxLength: 254,
              })}
            </div>
            {address("clientAddress")}
          </fieldset>
          <div className="group terms-grid">
            <form.Field name="createdAt">
              {(field) => (
                <Field path="createdAt" label="Invoice Date" error={errors.createdAt}>
                  <DatePicker
                    id={domId("createdAt")}
                    labelId={domId("createdAt") + "-label"}
                    value={field.state.value}
                    invalid={Boolean(errors.createdAt)}
                    describedBy={describe("createdAt")}
                    onChange={(value) => {
                      if (saving) return;
                      field.handleChange(value);
                      clearError("createdAt");
                    }}
                  />
                </Field>
              )}
            </form.Field>
            <form.Field name="paymentTerms">
              {(field) => (
                <Field path="paymentTerms" label="Payment Terms">
                  <select
                    id={domId("paymentTerms")}
                    className="input select"
                    value={field.state.value}
                    onChange={(event) => {
                      if (saving) return;
                      const value = event.target.value;
                      if (value === "1" || value === "7" || value === "14" || value === "30")
                        field.handleChange(value);
                    }}
                  >
                    <option value="1">Net 1 Day</option>
                    <option value="7">Net 7 Days</option>
                    <option value="14">Net 14 Days</option>
                    <option value="30">Net 30 Days</option>
                  </select>
                </Field>
              )}
            </form.Field>
            {textInput("description", "Project Description", {
              className: "span-2",
              placeholder: "e.g. Graphic Design Service",
              maxLength: 200,
            })}
          </div>
          <form.Field name="items" mode="array">
            {(itemsField) => (
              <section className="items-editor" aria-labelledby="items-title">
                <h3 id="items-title" className="items-title">
                  Item List
                </h3>
                {itemsField.state.value.length > 0 && (
                  <div className="item-head" aria-hidden="true">
                    <span>Item Name</span>
                    <span>Qty.</span>
                    <span>Price</span>
                    <span>Total</span>
                  </div>
                )}
                <ul className="item-rows">
                  {itemsField.state.value.map((item, index) => {
                    const base = "items." + item.id + ".";
                    const n = index + 1;
                    return (
                      // Fields are named by index, so each one remounts (key) when
                      // a row above is removed and its index changes.
                      <li key={item.id} className="item-row">
                        <form.Field key={item.id + "-name-" + index} name={`items[${index}].name`}>
                          {(field) => (
                            <Field
                              path={base + "name"}
                              label="Item Name"
                              srSuffix={"for item " + n}
                              error={errors[base + "name"]}
                              className="item-name"
                            >
                              <input
                                id={domId(base + "name")}
                                aria-labelledby={
                                  domId(base + "name") + "-label " + domId(base + "name") + "-sr"
                                }
                                className={"input" + (errors[base + "name"] ? " invalid" : "")}
                                maxLength={100}
                                autoComplete="off"
                                value={field.state.value}
                                readOnly={saving !== ""}
                                aria-invalid={Boolean(errors[base + "name"]) || undefined}
                                aria-describedby={describe(base + "name")}
                                onChange={(event) => {
                                  field.handleChange(event.target.value);
                                  clearError(base + "name");
                                }}
                              />
                            </Field>
                          )}
                        </form.Field>
                        <form.Field key={item.id + "-quantity-" + index} name={`items[${index}].quantity`}>
                          {(field) => (
                            <Field
                              path={base + "quantity"}
                              label="Qty."
                              srSuffix={"for item " + n}
                              error={errors[base + "quantity"]}
                              className="item-qty"
                            >
                              <input
                                id={domId(base + "quantity")}
                                aria-labelledby={
                                  domId(base + "quantity") + "-label " + domId(base + "quantity") + "-sr"
                                }
                                className={
                                  "input" + (errors[base + "quantity"] ? " invalid" : "")
                                }
                                inputMode="numeric"
                                maxLength={4}
                                autoComplete="off"
                                value={field.state.value}
                                readOnly={saving !== ""}
                                aria-invalid={Boolean(errors[base + "quantity"]) || undefined}
                                aria-describedby={describe(base + "quantity")}
                                onChange={(event) => {
                                  field.handleChange(event.target.value);
                                  clearError(base + "quantity");
                                }}
                              />
                            </Field>
                          )}
                        </form.Field>
                        <form.Field key={item.id + "-price-" + index} name={`items[${index}].price`}>
                          {(field) => (
                            <Field
                              path={base + "price"}
                              label="Price"
                              srSuffix={"for item " + n}
                              error={errors[base + "price"]}
                              className="item-price"
                            >
                              <input
                                id={domId(base + "price")}
                                aria-labelledby={
                                  domId(base + "price") + "-label " + domId(base + "price") + "-sr"
                                }
                                className={"input" + (errors[base + "price"] ? " invalid" : "")}
                                inputMode="decimal"
                                maxLength={10}
                                autoComplete="off"
                                value={field.state.value}
                                readOnly={saving !== ""}
                                aria-invalid={Boolean(errors[base + "price"]) || undefined}
                                aria-describedby={describe(base + "price")}
                                onChange={(event) => {
                                  field.handleChange(event.target.value);
                                  clearError(base + "price");
                                }}
                                onBlur={() => {
                                  // "156" becomes "156.00", as in the design.
                                  const minor = parsePrice(field.state.value);
                                  if (minor !== null) field.handleChange(priceText(minor));
                                }}
                              />
                            </Field>
                          )}
                        </form.Field>
                        <div className="field item-total">
                          <div className="field-top">
                            <span className="label-text">Total</span>
                          </div>
                          <span className="sr-only">for item {n}:</span>
                          <output className="item-total-value">
                            {/* The array field re-renders only when rows are added or
                                removed, so read the live row for its total. */}
                            <form.Subscribe key={item.id + "-total-" + index} selector={(state) => state.values.items[index]}>
                              {(row) => amountText(row ? formLineTotal(row) : 0)}
                            </form.Subscribe>
                          </output>
                        </div>
                        <button
                          id={"delete-" + item.id}
                          type="button"
                          className="item-delete"
                          onClick={async () => {
                            if (saving) return;
                            const rows = itemsField.state.value;
                            const next = rows[index + 1] ?? rows[index - 1];
                            const target = next ? "delete-" + next.id : "add-item";
                            for (const key of ["name", "quantity", "price"]) clearError(base + key);
                            await itemsField.removeValue(index);
                            // The clicked button is gone; after the rows re-render,
                            // move focus to the neighbouring row (or Add New Item).
                            requestAnimationFrame(() =>
                              (document.getElementById(target) ?? addRef.current)?.focus(),
                            );
                          }}
                        >
                          <DeleteIcon />
                          <span className="sr-only">
                            Delete item {n}
                            <form.Subscribe key={item.id + "-label-" + index} selector={(state) => state.values.items[index]?.name}>
                              {(name) => (name ? ": " + name : "")}
                            </form.Subscribe>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <button
                  ref={addRef}
                  id="add-item"
                  type="button"
                  className={"button add-item" + (errors.items ? " invalid" : "")}
                  aria-describedby={errors.items ? "items-error" : undefined}
                  onClick={() => {
                    if (saving) return;
                    if (itemsField.state.value.length >= MAX_ITEMS) {
                      setSaveError("An invoice can have up to " + MAX_ITEMS + " items.");
                      return;
                    }
                    const id = crypto.randomUUID();
                    itemsField.pushValue({ id, name: "", quantity: "1", price: "" });
                    pendingFocus.current = domId("items." + id + ".name");
                    clearError("items");
                  }}
                >
                  + Add New Item
                </button>
              </section>
            )}
          </form.Field>
          {summary.length > 0 && (
            <ul className="form-summary" id="items-error" role="alert">
              {summary.map((line) => (
                <li key={line}>- {line}</li>
              ))}
            </ul>
          )}
          <SlowHint
            active={saving !== ""}
            text="Still saving. Another tab may be using your invoices; this finishes when it lets go."
          />
          {saveError && (
            <p className="form-alert" role="alert" tabIndex={-1} ref={alertRef}>
              {saveError}
            </p>
          )}
        </div>
        <div className={"drawer-footer" + (invoice ? " editing" : "")}>
          {invoice ? (
            <>
              <button type="button" className="button secondary" onClick={() => close()}>
                Cancel
              </button>
              <button
                type="submit"
                className="button primary"
                aria-busy={saving === "send" || undefined}
              >
                {saving === "send" ? "Saving…" : "Save Changes"}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="button secondary" onClick={() => close()}>
                Discard
              </button>
              <span className="footer-gap" />
              <button
                type="button"
                className="button dark"
                aria-busy={saving === "draft" || undefined}
                onClick={() => void save("draft")}
              >
                {saving === "draft" ? "Saving…" : "Save as Draft"}
              </button>
              <button
                type="submit"
                className="button primary"
                aria-busy={saving === "send" || undefined}
              >
                {saving === "send" ? "Saving…" : "Save & Send"}
              </button>
            </>
          )}
        </div>
      </form>
    </dialog>
  );
}
