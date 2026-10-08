"use client";
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";

/** Keep Tab inside a modal; a native modal still lets Tab reach the browser chrome. */
export function trapTab(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const focusable = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(
      "button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])",
    ),
  ].filter((el) => el.offsetParent !== null || el === document.activeElement);
  if (focusable.length === 0) {
    event.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (
    event.shiftKey
      ? active === first || !focusable.includes(active as HTMLElement)
      : active === last
  ) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
}

/** Centered confirmation modal (delete, reset). */
export function Dialog({
  title,
  error = "",
  busy,
  cancel,
  children,
}: {
  title: string;
  error?: string;
  busy: boolean;
  cancel: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) cancel();
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget && !busy) cancel();
      }}
      onKeyDown={trapTab}
    >
      <div className="modal-body">
      <h2 id={titleId} className="modal-title">
        {title}
      </h2>
      {error && (
        <p role="alert" tabIndex={-1} ref={errorRef} className="form-alert">
          {error}
        </p>
      )}
      {children}
      </div>
    </dialog>
  );
}
