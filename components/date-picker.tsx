"use client";
import { useEffect, useId, useRef, useState } from "react";
import { displayDate, isCalendarDate, isoDate, MONTHS } from "../lib/invoices.ts";
import { ArrowLeftIcon, ArrowRightIcon, CalendarIcon } from "./icons";

const FULL_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
function parts(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m: m - 1, d };
}
function ymd(y: number, m: number, d: number) {
  return isoDate(new Date(y, m, d));
}
function daysIn(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

/**
 * Button plus calendar popover that shows "21 Aug 2021" in every locale, as in
 * the design. Arrow keys move by day or week, Page Up/Down by month, Escape closes.
 */
export function DatePicker({
  id,
  labelId,
  value,
  invalid,
  describedBy,
  onChange,
}: {
  id: string;
  labelId: string;
  value: string;
  invalid: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const fallback = isCalendarDate(value) ? value : isoDate(new Date());
  const [focusDate, setFocusDate] = useState(fallback);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const popId = useId();
  const { y, m } = parts(focusDate);
  // Move focus into the grid only when the calendar opens or a key moves the
  // day; the month buttons keep their own focus.
  const focusGrid = useRef(false);
  useEffect(() => {
    if (!open || !focusGrid.current) return;
    focusGrid.current = false;
    grid.current
      ?.querySelector<HTMLButtonElement>(`[data-date="${focusDate}"]`)
      ?.focus();
  }, [open, focusDate]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  function move(date: string, days: number, months = 0) {
    const p = parts(date);
    if (months) {
      const target = new Date(p.y, p.m + months, 1);
      const day = Math.min(p.d, daysIn(target.getFullYear(), target.getMonth()));
      return ymd(target.getFullYear(), target.getMonth(), day);
    }
    return ymd(p.y, p.m, p.d + days);
  }
  function close() {
    setOpen(false);
    button.current?.focus();
  }
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  const total = daysIn(y, m);
  return (
    <div
      className="date-picker"
      ref={wrapper}
      onBlur={(event) => {
        // Safari leaves relatedTarget null on clicks, so only a real focus
        // move elsewhere closes the calendar.
        const next = event.relatedTarget as Node | null;
        if (open && next && !wrapper.current?.contains(next)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          // Close only the calendar, not the drawer around it.
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={button}
        id={id}
        type="button"
        className={"input date-button" + (invalid ? " invalid" : "")}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popId}
        aria-labelledby={labelId + " " + id}
        aria-describedby={describedBy}
        onClick={() => {
          setFocusDate(isCalendarDate(value) ? value : isoDate(new Date()));
          focusGrid.current = !open;
          setOpen((x) => !x);
        }}
      >
        <span>{isCalendarDate(value) ? displayDate(value) : "Select a date"}</span>
        <CalendarIcon />
      </button>
      {open && (
        <div id={popId} className="calendar" role="dialog" aria-label="Choose invoice date">
          <div className="calendar-head">
            <button
              type="button"
              className="calendar-nav"
              onClick={() => setFocusDate(move(focusDate, 0, -1))}
            >
              <ArrowLeftIcon />
              <span className="sr-only">Previous month</span>
            </button>
            <p className="calendar-month" aria-live="polite">
              {MONTHS[m]} {y}
            </p>
            <button
              type="button"
              className="calendar-nav"
              onClick={() => setFocusDate(move(focusDate, 0, 1))}
            >
              <ArrowRightIcon />
              <span className="sr-only">Next month</span>
            </button>
          </div>
          <div className="calendar-weekdays" aria-hidden="true">
            {DAYS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div
            className="calendar-grid"
            ref={grid}
            onKeyDown={(event) => {
              const step: Record<string, [number, number]> = {
                ArrowLeft: [-1, 0],
                ArrowRight: [1, 0],
                ArrowUp: [-7, 0],
                ArrowDown: [7, 0],
                PageUp: [0, -1],
                PageDown: [0, 1],
              };
              const p = parts(focusDate);
              const weekday = (new Date(p.y, p.m, p.d).getDay() + 6) % 7;
              // Home and End go to the start and end of the week (Monday-Sunday).
              const s =
                event.key === "Home"
                  ? ([-weekday, 0] as [number, number])
                  : event.key === "End"
                    ? ([6 - weekday, 0] as [number, number])
                    : step[event.key];
              if (!s) return;
              event.preventDefault();
              focusGrid.current = true;
              setFocusDate(move(focusDate, s[0], s[1]));
            }}
          >
            {Array.from({ length: lead }, (_, i) => (
              <span key={"lead" + i} aria-hidden="true" />
            ))}
            {Array.from({ length: total }, (_, i) => {
              const date = ymd(y, m, i + 1);
              const selected = date === value;
              return (
                <button
                  key={date}
                  type="button"
                  data-date={date}
                  className={"calendar-day" + (selected ? " selected" : "")}
                  tabIndex={date === focusDate ? 0 : -1}
                  aria-pressed={selected}
                  aria-label={i + 1 + " " + FULL_MONTHS[m] + " " + y}
                  onClick={() => {
                    onChange(date);
                    close();
                  }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
