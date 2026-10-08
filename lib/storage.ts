import { librarySchema, MAX_BYTES, type Library } from "./invoices.ts";
export const STORAGE_KEY = "invoice-synthetic-demo-v1";
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
        "Storage is unavailable. Keep this tab open and download your draft before leaving.",
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
        "Saved data is unreadable. It has not been replaced. Download its backup before resetting.",
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
        "This browser cannot coordinate safe cross-tab saves. Your draft remains available to download.",
    };
  try {
    const next = librarySchema.parse({ ...library, revision });
    const raw = JSON.stringify(next);
    if (size(raw) > MAX_BYTES)
      return {
        kind: "failed",
        message:
          "The saved library would exceed 2 MB. Download this draft and remove older records first.",
      };
    return await exclusive(() => {
      if (port.getItem(STORAGE_KEY) !== expected)
        return {
          kind: "failed",
          message:
            "Another tab changed this library. Your draft is intact. Download it or explicitly reload saved data.",
        };
      port.setItem(STORAGE_KEY, raw);
      return { kind: "saved", snapshot: { library: next, raw } };
    });
  } catch {
    return {
      kind: "failed",
      message:
        "Saving failed or storage is full. Saved data and your current draft remain unchanged.",
    };
  }
}
export function browserExclusive(): Exclusive | null {
  return navigator.locks
    ? (work) => navigator.locks.request("invoice-synthetic-demo-write", work)
    : null;
}
