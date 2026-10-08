"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  displayDate,
  invoiceTotal,
  money,
  paymentDue,
  visibleInvoices,
  type Filter,
} from "../lib/invoices.ts";
import { FilterMenu } from "./filter-menu";
import { FlashMessage } from "./flash-message";
import { ArrowRightIcon, PlusIcon } from "./icons";
import { InvoiceForm } from "./invoice-form";
import { useLibrary } from "./library-provider";
import { StatusBadge } from "./status-badge";

const plural = (n: number, word: string) => n + " " + word + (n === 1 ? "" : "s");

function countText(total: number, filter: Filter, visible: number) {
  if (filter.length === 0)
    return {
      wide: total === 1 ? "There is 1 total invoice" : "There are " + total + " total invoices",
      short: plural(total, "invoice"),
    };
  const which = filter.length === 1 ? filter[0] + " " : "matching ";
  return {
    wide:
      visible === 1
        ? "There is 1 " + which + "invoice"
        : "There are " + visible + " " + which + "invoices",
    short: plural(visible, "invoice"),
  };
}

export function InvoiceBoard() {
  const { library, ready, busy, commit, flash, setFlash } = useLibrary();
  const flashRef = useRef<HTMLParagraphElement>(null);
  // Arriving here after a delete: a live region that mounts already filled is
  // often not read aloud, so move focus to the message itself.
  const [arrivedWithFlash] = useState(() => flash?.path === "/");
  useEffect(() => {
    if (arrivedWithFlash) flashRef.current?.focus();
  }, [arrivedWithFlash]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const visible = visibleInvoices(library);
  const count = countText(library.invoices.length, library.filter, visible.length);
  return (
    <main id="main" className="page">
      <header className="list-header">
        <div className="list-title">
          <h1>Invoices</h1>
          <p className="muted" aria-live="polite">
            {!ready ? (
              "Opening saved invoices…"
            ) : (
              <>
                <span className="wide-only">{count.wide}</span>
                <span className="narrow-only">{count.short}</span>
              </>
            )}
          </p>
        </div>
        <FilterMenu
          value={library.filter}
          busy={busy}
          onChange={async (filter) => {
            const result = await commit((current) => ({ ...current, filter }));
            setError(result.ok ? "" : result.message);
          }}
        />
        <button
          type="button"
          className="button primary new-invoice"
          onClick={() => {
            if (!ready) return;
            setFlash(null);
            setCreating(true);
          }}
        >
          <span className="plus-circle" aria-hidden="true">
            <PlusIcon />
          </span>
          {/* One flex item, so the button gap never splits the words. */}
          <span>
            New<span className="wide-only">&nbsp;Invoice</span>
          </span>
        </button>
      </header>
      <FlashMessage path="/" ref={flashRef} />
      {error && (
        <p role="alert" className="form-alert">
          {error}
        </p>
      )}
      {!ready ? null : visible.length ? (
        <ul className="invoice-list">
          {visible.map((invoice) => {
            const due = paymentDue(invoice);
            return (
              <li key={invoice.id}>
                <Link className="invoice-row" href={"/invoices/" + invoice.id}>
                  <span className="row-id">
                    <span className="hash">#</span>
                    {invoice.id}
                  </span>
                  <span className="row-due">
                    {due ? "Due " + displayDate(due) : "No due date"}
                  </span>
                  <span className="row-client">{invoice.clientName || "No client name"}</span>
                  <span className="row-amount">{money(invoiceTotal(invoice))}</span>
                  <span className="row-status">
                    <StatusBadge status={invoice.status} />
                  </span>
                  <ArrowRightIcon className="row-arrow" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <section className="empty" aria-labelledby="empty-title">
          {/* eslint-disable-next-line @next/next/no-img-element -- official SVG illustration */}
          <img src="/illustration-empty.svg" alt="" width={242} height={200} />
          <h2 id="empty-title">There is nothing here</h2>
          {library.invoices.length === 0 ? (
            <p>
              Create an invoice by clicking the <br />
              <strong>
                New<span className="wide-only"> Invoice</span>
              </strong>{" "}
              button and get started
            </p>
          ) : (
            <p>No invoices match this filter. Change the filter to see the rest.</p>
          )}
        </section>
      )}
      {creating && (
        <InvoiceForm
          onClose={(text) => {
            setCreating(false);
            if (text) setFlash({ text, path: "/" });
          }}
        />
      )}
    </main>
  );
}
