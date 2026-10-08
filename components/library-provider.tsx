"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { seedLibrary } from "../lib/fixtures.ts";
import {
  browserExclusive,
  readLibrary,
  STORAGE_KEY,
  writeLibrary,
  type Snapshot,
} from "../lib/storage.ts";
import { InvoiceError, type Library } from "../lib/invoices.ts";
import { SITE_NAME } from "../lib/site.ts";
import { Dialog } from "./dialog";
import { LogoIcon, MoonIcon, SunIcon } from "./icons";

type Issue =
  | { kind: "invalid"; raw: string; message: string }
  | { kind: "changed"; message: string }
  | { kind: "notice"; message: string }
  | null;
export type Result = { ok: true } | { ok: false; message: string };
type LibraryContext = {
  library: Library;
  ready: boolean;
  busy: boolean;
  commit: (change: (library: Library) => Library) => Promise<Result>;
  /** A visible confirmation for the page at `path` (after save, paid, delete). */
  flash: Flash | null;
  setFlash: (flash: Flash | null) => void;
};
export type Flash = { text: string; path: string };
const Context = createContext<LibraryContext | null>(null);
const initial: Snapshot = { library: seedLibrary, raw: null };

function downloadText(raw: string, name: string) {
  const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState(initial);
  const ref = useRef(initial);
  const [ready, setReady] = useState(false);
  const [issue, setIssue] = useState<Issue>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [themePending, setThemePending] = useState(false);
  const [noticeError, setNoticeError] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const theme = snapshot.library.theme;
  const [flash, setFlash] = useState<Flash | null>(null);
  const pathname = usePathname();
  // A confirmation belongs to one page; leaving that page clears it.
  const [flashPath, setFlashPath] = useState(pathname);
  if (flashPath !== pathname) {
    setFlashPath(pathname);
    if (flash && flash.path !== pathname) setFlash(null);
  }

  function apply(next: Snapshot) {
    ref.current = next;
    setSnapshot(next);
  }
  function load(): Result {
    try {
      const result = readLibrary(localStorage, seedLibrary);
      if (result.kind === "loaded") {
        apply(result.snapshot);
        setIssue(null);
        return { ok: true };
      }
      setIssue(
        result.kind === "invalid" ? result : { kind: "notice", message: result.message },
      );
      return { ok: false, message: result.message };
    } catch {
      const message = "This browser is blocking storage, so changes can't be saved here.";
      setIssue({ kind: "notice", message });
      return { ok: false, message };
    }
  }
  useEffect(() => {
    let live = true;
    queueMicrotask(() => {
      if (!live) return;
      load();
      setReady(true);
    });
    const changed = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null)
        setIssue({
          kind: "changed",
          message:
            "Another tab changed your invoices. Reload them here before you save again.",
        });
    };
    window.addEventListener("storage", changed);
    return () => {
      live = false;
      window.removeEventListener("storage", changed);
    };
  }, []);
  // The inline script in the layout sets the theme before first paint; keep it
  // in step after the saved library loads or the toggle changes it.
  // Wait for the saved library: before it loads, `theme` is the seed's light
  // theme and would undo the inline script for a moment.
  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme, ready]);

  async function persist(
    change: (library: Library) => Library,
    recovery: boolean,
  ): Promise<Result> {
    if (!ready)
      return { ok: false, message: "Still opening your invoices. Try again in a moment." };
    if (busyRef.current)
      return { ok: false, message: "Another save is still in progress. Try again in a moment." };
    if (issue?.kind === "invalid" && !recovery)
      return {
        ok: false,
        message: "Your saved invoices couldn't be read. Download a backup and reset them first.",
      };
    busyRef.current = true;
    setBusy(true);
    try {
      const next = change(ref.current.library);
      const expected = recovery && issue?.kind === "invalid" ? issue.raw : ref.current.raw;
      const result = await writeLibrary(
        localStorage,
        browserExclusive(),
        expected,
        next,
        crypto.randomUUID(),
      );
      if (result.kind !== "saved") return { ok: false, message: result.message };
      apply(result.snapshot);
      setIssue(null);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        // Only domain errors carry plain language; anything else (a schema
        // failure, say) gets a generic message instead of technical text.
        message:
          error instanceof InvoiceError ? error.message : "Saving failed. Nothing was changed.",
      };
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <Context.Provider
      value={{
        library: snapshot.library,
        ready,
        busy,
        commit: async (change) => {
          const result = await persist(change, false);
          // A later invoice change makes an earlier confirmation stale; callers
          // that confirm this change set their message after this returns. The
          // theme toggle also saves, but leaves the confirmation alone.
          if (result.ok) setFlash(null);
          return result;
        },
        flash,
        setFlash,
      }}
    >
      <div className="app">
        <header className="sidebar">
          <Link className="logo" href="/">
            <LogoIcon className="logo-mark" />
            <span className="sr-only">{SITE_NAME}: all invoices</span>
          </Link>
          <div className="sidebar-tools">
            <button
              type="button"
              className="theme-toggle"
              aria-busy={themePending || undefined}
              onClick={async () => {
                // Busy, not disabled: focus stays here and repeats are ignored.
                if (!ready || busyRef.current) return;
                setThemePending(true);
                const result = await persist(
                  (current) => ({
                    ...current,
                    theme: current.theme === "light" ? "dark" : "light",
                  }),
                  false,
                );
                setThemePending(false);
                setNoticeError(result.ok ? "" : result.message);
              }}
            >
              <span className="sr-only">
                {theme === "light" ? "Use dark theme" : "Use light theme"}
              </span>
              {theme === "light" ? <MoonIcon /> : <SunIcon />}
            </button>
            <span className="sidebar-divider" aria-hidden="true" />
            {/* eslint-disable-next-line @next/next/no-img-element -- 40 px decorative starter avatar */}
            <img className="avatar" src="/image-avatar.jpg" alt="" width={40} height={40} />
          </div>
        </header>
        <div className="app-main">
          {(issue || noticeError) && (
            <section className="notice" role="alert" aria-label="Storage notice">
              <p>{noticeError || issue?.message}</p>
              <div className="notice-actions">
                {issue?.kind === "invalid" && (
                  <>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => downloadText(issue.raw, "invoices-backup.json")}
                    >
                      Download backup
                    </button>
                    <button
                      type="button"
                      className="button danger"
                      onClick={() => setResetOpen(true)}
                    >
                      Reset saved invoices
                    </button>
                  </>
                )}
                {issue?.kind === "changed" && (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => {
                      if (busyRef.current) return;
                      const result = load();
                      setNoticeError(result.ok ? "" : result.message);
                    }}
                  >
                    Reload saved invoices
                  </button>
                )}
                {noticeError && !issue && (
                  <button type="button" className="button secondary" onClick={() => setNoticeError("")}>
                    Dismiss
                  </button>
                )}
              </div>
            </section>
          )}
          {children}
        </div>
      </div>
      {resetOpen && issue?.kind === "invalid" && (
        <Dialog
          title="Reset saved invoices?"
          busy={resetting}
          cancel={() => setResetOpen(false)}
        >
          <p className="dialog-text">
            This replaces the unreadable saved data with the sample invoices. Download a
            backup first if you want to keep it. This can&apos;t be undone.
          </p>
          <div className="dialog-actions">
            <button
              type="button"
              autoFocus
              className="button secondary"
              onClick={() => {
                if (!resetting) setResetOpen(false);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button danger"
              aria-busy={resetting || undefined}
              onClick={async () => {
                if (resetting) return;
                setResetting(true);
                const result = await persist(() => seedLibrary, true);
                setResetting(false);
                if (result.ok) {
                  setResetOpen(false);
                  setFlash(null);
                }
                setNoticeError(result.ok ? "" : result.message);
              }}
            >
              {resetting ? "Resetting…" : "Reset"}
            </button>
          </div>
        </Dialog>
      )}
    </Context.Provider>
  );
}
export function useLibrary() {
  const value = useContext(Context);
  if (!value) throw new Error("Invoice screens require LibraryProvider.");
  return value;
}
