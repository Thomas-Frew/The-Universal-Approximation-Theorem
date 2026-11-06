import type { LevelSummary } from "@uat/shared";

const BADGES = {
  in_progress: { text: "In progress", className: "border-stone text-taupe" },
  solved: { text: "Solved", className: "border-sage bg-sage text-paper" },
};

type StatusBadgeProps = {
  status: LevelSummary["status"];
  /** The level select's cards use a smaller badge than the level header. */
  size?: "small" | "large";
  /** Play a short flourish, for the moment the level is solved. */
  celebrate?: boolean;
  className?: string;
};

/** A level's status as a pill. New and locked levels have none. */
export function StatusBadge({ status, size = "large", celebrate = false, className = "" }: StatusBadgeProps) {
  if (status === "new" || status === "locked") return null;
  const badge = BADGES[status];
  const sizing = size === "small" ? "px-2 py-0.5 text-[0.625rem]" : "px-3 py-1 text-xs";
  return (
    <span
      // A new key per status remounts the badge, so its flourish plays on change.
      key={status}
      className={`shrink-0 rounded-full border tracking-label whitespace-nowrap uppercase ${sizing} ${badge.className} ${celebrate ? "badge-pop" : ""} ${className}`}
    >
      {badge.text}
    </span>
  );
}
