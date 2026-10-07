"use client";
import { useState } from "react";
import {
  addDays,
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
        <p>This link does not retrieve another browser or account&apos;s records.</p>
        <a href="/">Back to invoices</a>
      </main>
    );
  const draft = toDraft(invoice);
  const amount = draftTotal(draft);
  return (
    <main id="main" className="shell">
      <a className="back" href="/">
        Back to invoices
      </a>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Synthetic record</p>
          <h1>{label(invoice)}</h1>
          <span className={"badge " + invoice.status}>{invoice.status}</span>
        </div>
        <div className="actions">
          {invoice.status !== "paid" && (
            <a className="button" href={"/invoices/" + id + "/edit"}>
              Edit invoice
            </a>
          )}
          <button
            disabled={busy}
            onClick={() => {
              setError("");
              setDeleting(true);
            }}
          >
            Delete invoice
          </button>
          {invoice.status === "pending" && (
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                const result = await commit((current) =>
                  markPaid(current, id, new Date().toISOString().slice(0, 10)),
                );
                setError(result.ok ? "" : result.message);
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
      <article className="paper">
        <h2>{draft.description || "Description incomplete"}</h2>
        <div className="detail-grid">
          <section>
            <h3>Bill from</h3>
            <p className="address">
              {draft.senderAddress || "Address incomplete"}
            </p>
          </section>
          <section>
            <h3>Bill to</h3>
            <p>{draft.clientName || "Name incomplete"}</p>
            <p className="address">
              {draft.clientAddress || "Address incomplete"}
            </p>
            <p>{draft.clientEmail || "Email incomplete"}</p>
          </section>
          <section>
            <h3>Dates</h3>
            <p>Issue: {draft.issueDate || "Incomplete"}</p>
            <p>Terms: {draft.terms} days</p>
            <p>
              Due:{" "}
              {invoice.status === "draft"
                ? "Set when marked pending"
                : addDays(invoice.details.issueDate, invoice.details.terms)}
            </p>
            {invoice.status === "paid" && (
              <p>Marked paid: {invoice.paidOn} (UTC date)</p>
            )}
          </section>
        </div>
        <div className="table-scroll">
          <table>
            <caption>Synthetic line items — GBP</caption>
            <thead>
              <tr>
                <th>Item</th>
                <th>Quantity</th>
                <th>Unit price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {draft.items.map((item) => {
                const line = draftTotal({ ...draft, items: [item] });
                return (
                  <tr key={item.id}>
                    <th scope="row">{item.name || "Unnamed item"}</th>
                    <td>{item.quantity || "Incomplete"}</td>
                    <td>{item.price ? "£" + item.price : "Incomplete"}</td>
                    <td>{line === null ? "Incomplete" : money(line)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="total">
          Total{" "}
          <strong>{amount === null ? "Incomplete" : money(amount)}</strong>
        </p>
        <p>
          No funds were collected. Paid is a local record state. Paid examples
          cannot be edited or reverted in this foundation.
        </p>
      </article>
      <div className="actions">
        <button onClick={() => downloadJson(invoice, "synthetic-invoice.json")}>
          Download local record
        </button>
        <button
          disabled={busy}
          onClick={() => {
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
          busy={busy}
          error={error}
          cancel={() => setDeleting(false)}
        >
          <p>
            This removes this synthetic record from this browser. Other invoices
            are unchanged.
          </p>
          <div className="actions">
            <button
              autoFocus
              disabled={busy}
              onClick={() => setDeleting(false)}
            >
              Cancel
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={async () => {
                const result = await commit((current) =>
                  removeInvoice(current, id),
                );
                if (result.ok) window.location.assign("/");
                else setError(result.message);
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
