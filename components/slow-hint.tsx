"use client";
import { useEffect, useState } from "react";

/**
 * Shown when a save is still running after about 3 seconds, which happens when
 * another tab holds the storage lock. Polite live region, normal flow.
 */
export function SlowHint({ active, text }: { active: boolean; text: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setSlow(true), 3000);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [active]);
  return (
    <p className="slow-hint" role="status">
      {active && slow ? text : ""}
    </p>
  );
}
