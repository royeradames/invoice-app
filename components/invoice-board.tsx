"use client";
import { useState } from "react";
import {
  draftTotal,
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
      <header className="page-heading">
        <div>
          <p className="eyebrow">Local demo workspace</p>
          <h1>Invoices</h1>
          <p>{library.invoices.length} saved synthetic records</p>
        </div>
        <a className="button primary" href="/invoices/new">
          New invoice
        </a>
      </header>
      <div className="toolbar">
        <label>
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
        <label>
          Status
          <select
            disabled={!ready || busy}
            value={library.filter}
            onChange={(e) => {
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
        <button
          disabled={!ready || busy}
          onClick={async () => {
            const result = await commit((current) => ({
              ...current,
              theme: current.theme === "light" ? "dark" : "light",
            }));
            setError(result.ok ? "" : result.message);
          }}
        >
          Use {library.theme === "light" ? "dark" : "light"} theme
        </button>
        <button
          disabled={!ready || busy}
          onClick={() => {
            const result = reload();
            setError(result.ok ? "" : result.message);
          }}
        >
          Reload saved data
        </button>
        {issue?.kind === "invalid" && (
          <button
            disabled={busy}
            onClick={() => {
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
            return (
              <li key={invoice.id}>
                <a className="invoice-card" href={"/invoices/" + invoice.id}>
                  <strong>{label(invoice)}</strong>
                  <span>{draft.clientName || "Unnamed draft"}</span>
                  <span>{draft.issueDate || "Date incomplete"}</span>
                  <strong>
                    {amount === null ? "Total incomplete" : money(amount)}
                  </strong>
                  <span className={"badge " + invoice.status}>
                    {invoice.status}
                  </span>
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
              disabled={busy}
              onClick={() => setResetOpen(false)}
            >
              Cancel
            </button>
            <button
              disabled={busy}
              onClick={async () => {
                const result = await reset();
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
