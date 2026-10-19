import type { ReactNode } from "react";

/** Small uppercase caption, used for table headings and counters. */
export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs tracking-label text-taupe uppercase">{children}</span>
  );
}
