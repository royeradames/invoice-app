"use client";
import { useRef, useState } from "react";
import {
  termsLabel,
  displayDate,
  dueDate,
  draftTotal,
  label,
  markPaid,
  money,
  removeInvoice,
  toDraft,
} from "../lib/invoices.ts";
import { Dialog } from "./dialog";
import { downloadJson, useLibrary } from "./library-provider";
export function InvoiceDetail({ id }: { id: string }) {
  const { library, ready, busy, commit, reload } = useLibrary();
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  // Busy, not disabled: the control that started a write shows aria-busy and
  // keeps focus; every action ignores activation while any write is pending.
  const [pending, setPending] = useState<"" | "paid" | "delete">("");
  const lockedRef = useRef(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const invoice = library.invoices.find((x) => x.id === id);
  if (!ready)
    return (
      <main id="main" className="shell">
        <h1>Invoice details</h1>
        <p role="status">Opening local record…</p>
      </main>
    );
  if (!invoice)
    return (
      <main id="main" className="shell">
        <h1>Invoice not found in this browser</h1>
        <p>
          This link does not retrieve another browser or account&apos;s records.
        </p>
        <a href="/">Back to invoices</a>
      </main>
    );
  const draft = toDraft(invoice);
  const amount = draftTotal(draft);
  const due = dueDate(invoice);
  const blocked = () => busy || lockedRef.current;
  return (
    <main id="main" className="shell">
      <a className="back" href="/">
        Back to invoices
      </a>
      <header className="status-bar">
        <div className="status" ref={statusRef} tabIndex={-1}>
          <span className="muted">Status</span>
          <span className={"badge " + invoice.status}>{invoice.status}</span>
        </div>
        <div className="actions detail-actions">
          {invoice.status !== "paid" && (
            <a className="button secondary" href={"/invoices/" + id + "/edit"}>
              Edit invoice
            </a>
          )}
          <button
            className="danger"
            onClick={() => {
              if (blocked()) return;
              setError("");
              setDeleting(true);
            }}
          >
            Delete invoice
          </button>
          {invoice.status === "pending" && (
            <button
              className="primary"
              aria-busy={pending === "paid" || undefined}
              onClick={async () => {
                if (blocked()) return;
                lockedRef.current = true;
                setPending("paid");
                const result = await commit((current) =>
                  markPaid(current, id, new Date().toISOString().slice(0, 10)),
                );
                lockedRef.current = false;
                setPending("");
                setError(result.ok ? "" : result.message);
                // The button leaves with the pending state; keep focus nearby.
                if (result.ok) statusRef.current?.focus();
              }}
            >
              Mark paid
            </button>
          )}
        </div>
      </header>
      {error && !deleting && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      <article className="paper invoice-paper">
        <div className="invoice-top">
          <div>
            <h1 className="invoice-id">{label(invoice)}</h1>
            <p className="muted">
              {draft.description || "Description incomplete"}
            </p>
          </div>
          <p className="address sender muted">
            {draft.senderAddress || "Address incomplete"}
          </p>
        </div>
        <div className="detail-grid">
          <section className="dates">
            <h2>Invoice date</h2>
            <p className="value">
              {draft.issueDate ? displayDate(draft.issueDate) : "Incomplete"}
            </p>
            <h2>Payment due</h2>
            <p className="value">{due ? displayDate(due) : "Incomplete"}</p>
            <p className="muted">Terms: {termsLabel(draft.terms)}</p>
            {invoice.status === "paid" && (
              <p className="muted">
                Marked paid: {displayDate(invoice.paidOn)} (UTC date)
              </p>
            )}
          </section>
          <section>
            <h2>Bill to</h2>
            <p className="value">{draft.clientName || "Name incomplete"}</p>
            <p className="address muted">
              {draft.clientAddress || "Address incomplete"}
            </p>
          </section>
          <section>
            <h2>Sent to</h2>
            <p className="value">{draft.clientEmail || "Email incomplete"}</p>
          </section>
        </div>
        <div className="items">
          <table>
            <caption className="sr-only">Synthetic line items — GBP</caption>
            <thead>
              <tr>
                <th scope="col">Item name</th>
                <th scope="col">Qty.</th>
                <th scope="col">Price</th>
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {draft.items.map((item) => {
                const line = draftTotal({ ...draft, items: [item] });
                return (
                  <tr key={item.id}>
                    <th scope="row">{item.name || "Unnamed item"}</th>
                    <td className="qty">{item.quantity || "Incomplete"}</td>
                    <td className="price">
                      {item.price ? "£" + item.price : "Incomplete"}
                    </td>
                    <td className="line">
                      {line === null ? "Incomplete" : money(line)}
                    </td>
                  </tr>
                );
              })}
              {draft.items.length === 0 && (
                <tr>
                  <td colSpan={4}>No line items yet.</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="total amount-due">
            Amount due{" "}
            <strong>{amount === null ? "Incomplete" : money(amount)}</strong>
          </p>
        </div>
      </article>
      <p className="muted note">
        No funds were collected. Paid is a local record state. Paid examples
        cannot be edited or reverted in this foundation.
      </p>
      <div className="actions">
        <button
          className="secondary"
          onClick={() => downloadJson(invoice, "synthetic-invoice.json")}
        >
          Download local record
        </button>
        <button
          className="secondary"
          onClick={() => {
            if (blocked()) return;
            const result = reload();
            setError(result.ok ? "" : result.message);
          }}
        >
          Reload saved data
        </button>
      </div>
      {deleting && (
        <Dialog
          title={"Delete " + label(invoice) + "?"}
          busy={busy || pending === "delete"}
          error={error}
          cancel={() => setDeleting(false)}
        >
          <p>
            Are you sure you want to delete {label(invoice)}? This removes this
            synthetic record from this browser and cannot be undone. Other
            invoices are unchanged.
          </p>
          <div className="actions dialog-actions">
            <button
              autoFocus
              className="secondary"
              onClick={() => {
                if (!blocked()) setDeleting(false);
              }}
            >
              Cancel
            </button>
            <button
              className="danger"
              aria-busy={pending === "delete" || undefined}
              onClick={async () => {
                if (blocked()) return;
                lockedRef.current = true;
                setPending("delete");
                const result = await commit((current) =>
                  removeInvoice(current, id),
                );
                if (result.ok) {
                  // Stay busy and locked until the list page loads.
                  window.location.assign("/");
                  return;
                }
                lockedRef.current = false;
                setPending("");
                setError(result.message);
              }}
            >
              Confirm deletion
            </button>
          </div>
        </Dialog>
      )}
    </main>
  );
}
