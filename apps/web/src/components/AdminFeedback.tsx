import type { AdminGameEntry, AdminLevelEntry, AdminLevelFeedback } from "@uat/shared";
import { type ReactNode, useState } from "react";
import { fetchAdminFeedback } from "../lib/api";
import { useRemote } from "../lib/useRemote";
import { Label } from "./Label";

/**
 * Admin views of player feedback: the pieces shared by the admin card on a
 * level screen and the admin page. Only admins see these, and the API checks
 * that again on every request.
 */

/** 12 Oct 2026, 14:05 */
const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** A mean to one decimal, or a dash when there is nothing to average. */
export const formatMean = (value: number | null) => (value === null ? "–" : value.toFixed(1));

/** One rating as a small labelled figure; nothing when it was left out. */
function Rating({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  return (
    <span className="whitespace-nowrap">
      <span className="text-taupe">{label}</span> <span className="font-mono text-ink">{value}</span>
    </span>
  );
}

/** Who and when, above each entry. */
function EntryHeader({ player, at, children }: { player: string; at: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-taupe">
      <span className="font-mono">#{player}</span>
      {children}
      <span className="ml-auto">{formatWhen(at)}</span>
    </div>
  );
}

const pill = "rounded-full border px-2 py-0.5 text-[0.65rem] tracking-label uppercase";

export function LevelEntries({ entries }: { entries: AdminLevelEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-taupe italic">No feedback yet.</p>;
  return (
    <ul className="flex flex-col divide-y divide-stone">
      {entries.map((entry) => (
        <li key={`${entry.player}-${entry.version}`} className={`py-3 first:pt-0 last:pb-0 ${entry.current ? "" : "opacity-60"}`}>
          <EntryHeader player={entry.player} at={entry.at}>
            <span className={`${pill} ${entry.solved ? "border-sage text-sage" : "border-stone"}`}>
              {entry.solved ? "Solved" : "Unsolved"}
            </span>
            {!entry.current && <span className={`${pill} border-stone`}>Version {entry.version}</span>}
          </EntryHeader>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Rating label="Overall" value={entry.overall} />
            <Rating label="Working out" value={entry.understanding} />
            <Rating label="Code" value={entry.implementation} />
          </div>
          {entry.comment && <p className="mt-1.5 text-sm whitespace-pre-wrap">{entry.comment}</p>}
        </li>
      ))}
    </ul>
  );
}

export function GameEntries({ entries }: { entries: AdminGameEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-taupe italic">No feedback yet.</p>;
  return (
    <ul className="flex flex-col divide-y divide-stone">
      {entries.map((entry, index) => (
        <li key={index} className="py-3 first:pt-0 last:pb-0">
          <EntryHeader player={entry.player} at={entry.at} />
          {entry.overall !== null && (
            <div className="mt-1.5 text-sm">
              <Rating label="Overall" value={entry.overall} />
            </div>
          )}
          {entry.comment && <p className="mt-1.5 text-sm whitespace-pre-wrap">{entry.comment}</p>}
        </li>
      ))}
    </ul>
  );
}

/** The three means for a level's current version, as small labelled figures. */
export function LevelMeans({ level }: { level: AdminLevelFeedback }) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2">
      {(
        [
          ["Overall", level.means.overall],
          ["Working out", level.means.understanding],
          ["Code", level.means.implementation],
        ] as const
      ).map(([label, value]) => (
        <div key={label} className="flex flex-col">
          <Label>{label}</Label>
          <span className="font-mono text-2xl">{formatMean(value)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * The admin card on a level screen: this machine's feedback from every
 * player, collapsed to a count until opened.
 */
export function AdminLevelFeedbackCard({ levelNumber }: { levelNumber: number }) {
  const [open, setOpen] = useState(false);
  const report = useRemote(fetchAdminFeedback, levelNumber);
  const level = report.status === "ready" ? report.levels.find((item) => item.number === levelNumber) : undefined;
  const current = level?.entries.filter((entry) => entry.current).length ?? 0;

  return (
    // Dashed brass: visibly not part of the game players see.
    <section className="rounded-md border border-dashed border-brass bg-vellum">
      <h2>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-md p-6 text-left outline-offset-4 outline-walnut focus-visible:outline-2"
        >
          <span>
            <span className="block text-xl italic">Player Feedback</span>
            <span className="mt-1 block text-sm text-taupe">
              Admin only.{" "}
              {report.status === "loading"
                ? "Counting…"
                : report.status === "error"
                  ? report.message
                  : `${current} on this version${level && level.entries.length > current ? `, ${level.entries.length - current} older` : ""}.`}
            </span>
          </span>
          <svg
            viewBox="0 0 20 20"
            className={`size-5 shrink-0 text-taupe transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 8l5 5 5-5" />
          </svg>
        </button>
      </h2>
      {open && level && (
        <div className="flex flex-col gap-5 px-6 pb-6">
          <LevelMeans level={level} />
          <LevelEntries entries={level.entries} />
        </div>
      )}
    </section>
  );
}
