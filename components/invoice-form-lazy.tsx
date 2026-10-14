"use client";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { InvoiceForm as InvoiceFormComponent } from "./invoice-form";

type Props = Parameters<typeof InvoiceFormComponent>[0];

// The form (TanStack Form, zod, the date picker) travels in its own script, so the list and
// detail pages parse less JavaScript on their first load. The script is fetched when a drawer
// opener is hovered, focused or touched, and again on the press itself.
const Form = lazy(() => import("./invoice-form").then((m) => ({ default: m.InvoiceForm })));

export function preloadInvoiceForm() {
  void import("./invoice-form");
}

// While the script is still arriving, the drawer frame is already open and modal, so nothing
// behind it reacts, Tab stays inside, and Escape cancels the opening.
function DrawerLoading({ onCancel }: { onCancel: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className="drawer"
      aria-label="Invoice form"
      aria-busy="true"
      tabIndex={-1}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <div className="drawer-body">
        <p className="muted" role="status">
          Loading…
        </p>
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
    <Suspense fallback={<DrawerLoading onCancel={() => props.onClose()} />}>
      <Form {...props} returnFocusTo={opener} />
    </Suspense>
  );
}
