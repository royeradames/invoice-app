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
        <div className="demo-banner">
          Synthetic invoice demo — saved only in this browser. No payments or
          emails are sent.
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
        {children}
        <footer>
          Fictional GBP records. Official challenge data, designs and typography
          are still pending. No cloud backup or account synchronization.
        </footer>
      </div>
    </Context.Provider>
  );
}
export function useLibrary() {
  const value = useContext(Context);
  if (!value) throw new Error("Invoice screens require LibraryProvider.");
  return value;
}
