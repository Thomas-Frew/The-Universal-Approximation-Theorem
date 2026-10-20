import type { ReactNode } from "react";

/** Small uppercase caption, used for table headings and counters. */
export function Label({ children, className = "tracking-label" }: { children: ReactNode; className?: string }) {
  return <span className={`text-xs text-taupe uppercase ${className}`}>{children}</span>;
}
