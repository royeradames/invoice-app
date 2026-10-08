"use client";
import { useState } from "react";
import {
  displayDate,
  draftTotal,
  dueDate,
  filterSchema,
  label,
  money,
  toDraft,
  type Filter,
} from "../lib/invoices.ts";
import { Dialog } from "./dialog";
import { useLibrary } from "./library-provider";
export function InvoiceBoard() {
  const { library, ready, busy, issue, commit, reload, reset } = useLibrary();
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  async function filter(value: Filter) {
    const result = await commit((current) => ({ ...current, filter: value }));
    setError(result.ok ? "" : result.message);
  }
  const visible = library.invoices.filter((invoice) => {
    const draft = toDraft(invoice);
    return (
      (library.filter === "all" || library.filter === invoice.status) &&
      (label(invoice) + " " + draft.clientName + " " + draft.description)
        .toLowerCase()
        .includes(query.trim().toLowerCase())
    );
  });
  return (
    <main id="main" className="shell">
      <header className="page-heading list-heading">
        <div>
          <h1>Invoices</h1>
          <p className="muted">
            {library.invoices.length === 1
              ? "There is 1 total invoice"
              : "There are " + library.invoices.length + " total invoices"}
          </p>
        </div>
        <label className="filter">
          Status
          <select
            disabled={!ready}
            aria-busy={busy || undefined}
            value={library.filter}
            onChange={(e) => {
              if (busy) return;
              const result = filterSchema.safeParse(e.target.value);
              if (result.success) void filter(result.data);
            }}
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
          </select>
        </label>
        <a className="button primary new-invoice" href="/invoices/new">
          <span className="plus" aria-hidden="true" />
          <span>
            New<span className="wide-only"> invoice</span>
          </span>
        </a>
      </header>
      <div className="toolbar">
        <label className="search">
          Search invoices
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
            }}
          />
        </label>
        <button
          className="secondary"
          onClick={() => {
            if (busy) return;
            const result = reload();
            setError(result.ok ? "" : result.message);
          }}
        >
          Reload saved data
        </button>
        {issue?.kind === "invalid" && (
          <button
            className="secondary"
            onClick={() => {
              if (busy) return;
              setError("");
              setResetOpen(true);
            }}
          >
            Reset unreadable data
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {!ready ? (
        <p role="status">Opening local invoices…</p>
      ) : visible.length ? (
        <ul className="invoice-list">
          {visible.map((invoice) => {
            const draft = toDraft(invoice);
            const amount = draftTotal(draft);
            const due = dueDate(invoice);
            return (
              <li key={invoice.id}>
                <a className="invoice-card" href={"/invoices/" + invoice.id}>
                  <strong className="cell-id">{label(invoice)}</strong>
                  <span className="cell-due">
                    {due ? "Due " + displayDate(due) : "Due date incomplete"}
                  </span>
                  <span className="cell-client">
                    {draft.clientName || "Unnamed draft"}
                  </span>
                  <strong className="cell-amount">
                    {amount === null ? "Total incomplete" : money(amount)}
                  </strong>
                  <span className={"badge " + invoice.status}>
                    {invoice.status}
                  </span>
                  <span className="cell-arrow" aria-hidden="true" />
                  <span className="sr-only">View invoice</span>
                </a>
              </li>
            );
          })}
        </ul>
      ) : (
        <section className="empty">
          <h2>
            {query || library.filter !== "all"
              ? "No matching invoices"
              : "No saved invoices"}
          </h2>
          <p>
            {query || library.filter !== "all"
              ? "Change your search or status filter. Other records are unchanged."
              : "Create a synthetic draft to try the local workflow."}
          </p>
        </section>
      )}
      {resetOpen && (
        <Dialog
          title="Reset unreadable invoices?"
          busy={busy}
          error={error}
          cancel={() => setResetOpen(false)}
        >
          <p>
            This replaces unreadable saved data with the three synthetic
            examples. Download its backup first.
          </p>
          <div className="actions">
            <button
              autoFocus
              className="secondary"
              onClick={() => {
                if (!busy) setResetOpen(false);
              }}
            >
              Cancel
            </button>
            <button
              className="danger"
              aria-busy={resetting || undefined}
              onClick={async () => {
                if (busy) return;
                setResetting(true);
                const result = await reset();
                setResetting(false);
                if (result.ok) setResetOpen(false);
                else setError(result.message);
              }}
            >
              Reset saved library
            </button>
          </div>
        </Dialog>
      )}
    </main>
  );
}
