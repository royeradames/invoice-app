import { librarySchema, MAX_BYTES, type Library } from "./invoices.ts";
// v2 follows the official data shape (split addresses, AA0000 IDs). v1 data is
// left untouched under its own key; it is not migrated.
export const STORAGE_KEY = "invoice-app-v2";
export type Snapshot = { library: Library; raw: string | null };
export type ReadResult =
  | { kind: "loaded"; snapshot: Snapshot }
  | { kind: "invalid"; raw: string; message: string }
  | { kind: "unavailable"; message: string };
export type WriteResult =
  | { kind: "saved"; snapshot: Snapshot }
  | { kind: "failed"; message: string };
export type Port = Pick<Storage, "getItem" | "setItem">;
export type Exclusive = <T>(work: () => T) => Promise<T>;
const size = (value: string) => new TextEncoder().encode(value).length;
export function readLibrary(port: Port, fallback: Library): ReadResult {
  let raw: string | null;
  try {
    raw = port.getItem(STORAGE_KEY);
  } catch {
    return {
      kind: "unavailable",
      message:
        "This browser is blocking storage, so changes can't be saved here.",
    };
  }
  if (raw === null)
    return { kind: "loaded", snapshot: { library: fallback, raw } };
  try {
    if (size(raw) > MAX_BYTES) throw new Error("Too large");
    const input: unknown = JSON.parse(raw);
    return {
      kind: "loaded",
      snapshot: { library: librarySchema.parse(input), raw },
    };
  } catch {
    return {
      kind: "invalid",
      raw,
      message:
        "Your saved invoices couldn't be read. They haven't been replaced. Download a backup before you reset them.",
    };
  }
}
export async function writeLibrary(
  port: Port,
  exclusive: Exclusive | null,
  expected: string | null,
  library: Library,
  revision: string,
): Promise<WriteResult> {
  if (!exclusive)
    return {
      kind: "failed",
      message:
        "This browser can't save safely across tabs, so nothing was saved. Your changes are still on screen.",
    };
  try {
    const next = librarySchema.parse({ ...library, revision });
    const raw = JSON.stringify(next);
    if (size(raw) > MAX_BYTES)
      return {
        kind: "failed",
        message:
          "Saving would go over the 2 MB limit. Delete an older invoice first.",
      };
    return await exclusive(() => {
      if (port.getItem(STORAGE_KEY) !== expected)
        return {
          kind: "failed",
          message:
            "Another tab changed your invoices, so nothing was saved. Your changes are still on screen. Reload saved invoices, then try again.",
        };
      port.setItem(STORAGE_KEY, raw);
      return { kind: "saved", snapshot: { library: next, raw } };
    });
  } catch {
    return {
      kind: "failed",
      message:
        "Saving failed, possibly because storage is full. Nothing was changed.",
    };
  }
}
export function browserExclusive(): Exclusive | null {
  return navigator.locks
    ? (work) => navigator.locks.request("invoice-app-v2-write", work)
    : null;
}
