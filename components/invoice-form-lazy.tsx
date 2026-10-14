"use client";
import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { trapTab } from "./dialog";
import type { InvoiceForm as InvoiceFormComponent } from "./invoice-form";

type Props = Parameters<typeof InvoiceFormComponent>[0];

// The form (TanStack Form, zod, the date picker) travels in its own script, so the list and
// detail pages parse less JavaScript on their first load. The script is fetched when a drawer
// opener is hovered, focused or touched, and again on the press itself.
const Form = lazy(() => import("./invoice-form").then((m) => ({ default: m.InvoiceForm })));

export function preloadInvoiceForm() {
  // A failed preload is not an error here: the press itself fetches again and reports.
  import("./invoice-form").catch(() => {});
}

export const formLoadFailedMessage =
  "The invoice form could not load. Check your connection and try again.";

// If the form's script cannot be fetched (offline, or a deployment rotated its chunks),
// the drawer closes with a message instead of the page falling over.
class FormLoadBoundary extends Component<
  { onFail: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// While the script is still arriving, the drawer frame is already open and modal, so nothing
// behind it reacts, Tab stays inside, and Escape, a press on the backdrop or the Cancel button
// cancels the opening, as they do on the drawer itself.
function DrawerLoading({ onCancel, returnFocusTo }: { onCancel: () => void; returnFocusTo: Element | null }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef(returnFocusTo);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      // The frame may already be detached here, so give focus back on purpose, as the drawer does.
      const opener = openerRef.current;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className="drawer"
      aria-label="Invoice form"
      aria-busy="true"
      tabIndex={-1}
      onKeyDown={trapTab}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="drawer-body">
        <p className="muted" role="status">
          Loading…
        </p>
        <button type="button" className="button secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}

export function LazyInvoiceForm(props: Props) {
  // The opener is read now, before the script arrives, so focus returns to it when the drawer
  // closes even if the loading frame held focus in between.
  const [opener] = useState<Element | null>(() => {
    if (typeof document === "undefined") return null;
    const active = document.activeElement;
    return active && active !== document.body ? active : null;
  });
  return (
    <FormLoadBoundary onFail={() => props.onClose(formLoadFailedMessage)}>
      <Suspense fallback={<DrawerLoading onCancel={() => props.onClose()} returnFocusTo={opener} />}>
        <Form {...props} returnFocusTo={opener} />
      </Suspense>
    </FormLoadBoundary>
  );
}
