"use client";
import { useLibrary } from "./library-provider";

/** Visible, announced confirmation after a save, status change or delete. */
export function FlashMessage({ path }: { path: string }) {
  const { flash } = useLibrary();
  return (
    <p role="status" className="flash">
      {flash && flash.path === path ? flash.text : ""}
    </p>
  );
}
