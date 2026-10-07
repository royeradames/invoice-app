"use client";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useForm } from "@tanstack/react-form";
import {
  draftSchema,
  draftTotal,
  emptyDraft,
  label,
  MAX_ITEMS,
  money,
  saveInvoice,
  toDraft,
  validatePending,
  type Draft,
  type Invoice,
} from "../lib/invoices.ts";
import { Dialog } from "./dialog";
import { downloadJson, useLibrary } from "./library-provider";

type Intent =
  | { kind: "leave"; href: string }
  | { kind: "reload" }
  | { kind: "reset" };
const fields = [
  { name: "senderAddress", label: "Sender address", limit: 400 },
  { name: "clientName", label: "Client name", limit: 100 },
  { name: "clientEmail", label: "Client email", limit: 254 },
  { name: "clientAddress", label: "Client address", limit: 400 },
  { name: "description", label: "Description", limit: 200 },
  { name: "issueDate", label: "Issue date", limit: 10 },
] as const;
export function InvoiceEditor({ id }: { id?: string }) {
  const { library, ready, generation } = useLibrary();
  const invoice = id ? library.invoices.find((x) => x.id === id) : undefined;
  if (!ready)
    return (
      <main id="main" className="shell">
        <h1>Invoice editor</h1>
        <p role="status">Opening local draft…</p>
      </main>
    );
  if (id && !invoice)
    return (
      <main id="main" className="shell">
        <h1>Invoice not found in this browser</h1>
        <a href="/">Back to invoices</a>
      </main>
    );
  if (invoice?.status === "paid")
    return (
      <main id="main" className="shell">
        <h1>Paid record is read-only</h1>
        <a href={"/invoices/" + invoice.id}>View invoice</a>
      </main>
    );
  return (
    <DraftEditor key={(id ?? "new") + "-" + generation} invoice={invoice} />
  );
}
function DraftEditor({ invoice }: { invoice?: Invoice }) {
  const { busy, commit, reload, reset, issue } = useLibrary();
  const [id] = useState(() => invoice?.id ?? crypto.randomUUID());
  const [defaults] = useState(() =>
    invoice ? toDraft(invoice) : emptyDraft(),
  );
  const form = useForm({
    defaultValues: defaults,
    validators: { onSubmit: draftSchema },
  });
  const [savedDraft, setSavedDraft] = useState<Draft | null>(
    invoice ? defaults : null,
  );
  const savedRef = useRef<Draft | null>(invoice ? defaults : null);
  const [savedStatus, setSavedStatus] = useState<"draft" | "pending">(
    invoice?.status === "pending" ? "pending" : "draft",
  );
  const [savedOnce, setSavedOnce] = useState(Boolean(invoice));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [dialogError, setDialogError] = useState("");
  const savingRef = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const total = (values: Draft) => draftTotal(values);
  const dirty = (values: Draft, saved: Draft | null) =>
    !saved || JSON.stringify(values) !== JSON.stringify(saved);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (
        !savedRef.current ||
        JSON.stringify(form.state.values) !== JSON.stringify(savedRef.current)
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [form]);
  useEffect(() => {
    if (Object.keys(errors).length && !intent) errorRef.current?.focus();
  }, [errors, intent]);

  async function save(status: "draft" | "pending"): Promise<boolean> {
    if (savingRef.current || busy) return false;
    savingRef.current = true;
    setMessage("");
    setDialogError("");
    try {
      const parsed = draftSchema.safeParse(form.state.values);
      if (!parsed.success) {
        const text = "Check the field lengths and unique line items.";
        setErrors({ form: text });
        if (intent) setDialogError(text);
        return false;
      }
      if (status === "pending") {
        const result = validatePending(parsed.data);
        if (result.kind === "invalid") {
          setErrors(result.errors);
          if (intent)
            setDialogError(
              "Complete the required fields before saving this pending invoice. Cancel to return to the form.",
            );
          return false;
        }
      }
      let written: Invoice | undefined;
      const result = await commit((current) => {
        const next = saveInvoice(current, id, parsed.data, status, Date.now());
        written = next.invoices.find((x) => x.id === id);
        return next;
      });
      if (!result.ok || !written) {
        const text = result.ok
          ? "The saved invoice was not returned."
          : result.message;
        setMessage(text);
        if (intent) setDialogError(text);
        return false;
      }
      const saved = toDraft(written);
      savedRef.current = saved;
      setSavedDraft(saved);
      form.reset(saved, { keepDefaultValues: true });
      setErrors({});
      setSavedStatus(status);
      setSavedOnce(true);
      setMessage("Saved in this browser.");
      if (!invoice && !savedOnce && !intent)
        window.location.replace("/invoices/" + id + "/edit");
      return true;
    } finally {
      savingRef.current = false;
    }
  }
  function finish(next: Intent) {
    if (next.kind === "leave") {
      savedRef.current = form.state.values;
      window.location.assign(next.href);
      return;
    }
    if (next.kind === "reload") {
      const result = reload();
      if (!result.ok) {
        setDialogError(result.message);
        setMessage(result.message);
      } else setIntent(null);
    }
  }
  function request(next: Intent) {
    if (busy || savingRef.current) return;
    setDialogError("");
    if (next.kind === "reset" || dirty(form.state.values, savedRef.current))
      setIntent(next);
    else finish(next);
  }
  async function continueWithSave() {
    if (!intent || intent.kind === "reset") return;
    if (await save(savedStatus)) finish(intent);
  }
  const back = invoice ? "/invoices/" + id : "/";
  function navigate(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (
      event.button ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey
    )
      return;
    event.preventDefault();
    request({ kind: "leave", href });
  }
  return (
    <form.Subscribe selector={(state) => state.values}>
      {(values) => {
        const amount = total(values);
        return (
          <main id="main" className="shell">
            <a
              className="back"
              href={back}
              onClick={(event) => navigate(event, back)}
            >
              Back without saving
            </a>
            <header className="page-heading">
              <div>
                <p className="eyebrow">Synthetic GBP record</p>
                <h1>{invoice ? "Edit " + label(invoice) : "New invoice"}</h1>
                <p role="status">
                  {dirty(values, savedDraft)
                    ? "Unsaved changes"
                    : "Saved version"}
                  {savedOnce ? " · " + savedStatus : ""}
                </p>
              </div>
              <a
                href="/invoices/new"
                onClick={(event) => navigate(event, "/invoices/new")}
              >
                Start another invoice
              </a>
            </header>
            <p>
              Incomplete work can be saved as a draft. Marking it pending
              requires all details and at least one valid item. No invoice is
              emailed.
            </p>
            {Object.keys(errors).length > 0 && (
              <div ref={errorRef} tabIndex={-1} role="alert" className="notice">
                <h2>Check this invoice</h2>
                <ul>
                  {Object.entries(errors).map(([key, text]) => (
                    <li key={key}>{text}</li>
                  ))}
                </ul>
              </div>
            )}
            {message && (
              <p role="status" className="notice">
                {message}
              </p>
            )}
            <form
              className="paper editor-form"
              onSubmit={(event) => {
                event.preventDefault();
                void save("pending");
              }}
            >
              <fieldset disabled={busy}>
                <legend>Invoice details</legend>
                <div className="form-grid">
                  {fields.map(({ name, label: caption, limit }) => (
                    <form.Field key={name} name={name}>
                      {(field) => (
                        <label>
                          <span id={name + "-label"}>{caption}</span>
                          <input
                            aria-labelledby={name + "-label"}
                            type={name === "issueDate" ? "date" : "text"}
                            maxLength={limit}
                            value={field.state.value}
                            onChange={(event) => {
                              field.handleChange(event.target.value);
                              setErrors((current) => {
                                const next = { ...current };
                                delete next[name];
                                return next;
                              });
                            }}
                            onBlur={field.handleBlur}
                            aria-invalid={Boolean(errors[name])}
                            aria-describedby={
                              errors[name] ? name + "-error" : undefined
                            }
                          />
                          {errors[name] && (
                            <span id={name + "-error"} className="field-error">
                              {errors[name]}
                            </span>
                          )}
                        </label>
                      )}
                    </form.Field>
                  ))}
                  <form.Field name="terms">
                    {(field) => (
                      <label>
                        Payment terms
                        <select
                          value={field.state.value}
                          onChange={(event) => {
                            const parsed = draftSchema.shape.terms.safeParse(
                              event.target.value,
                            );
                            if (parsed.success) field.handleChange(parsed.data);
                          }}
                        >
                          <option value="1">1 day</option>
                          <option value="7">7 days</option>
                          <option value="14">14 days</option>
                          <option value="30">30 days</option>
                        </select>
                      </label>
                    )}
                  </form.Field>
                </div>
              </fieldset>
              <fieldset disabled={busy}>
                <legend>Line items</legend>
                {errors.items && <p role="alert">{errors.items}</p>}
                {values.items.map((item, index) => (
                  <section
                    className="line-editor"
                    key={item.id}
                    aria-label={"Item " + (index + 1)}
                  >
                    <h3>Item {index + 1}</h3>
                    <form.Field name={`items[${index}].name`}>
                      {(field) => (
                        <label>
                          <span id={item.id + "-name-label"}>Item name</span>
                          <input
                            aria-labelledby={item.id + "-name-label"}
                            maxLength={100}
                            value={field.state.value}
                            onChange={(e) => {
                              field.handleChange(e.target.value);
                              setErrors({});
                            }}
                            aria-invalid={Boolean(errors[item.id + ".name"])}
                            aria-describedby={
                              errors[item.id + ".name"]
                                ? item.id + "-name-error"
                                : undefined
                            }
                          />
                          {errors[item.id + ".name"] && (
                            <span
                              className="field-error"
                              id={item.id + "-name-error"}
                            >
                              {errors[item.id + ".name"]}
                            </span>
                          )}
                        </label>
                      )}
                    </form.Field>
                    <form.Field name={`items[${index}].quantity`}>
                      {(field) => (
                        <label>
                          <span id={item.id + "-quantity-label"}>Quantity</span>
                          <input
                            aria-labelledby={item.id + "-quantity-label"}
                            inputMode="numeric"
                            maxLength={10}
                            value={field.state.value}
                            onChange={(e) => {
                              field.handleChange(e.target.value);
                              setErrors({});
                            }}
                            aria-invalid={Boolean(
                              errors[item.id + ".quantity"],
                            )}
                            aria-describedby={
                              errors[item.id + ".quantity"]
                                ? item.id + "-quantity-error"
                                : undefined
                            }
                          />
                          {errors[item.id + ".quantity"] && (
                            <span
                              className="field-error"
                              id={item.id + "-quantity-error"}
                            >
                              {errors[item.id + ".quantity"]}
                            </span>
                          )}
                        </label>
                      )}
                    </form.Field>
                    <form.Field name={`items[${index}].price`}>
                      {(field) => (
                        <label>
                          <span id={item.id + "-price-label"}>
                            Unit price (GBP)
                          </span>
                          <input
                            aria-labelledby={item.id + "-price-label"}
                            inputMode="decimal"
                            maxLength={16}
                            value={field.state.value}
                            onChange={(e) => {
                              field.handleChange(e.target.value);
                              setErrors({});
                            }}
                            aria-invalid={Boolean(errors[item.id + ".price"])}
                            aria-describedby={
                              errors[item.id + ".price"]
                                ? item.id + "-price-error"
                                : undefined
                            }
                          />
                          {errors[item.id + ".price"] && (
                            <span
                              className="field-error"
                              id={item.id + "-price-error"}
                            >
                              {errors[item.id + ".price"]}
                            </span>
                          )}
                        </label>
                      )}
                    </form.Field>
                    <p>
                      Line total:{" "}
                      {draftTotal({ ...values, items: [item] }) === null
                        ? "Incomplete"
                        : money(draftTotal({ ...values, items: [item] }) ?? 0)}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        form.setFieldValue(
                          "items",
                          values.items.filter((x) => x.id !== item.id),
                        );
                        setErrors((current) =>
                          Object.fromEntries(
                            Object.entries(current).filter(
                              ([key]) => !key.startsWith(item.id + "."),
                            ),
                          ),
                        );
                      }}
                    >
                      Remove item {index + 1}
                    </button>
                  </section>
                ))}
                <button
                  type="button"
                  disabled={values.items.length >= MAX_ITEMS}
                  onClick={() => {
                    form.pushFieldValue("items", {
                      id: crypto.randomUUID(),
                      name: "",
                      quantity: "",
                      price: "",
                    });
                    setErrors((current) => {
                      const next = { ...current };
                      delete next.items;
                      return next;
                    });
                  }}
                >
                  Add item
                </button>
                <p>
                  {values.items.length} / {MAX_ITEMS} items · whole quantities
                  only
                </p>
              </fieldset>
              <p className="total">
                Total{" "}
                <strong>
                  {amount === null ? "Incomplete" : money(amount)}
                </strong>
              </p>
              <div className="actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => request({ kind: "leave", href: back })}
                >
                  Cancel
                </button>
                {savedStatus === "draft" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void save("draft")}
                  >
                    Save draft
                  </button>
                )}
                <button type="submit" className="primary" disabled={busy}>
                  {savedStatus === "pending"
                    ? "Save changes"
                    : "Save as pending"}
                </button>
              </div>
            </form>
            <div className="actions">
              <button
                disabled={busy}
                onClick={() =>
                  downloadJson(values, "synthetic-invoice-draft.json")
                }
              >
                Download current draft
              </button>
              <button
                disabled={busy}
                onClick={() => request({ kind: "reload" })}
              >
                Reload saved data
              </button>
              {issue?.kind === "invalid" && (
                <button
                  disabled={busy}
                  onClick={() => request({ kind: "reset" })}
                >
                  Reset unreadable data
                </button>
              )}
            </div>
            {intent && (
              <Dialog
                title={
                  intent.kind === "reset"
                    ? "Reset unreadable data and this draft?"
                    : "Keep your unsaved changes?"
                }
                error={dialogError}
                busy={busy}
                cancel={() => setIntent(null)}
              >
                {intent.kind === "reset" ? (
                  <>
                    <p>
                      This replaces unreadable storage with synthetic examples
                      and discards this working draft. Download both backups
                      before continuing.
                    </p>
                    <div className="actions">
                      <button
                        autoFocus
                        disabled={busy}
                        onClick={() => setIntent(null)}
                      >
                        Cancel
                      </button>
                      <button
                        disabled={busy}
                        onClick={async () => {
                          const result = await reset();
                          if (!result.ok) setDialogError(result.message);
                        }}
                      >
                        Reset saved library
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p>
                      Your current form has changes that are not saved. Save
                      keeps them in this browser; discard keeps the last saved
                      record.
                    </p>
                    <div className="actions">
                      <button
                        autoFocus
                        disabled={busy}
                        onClick={() => setIntent(null)}
                      >
                        Cancel
                      </button>
                      <button disabled={busy} onClick={() => finish(intent)}>
                        Discard changes
                      </button>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() => void continueWithSave()}
                      >
                        Save and continue
                      </button>
                    </div>
                  </>
                )}
              </Dialog>
            )}
          </main>
        );
      }}
    </form.Subscribe>
  );
}
