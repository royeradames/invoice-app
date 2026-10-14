"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FlashMessage } from "./flash-message";
import { SlowHint } from "./slow-hint";
import {
  addressLines,
  displayDate,
  invoiceTotal,
  lineTotal,
  markPaid,
  money,
  paymentDue,
  removeInvoice,
  type Address,
  type Invoice,
} from "../lib/invoices.ts";
import { Dialog } from "./dialog";
import { ArrowLeftIcon } from "./icons";
import { useLibrary } from "./library-provider";
import { StatusBadge } from "./status-badge";

// Same split as the list page: the edit form's script arrives when Edit is pressed.
const InvoiceForm = dynamic(() => import("./invoice-form").then((m) => m.InvoiceForm));

function GoBack() {
  return (
    <Link className="go-back" href="/">
      <ArrowLeftIcon />
      Go back
    </Link>
  );
}
function AddressBlock({ address, className }: { address: Address; className?: string }) {
  const lines = addressLines(address);
  return (
    <p className={"address " + (className ?? "")}>
      {lines.length
        ? lines.map((line, i) => (
            <span key={i} className="address-line">
              {line}
            </span>
          ))
        : "No address yet"}
    </p>
  );
}

export function InvoiceDetail({ id }: { id: string }) {
  const { library, ready, busy, commit, setFlash } = useLibrary();
  const path = "/invoices/" + id;
  const router = useRouter();
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Busy, not disabled: the control that started a write shows aria-busy and
  // keeps focus; every action ignores activation while a write is pending.
  const [pending, setPending] = useState<"" | "paid" | "delete">("");
  const lockedRef = useRef(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLParagraphElement>(null);
  // After an edit is saved, the drawer hands focus back to Edit, which on a
  // phone sits at the foot of the page, far from the confirmation. Move focus
  // to the confirmation so it scrolls into view and is read out.
  const [savedTick, setSavedTick] = useState(0);
  useEffect(() => {
    if (savedTick) flashRef.current?.focus();
  }, [savedTick]);
  const invoice = library.invoices.find((x) => x.id === id);
  if (!ready)
    return (
      <main id="main" className="page detail">
        <GoBack />
        <h1 className="sr-only">Invoice #{id}</h1>
        <p role="status" className="muted">
          Opening invoice…
        </p>
      </main>
    );
  if (!invoice && pending === "delete")
    return (
      <main id="main" className="page detail">
        <p role="status" className="muted">
          Invoice #{id} deleted. Opening your invoices…
        </p>
      </main>
    );
  if (!invoice)
    return (
      <main id="main" className="page detail">
        <GoBack />
        <section className="empty">
          <h1>Invoice #{id} isn&apos;t here</h1>
          <p>It may have been deleted. Invoices are saved only in this browser.</p>
        </section>
      </main>
    );
  const blocked = () => busy || lockedRef.current;
  async function paid() {
    if (blocked()) return;
    lockedRef.current = true;
    setPending("paid");
    const result = await commit((current) => markPaid(current, id));
    lockedRef.current = false;
    setPending("");
    setError(result.ok ? "" : result.message);
    if (result.ok) setFlash({ text: "Invoice #" + id + " is now paid.", path });
    // The button leaves with the pending status; keep focus nearby.
    if (result.ok) statusRef.current?.focus();
  }
  const actions = (where: string) => (
    <div className={"detail-actions " + where}>
      <button
        type="button"
        className="button secondary"
        onClick={() => {
          if (blocked()) return;
          setFlash(null);
          setEditing(true);
        }}
      >
        Edit
      </button>
      <button
        type="button"
        className="button danger"
        onClick={() => {
          if (blocked()) return;
          setError("");
          setDeleting(true);
        }}
      >
        Delete
      </button>
      {invoice.status === "pending" && (
        <button
          type="button"
          className="button primary"
          aria-busy={pending === "paid" || undefined}
          onClick={paid}
        >
          {pending === "paid" ? "Marking as paid…" : "Mark as Paid"}
        </button>
      )}
    </div>
  );
  const due = paymentDue(invoice);
  return (
    <main id="main" className="page detail">
      <GoBack />
      <section className="status-bar" aria-label="Invoice status and actions">
        <div className="status" ref={statusRef} tabIndex={-1}>
          <span className="status-label">Status</span>
          <StatusBadge status={invoice.status} />
        </div>
        {actions("wide-actions")}
      </section>
      <FlashMessage path={path} ref={flashRef} />
      <SlowHint
        active={pending === "paid"}
        text="Still saving. Another tab may be using your invoices; this finishes when it lets go."
      />
      {error && !deleting && (
        <p role="alert" className="form-alert">
          {error}
        </p>
      )}
      <article className="invoice-sheet" aria-labelledby="invoice-title">
        <div className="sheet-top">
          <div>
            <h1 id="invoice-title" className="sheet-id">
              <span className="hash">#</span>
              {invoice.id}
            </h1>
            <p className="label">{invoice.description || "No description yet"}</p>
          </div>
          <AddressBlock address={invoice.senderAddress} className="sender" />
        </div>
        <div className="sheet-meta">
          <div className="meta-dates">
            <h2 className="label">Invoice Date</h2>
            <p className="meta-value">
              {invoice.createdAt ? displayDate(invoice.createdAt) : "Not set"}
            </p>
            <h2 className="label">Payment Due</h2>
            <p className="meta-value">{due ? displayDate(due) : "Not set"}</p>
          </div>
          <div className="meta-bill">
            <h2 className="label">Bill To</h2>
            <p className="meta-value">{invoice.clientName || "No client name"}</p>
            <AddressBlock address={invoice.clientAddress} />
          </div>
          <div className="meta-email">
            <h2 className="label">Sent to</h2>
            <p className="meta-value break">{invoice.clientEmail || "No email yet"}</p>
          </div>
        </div>
        <div className="sheet-items">
          <table className="items-table">
            <caption className="sr-only">Items on invoice #{invoice.id}</caption>
            <thead>
              <tr>
                <th scope="col">Item Name</th>
                <th scope="col">QTY.</th>
                <th scope="col">Price</th>
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item) => (
                <tr key={item.id}>
                  <th scope="row">{item.name || "Unnamed item"}</th>
                  <td>{item.quantity ?? "–"}</td>
                  <td>{item.priceMinor === null ? "–" : money(item.priceMinor)}</td>
                  <td className="line-total">{money(lineTotal(item))}</td>
                </tr>
              ))}
              {invoice.items.length === 0 && (
                <tr>
                  <td colSpan={4} className="no-items">
                    No items yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <ul className="items-list" aria-label={"Items on invoice #" + invoice.id}>
            {invoice.items.map((item) => (
              <li key={item.id}>
                <span>
                  <span className="li-name">{item.name || "Unnamed item"}</span>
                  <span className="li-qty">
                    {(item.quantity ?? "–") +
                      " x " +
                      (item.priceMinor === null ? "–" : money(item.priceMinor))}
                  </span>
                </span>
                <span className="line-total">{money(lineTotal(item))}</span>
              </li>
            ))}
            {invoice.items.length === 0 && <li className="no-items">No items yet</li>}
          </ul>
          <p className="amount-due">
            <span>Amount Due</span>
            <strong>{money(invoiceTotal(invoice))}</strong>
          </p>
        </div>
      </article>
      {actions("narrow-actions")}
      {editing && (
        <InvoiceForm
          invoice={invoice}
          onClose={(text) => {
            setEditing(false);
            if (text) {
              setFlash({ text, path });
              setSavedTick((n) => n + 1);
            }
          }}
        />
      )}
      {deleting && (
        <DeleteDialog
          invoice={invoice}
          pending={pending === "delete"}
          error={error}
          cancel={() => {
            if (!blocked()) setDeleting(false);
          }}
          confirm={async () => {
            if (blocked()) return;
            lockedRef.current = true;
            setPending("delete");
            const result = await commit((current) => removeInvoice(current, id));
            if (result.ok) {
              setFlash({ text: "Invoice #" + id + " was deleted.", path: "/" });
              // Stay busy and locked until the list replaces this page.
              router.replace("/");
              return;
            }
            lockedRef.current = false;
            setPending("");
            setError(result.message);
          }}
        />
      )}
    </main>
  );
}

function DeleteDialog({
  invoice,
  pending,
  error,
  cancel,
  confirm,
}: {
  invoice: Invoice;
  pending: boolean;
  error: string;
  cancel: () => void;
  confirm: () => void;
}) {
  return (
    <Dialog title="Confirm Deletion" busy={pending} error={error} cancel={cancel}>
      <SlowHint
        active={pending}
        text="Still deleting. Another tab may be using your invoices; this finishes when it lets go."
      />
      <p className="dialog-text">
        Are you sure you want to delete invoice #{invoice.id}? This action cannot be undone.
      </p>
      <div className="dialog-actions">
        <button type="button" autoFocus className="button secondary" onClick={cancel}>
          Cancel
        </button>
        <button
          type="button"
          className="button danger"
          aria-busy={pending || undefined}
          onClick={confirm}
        >
          {pending ? "Deleting…" : "Delete"}
        </button>
      </div>
    </Dialog>
  );
}
