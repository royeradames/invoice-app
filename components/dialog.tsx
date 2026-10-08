"use client";
import { useEffect, useRef, type ReactNode } from "react";
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
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) cancel();
      }}
      onKeyDown={(event) => {
        // A native modal still lets Tab leave for the browser chrome; keep it inside.
        if (event.key !== "Tab") return;
        const focusable = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            "button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])",
          ),
        ];
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
      }}
    >
      <h2 id="dialog-title">{title}</h2>
      {error && (
        <p role="alert" tabIndex={-1} ref={errorRef} className="notice">
          {error}
        </p>
      )}
      {children}
    </dialog>
  );
}
