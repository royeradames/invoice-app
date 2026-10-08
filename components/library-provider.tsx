"use client";
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
import type { Library } from "../lib/invoices.ts";
import { SITE_NAME } from "../lib/site.ts";

type Issue =
  | { kind: "invalid"; raw: string; message: string }
  | { kind: "notice"; message: string }
  | null;
type Result = { ok: true } | { ok: false; message: string };
type LibraryContext = {
  library: Library;
  ready: boolean;
  busy: boolean;
  issue: Issue;
  generation: number;
  commit: (change: (library: Library) => Library) => Promise<Result>;
  reload: () => Result;
  reset: () => Promise<Result>;
};
const Context = createContext<LibraryContext | null>(null);
const initial: Snapshot = { library: seedLibrary, raw: null };
export function downloadJson(value: unknown, name: string) {
  const raw =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const url = URL.createObjectURL(
    new Blob([raw], { type: "application/json" }),
  );
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
  const [generation, setGeneration] = useState(0);
  const [themePending, setThemePending] = useState(false);
  const [themeError, setThemeError] = useState("");
  function apply(next: Snapshot) {
    ref.current = next;
    setSnapshot(next);
    setIssue(null);
  }
  useEffect(() => {
    let live = true;
    queueMicrotask(() => {
      if (!live) return;
      try {
        const result = readLibrary(localStorage, seedLibrary);
        if (result.kind === "loaded") {
          ref.current = result.snapshot;
          setSnapshot(result.snapshot);
        } else
          setIssue(
            result.kind === "invalid"
              ? result
              : { kind: "notice", message: result.message },
          );
      } catch {
        setIssue({
          kind: "notice",
          message:
            "Storage is unavailable. This session can edit and download synthetic drafts.",
        });
      }
      setReady(true);
    });
    const changed = (event: StorageEvent) => {
      try {
        if (
          event.storageArea === localStorage &&
          (event.key === STORAGE_KEY || event.key === null)
        )
          setIssue({
            kind: "notice",
            message:
              "Another tab changed saved invoices. Your working draft is intact. Reload explicitly or download it before leaving.",
          });
      } catch {
        setIssue({
          kind: "notice",
          message:
            "Storage is unavailable. Your working draft has not been replaced.",
        });
      }
    };
    window.addEventListener("storage", changed);
    return () => {
      live = false;
      window.removeEventListener("storage", changed);
    };
  }, []);
  async function persist(
    change: (library: Library) => Library,
    recovery: boolean,
  ): Promise<Result> {
    if (!ready || busyRef.current)
      return {
        ok: false,
        message: "A storage operation is already in progress.",
      };
    if (issue?.kind === "invalid" && !recovery)
      return {
        ok: false,
        message:
          "Download the unreadable backup, then explicitly reset or reload saved invoices first.",
      };
    if (recovery && issue?.kind !== "invalid")
      return {
        ok: false,
        message:
          "Unreadable data is no longer selected. Reload before trying again.",
      };
    busyRef.current = true;
    setBusy(true);
    try {
      const next = change(ref.current.library);
      const expected =
        recovery && issue?.kind === "invalid" ? issue.raw : ref.current.raw;
      const result = await writeLibrary(
        localStorage,
        browserExclusive(),
        expected,
        next,
        crypto.randomUUID(),
      );
      // Every caller shows this message beside its own control; a second,
      // global alert would announce the same failure twice.
      if (result.kind !== "saved")
        return { ok: false, message: result.message };
      apply(result.snapshot);
      if (recovery) setGeneration((x) => x + 1);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Saving failed. Your draft remains here.",
      };
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function reload(): Result {
    if (busyRef.current)
      return {
        ok: false,
        message: "Wait for the current save before reloading.",
      };
    try {
      const result = readLibrary(localStorage, seedLibrary);
      if (result.kind !== "loaded") {
        setIssue(
          result.kind === "invalid"
            ? result
            : { kind: "notice", message: result.message },
        );
        return { ok: false, message: result.message };
      }
      apply(result.snapshot);
      setGeneration((x) => x + 1);
      return { ok: true };
    } catch {
      return {
        ok: false,
        message: "Storage is unavailable. Your draft has not been replaced.",
      };
    }
  }
  return (
    <Context.Provider
      value={{
        library: snapshot.library,
        ready,
        busy,
        issue,
        generation,
        commit: (change) => persist(change, false),
        reload,
        reset: () => persist(() => seedLibrary, true),
      }}
    >
      <div className="app" data-theme={snapshot.library.theme}>
        <aside className="sidebar">
          <a className="logo" href="/" aria-label={SITE_NAME + " home"}>
            <svg
              aria-hidden="true"
              width="28"
              height="26"
              viewBox="0 0 28 26"
            >
              <path
                fill="#fff"
                fillRule="evenodd"
                d="M20.513 0C24.965 2.309 28 6.91 28 12.21 28 19.826 21.732 26 14 26S0 19.826 0 12.21C0 6.91 3.035 2.309 7.487 0L14 12.9z"
              />
            </svg>
          </a>
          <button
            className="theme-toggle"
            aria-busy={themePending || undefined}
            onClick={async () => {
              // Busy, not disabled: keep focus here and ignore repeats.
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
              setThemeError(result.ok ? "" : result.message);
            }}
          >
            <span className="sr-only">
              Use {snapshot.library.theme === "light" ? "dark" : "light"} theme
            </span>
            {snapshot.library.theme === "light" ? (
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20">
                <path
                  fill="currentColor"
                  d="M19.502 11.342a.703.703 0 00-.588.128 7.499 7.499 0 01-2.275 1.33 7.123 7.123 0 01-2.581.46A7.516 7.516 0 018.74 11.06a7.516 7.516 0 01-2.198-5.316c0-.87.153-1.713.41-2.48.28-.817.69-1.559 1.226-2.197a.652.652 0 00-.102-.92.703.703 0 00-.588-.128C5.316.607 3.425 1.91 2.07 3.649A10.082 10.082 0 000 9.783C0 12.57 1.125 15.1 2.965 16.94a10.04 10.04 0 007.156 2.965c2.352 0 4.524-.818 6.262-2.173a10.078 10.078 0 003.579-5.597.62.62 0 00-.46-.793z"
                />
              </svg>
            ) : (
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20">
                <path
                  fill="currentColor"
                  d="M9.817 16.18a.96.96 0 01.953.848l.007.112v1.535a.96.96 0 01-1.913.112l-.006-.112V17.14c0-.53.43-.96.96-.96zm-4.5-1.863c.347.346.373.89.08 1.266l-.08.09-1.085 1.087a.96.96 0 01-1.437-1.267l.08-.09 1.086-1.086a.959.959 0 011.357 0zm10.356 0l1.086 1.086a.959.959 0 11-1.357 1.357l-1.085-1.086a.959.959 0 111.356-1.357zM9.817 4.9a4.924 4.924 0 014.918 4.918 4.924 4.924 0 01-4.918 4.918A4.924 4.924 0 014.9 9.818 4.924 4.924 0 019.817 4.9zm8.858 3.958a.96.96 0 110 1.919H17.14a.96.96 0 110-1.92h1.535zm-16.18 0a.96.96 0 01.112 1.912l-.112.007H.96a.96.96 0 01-.112-1.913l.112-.006h1.534zm14.264-5.983a.96.96 0 010 1.357l-1.086 1.086a.96.96 0 11-1.356-1.357l1.085-1.086a.96.96 0 011.357 0zm-12.617-.08l.09.08 1.086 1.086A.96.96 0 014.05 5.398l-.09-.08-1.086-1.086a.959.959 0 011.267-1.436zM9.817 0c.53 0 .96.43.96.96v1.535a.96.96 0 01-1.92 0V.96c0-.53.43-.96.96-.96z"
                />
              </svg>
            )}
          </button>
        </aside>
        <div className="app-main">
          <div className="demo-banner">
            <strong>{SITE_NAME}</strong> — synthetic records saved only in this
            browser. No payments or emails are sent.
          </div>
          {issue && (
            <section role="alert" className="notice">
              <p>{issue.message}</p>
              {issue.kind === "invalid" && (
                <button
                  onClick={() =>
                    downloadJson(issue.raw, "invoice-unreadable-backup.json")
                  }
                >
                  Download unreadable backup
                </button>
              )}
            </section>
          )}
          {themeError && (
            <p role="alert" className="notice">
              {themeError}
            </p>
          )}
          {children}
          <footer>
            Fictional GBP records, not the official challenge data. No cloud
            backup or account synchronization.
          </footer>
        </div>
      </div>
    </Context.Provider>
  );
}
export function useLibrary() {
  const value = useContext(Context);
  if (!value) throw new Error("Invoice screens require LibraryProvider.");
  return value;
}
