"use client";
import type { Ref } from "react";
import { useLibrary } from "./library-provider";

/** Visible, announced confirmation after a save, status change or delete. */
export function FlashMessage({ path, ref }: { path: string; ref?: Ref<HTMLParagraphElement> }) {
  const { flash } = useLibrary();
  return (
    <p role="status" className="flash" tabIndex={-1} ref={ref}>
      {flash && flash.path === path ? flash.text : ""}
    </p>
  );
}
