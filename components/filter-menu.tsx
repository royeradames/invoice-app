"use client";
import { useEffect, useId, useRef, useState } from "react";
import { STATUSES, statusLabel, type Filter } from "../lib/invoices.ts";
import { ArrowDownIcon, CheckIcon } from "./icons";

/**
 * "Filter by status" disclosure with one checkbox per status, as in the design.
 * No box checked means every status is shown.
 */
export function FilterMenu({
  value,
  busy,
  onChange,
}: {
  value: Filter;
  busy: boolean;
  onChange: (next: Filter) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  // Shown at once while the save runs, so a checkbox never snaps back.
  const [optimistic, setOptimistic] = useState<Filter | null>(null);
  const current = optimistic ?? value;
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <div
      className="filter"
      ref={wrapper}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          button.current?.focus();
        }
      }}
      onBlur={(event) => {
        // Safari doesn't focus clicked checkboxes (relatedTarget is null), so
        // only a focus move to somewhere else closes the menu.
        const next = event.relatedTarget as Node | null;
        if (next && !wrapper.current?.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        className="filter-button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((x) => !x)}
      >
        <span>
          Filter<span className="wide-only">&nbsp;by status</span>
        </span>
        {current.length > 0 && <span className="sr-only">, {current.length} selected</span>}
        <ArrowDownIcon className={"filter-arrow" + (open ? " open" : "")} />
      </button>
      <fieldset id={panelId} className="filter-panel" hidden={!open} aria-busy={busy || undefined}>
        <legend className="sr-only">Show invoices with status</legend>
        {STATUSES.map((status) => (
          <label key={status} className="filter-option">
            <input
              type="checkbox"
              checked={current.includes(status)}
              onChange={async (event) => {
                if (busy || optimistic) return;
                const next = event.target.checked
                  ? STATUSES.filter((s) => s === status || current.includes(s))
                  : current.filter((s) => s !== status);
                setOptimistic(next);
                await onChange(next);
                setOptimistic(null);
              }}
            />
            <span className="checkbox" aria-hidden="true">
              <CheckIcon />
            </span>
            {statusLabel(status)}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
