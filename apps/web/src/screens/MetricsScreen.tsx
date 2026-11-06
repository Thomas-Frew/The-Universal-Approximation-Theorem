import {
  type DayMetrics,
  daysInRange,
  MAX_METRICS_DAYS,
  METRICS_RANGES,
  type MachineMetrics,
} from "@uat/shared";
import { useState } from "react";
import { HeaderTools, NavButton } from "../components/HeaderTools";
import { Label } from "../components/Label";
import { fetchMetrics } from "../lib/api";
import { toRoman } from "../lib/roman";
import { useRemote } from "../lib/useRemote";

type MetricsScreenProps = {
  onBack: () => void;
  /** Opens the submissions page, filtered to this machine. */
  onOpenSubmissions: (machine: number) => void;
};

/** "2026-11-02" as "2 Nov". Days are UTC, so they are read as UTC too. */
function shortDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Today, as a UTC day: `YYYY-MM-DD`. */
const todayUtc = () => new Date().toISOString().slice(0, 10);

/** The UTC day `count` days before `day`. */
function daysBefore(day: string, count: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - count);
  return date.toISOString().slice(0, 10);
}

type Range = { from: string; to: string };

/** The last `days` days, today included. */
const lastDays = (days: number): Range => ({ from: daysBefore(todayUtc(), days - 1), to: todayUtc() });

/** Why a range cannot be shown, or null if it can. The API checks the same. */
function rangeProblem({ from, to }: Range): string | null {
  if (!from || !to) return "Choose both days.";
  if (from > to) return "The start must not be after the end.";
  if (daysInRange(from, to) > MAX_METRICS_DAYS) return `A range can be at most ${MAX_METRICS_DAYS} days.`;
  return null;
}

const sum = (rows: DayMetrics[], key: keyof Omit<DayMetrics, "day">) =>
  rows.reduce((total, row) => total + row[key], 0);

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col rounded-md border border-stone bg-vellum px-4 py-3">
      <Label>{label}</Label>
      <span className="font-mono text-2xl tabular-nums">{value}</span>
    </div>
  );
}

/**
 * One measure per day, as bars on its own scale. Several of these side by
 * side share the days, never a y-axis: queries and players are not on the
 * same scale, so each gets a chart of its own.
 */
function DayChart({ title, rows, value, noun }: {
  title: string;
  rows: DayMetrics[];
  value: (row: DayMetrics) => number;
  /** For the tooltip: "12 queries". */
  noun: (count: number) => string;
}) {
  const top = Math.max(1, ...rows.map(value));
  return (
    <figure className="rounded-md border border-stone bg-vellum p-4">
      <figcaption className="flex items-baseline justify-between gap-4">
        <span className="italic">{title}</span>
        <span className="font-mono text-xs text-taupe">max {top}</span>
      </figcaption>
      {/* Each column is the full height, so the hover target is bigger than a short bar. */}
      <div className={`mt-3 flex h-28 items-end ${rows.length > 30 ? "gap-px" : "gap-0.5"}`}>
        {rows.map((row) => (
          <div key={row.day} className="group relative flex h-full min-w-0 flex-1 items-end">
            <div
              className="w-full rounded-t-sm bg-walnut transition-opacity group-hover:opacity-80"
              style={{ height: `${(value(row) / top) * 100}%` }}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded bg-ink px-2 py-1 text-xs whitespace-nowrap text-paper group-hover:block">
              {shortDay(row.day)}: {noun(value(row))}
            </span>
            <span className="sr-only">
              {shortDay(row.day)}: {noun(value(row))}.
            </span>
          </div>
        ))}
      </div>
      {/* The baseline, and the first and last days under it. */}
      <div className="mt-1 flex justify-between border-t border-stone pt-1 font-mono text-xs text-taupe">
        <span>{rows[0] && shortDay(rows[0].day)}</span>
        <span>{rows.at(-1) && shortDay(rows.at(-1)!.day)}</span>
      </div>
    </figure>
  );
}

const plural = (singular: string, pluralForm = `${singular}s`) => (count: number) =>
  `${count} ${count === 1 ? singular : pluralForm}`;

/** Columns of the per-machine table: heading, its full name, and the figure. */
const MACHINE_COLUMNS: [string, string, (machine: MachineMetrics) => number][] = [
  ["Players", "Players who queried, ran or submitted", (m) => m.players],
  ["Solves", "First solves in this range", (m) => m.solvers],
  ["Queries", "Queries answered", (m) => m.queries],
  ["Rejected", "Queries the validator turned away", (m) => m.rejected],
  ["Revealed", "Hidden cases revealed by wrong submissions", (m) => m.revealed],
  ["Runs", "Runs", (m) => m.runs],
  ["Run CE", "Runs that did not compile", (m) => m.runs - m.runsCompiled],
  ["AC", "Accepted", (m) => m.submissions.accepted],
  ["WA", "Wrong Answer", (m) => m.submissions.wrong_answer],
  ["RE", "Runtime Error", (m) => m.submissions.runtime_error],
  ["TLE", "Time Limit Exceeded", (m) => m.submissions.time_limit],
  ["CE", "Compilation Error", (m) => m.submissions.compile_error],
  ["Judge", "Judge errors (no verdict, not charged)", (m) => m.submissions.judge_error],
];

/**
 * Admins only (the API refuses anyone else): what players have been doing,
 * between two days the admin picks (or the last 7, 30 or 90). Admins
 * themselves are left out.
 */
export function MetricsScreen({ onBack, onOpenSubmissions }: MetricsScreenProps) {
  // `draft` is what the date fields say; `range` is what is shown, and only
  // follows the fields while they make sense, so a half-edited range never
  // fetches.
  const [draft, setDraft] = useState<Range>(() => lastDays(METRICS_RANGES[0]));
  const [range, setRange] = useState<Range>(draft);
  const choose = (next: Range) => {
    setDraft(next);
    if (!rangeProblem(next)) setRange(next);
  };
  const problem = rangeProblem(draft);
  const report = useRemote(() => fetchMetrics(range.from, range.to), `${range.from}/${range.to}`);
  // Monospaced, so a numeral of n letters is n ch wide (XXVIII is wider than XXIX).
  const numeralWidth =
    report.status === "ready"
      ? `${Math.max(1, ...report.machines.map((machine) => toRoman(machine.number).length))}ch`
      : undefined;

  return (
    <main className="mx-auto min-h-dvh max-w-[min(104rem,94vw)] py-10 [view-transition-name:metrics]">
      {/* The same header grid as the other pages. */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-8 border-b border-stone pb-4">
        <div className="col-span-2 row-start-2 lg:col-span-1 lg:row-start-1">
          <Label>Admin</Label>
        </div>
        <h1 className="col-span-2 row-start-3 text-4xl font-bold lg:col-span-1 lg:row-start-2">Metrics</h1>
        <div className="col-span-2 row-start-1 mb-4 flex items-center gap-3 lg:col-span-1 lg:col-start-2 lg:row-span-2 lg:mb-0 lg:self-end">
          <HeaderTools />
          <NavButton onClick={onBack}>Back</NavButton>
        </div>
      </header>

      {/* The one filter, above everything it changes: two days, and shortcuts that fill them in. */}
      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Shortcuts">
          {METRICS_RANGES.map((days) => {
            const shortcut = lastDays(days);
            const pressed = draft.from === shortcut.from && draft.to === shortcut.to;
            return (
              <button
                key={days}
                type="button"
                aria-pressed={pressed}
                onClick={() => choose(shortcut)}
                className={`cursor-pointer rounded-md border px-3 py-1.5 text-xs tracking-label uppercase outline-offset-2 outline-walnut focus-visible:outline-2 ${
                  pressed ? "border-walnut bg-walnut text-paper" : "border-stone bg-paper hover:bg-linen"
                }`}
              >
                Last {days} days
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2">
            <Label>From</Label>
            <input
              type="date"
              value={draft.from}
              max={todayUtc()}
              onChange={(event) => choose({ ...draft, from: event.target.value })}
              className="rounded-md border border-stone bg-paper px-2 py-1 font-mono text-sm outline-offset-2 outline-walnut focus-visible:outline-2"
            />
          </label>
          <label className="flex items-center gap-2">
            <Label>To</Label>
            <input
              type="date"
              value={draft.to}
              max={todayUtc()}
              onChange={(event) => choose({ ...draft, to: event.target.value })}
              className="rounded-md border border-stone bg-paper px-2 py-1 font-mono text-sm outline-offset-2 outline-walnut focus-visible:outline-2"
            />
          </label>
        </div>
        <span className="text-xs text-taupe italic">
          {plural("day")(daysInRange(range.from, range.to))}, UTC, both ends included. Admins are left out.
        </span>
      </div>
      {problem && (
        <p role="alert" className="mt-2 text-sm text-oxblood">
          {problem} Still showing {shortDay(range.from)} to {shortDay(range.to)}.
        </p>
      )}

      {report.status === "loading" && <p className="mt-8 text-taupe italic">Fetching…</p>}
      {report.status === "error" && (
        <p role="alert" className="mt-8 text-oxblood">
          The metrics could not be fetched. {report.message}
        </p>
      )}
      {report.status === "ready" && (
        <>
          <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Tile label="Visitors" value={String(sum(report.daily, "visitors"))} />
            <Tile label="Queries" value={String(sum(report.daily, "queries"))} />
            <Tile label="Runs" value={String(sum(report.daily, "runs"))} />
            <Tile label="Submissions" value={String(sum(report.daily, "submissions"))} />
            <Tile label="Accepted" value={String(sum(report.daily, "accepted"))} />
            <Tile
              label="AC rate"
              value={
                sum(report.daily, "submissions") === 0
                  ? "–"
                  : `${Math.round((100 * sum(report.daily, "accepted")) / sum(report.daily, "submissions"))}%`
              }
            />
          </section>

          <section className="mt-10">
            <h2 className="text-xl italic">Per Day</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <DayChart title="Active Players" rows={report.daily} value={(d) => d.activePlayers} noun={plural("player")} />
              <DayChart title="Visitors" rows={report.daily} value={(d) => d.visitors} noun={plural("visitor")} />
              <DayChart title="Queries" rows={report.daily} value={(d) => d.queries} noun={plural("query", "queries")} />
              <DayChart title="Runs" rows={report.daily} value={(d) => d.runs} noun={plural("run")} />
              <DayChart title="Submissions" rows={report.daily} value={(d) => d.submissions} noun={plural("submission")} />
              <DayChart title="Accepted" rows={report.daily} value={(d) => d.accepted} noun={plural("accepted submission")} />
            </div>
            {/* The same figures as a table, for reading exact values. */}
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-taupe">Show as a table</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full font-mono text-sm tabular-nums">
                  <thead>
                    <tr className="text-right">
                      {["Day", "Active", "Visitors", "Queries", "Runs", "Submissions", "Accepted"].map((heading) => (
                        <th key={heading} className="px-2 py-1 font-display font-normal first:text-left">
                          <Label>{heading}</Label>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...report.daily].reverse().map((row) => (
                      <tr key={row.day} className="border-t border-stone text-right">
                        <td className="px-2 py-1 text-left">{shortDay(row.day)}</td>
                        <td className="px-2 py-1">{row.activePlayers}</td>
                        <td className="px-2 py-1">{row.visitors}</td>
                        <td className="px-2 py-1">{row.queries}</td>
                        <td className="px-2 py-1">{row.runs}</td>
                        <td className="px-2 py-1">{row.submissions}</td>
                        <td className="px-2 py-1">{row.accepted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>

          <section className="mt-10">
            <h2 className="text-xl italic">Per Machine</h2>
            <p className="mt-1 text-sm text-taupe">
              Every version of each machine. Hover a heading for its full name; click a machine for its submissions.
            </p>
            {/* Wide, so it scrolls sideways within itself on a phone, never the page. */}
            <div className="mt-4 overflow-x-auto rounded-md border border-stone bg-vellum">
              {/* Fixed layout: the machine column has its width, and every
                  figure column shares the rest equally. The minimum keeps each
                  wide enough for its heading; below it, the box scrolls. */}
              <table className="w-full min-w-[104rem] table-fixed text-sm">
                <colgroup>
                  <col className="w-[32rem]" />
                  {MACHINE_COLUMNS.map(([heading]) => (
                    <col key={heading} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left font-normal">
                      <Label>Machine</Label>
                    </th>
                    {MACHINE_COLUMNS.map(([heading, full]) => (
                      <th key={heading} className="px-3 py-2 text-right font-normal">
                        <abbr title={full} className="no-underline">
                          <Label>{heading}</Label>
                        </abbr>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.machines.map((machine) => (
                    <tr key={machine.number} className="border-t border-stone">
                      <td className="px-4 py-2">
                        {/* Numerals in a column as wide as the longest, so titles line up (as on the admin page). */}
                        <span className="flex min-w-0 items-baseline gap-2">
                          <span className="shrink-0 font-mono text-xs text-taupe" style={{ width: numeralWidth }}>
                            {toRoman(machine.number)}
                          </span>
                          <button
                            type="button"
                            onClick={() => onOpenSubmissions(machine.number)}
                            className="cursor-pointer truncate text-left italic underline decoration-stone decoration-dotted underline-offset-2 outline-offset-2 outline-walnut hover:decoration-solid focus-visible:outline-2"
                          >
                            {machine.title}
                          </button>
                        </span>
                      </td>
                      {MACHINE_COLUMNS.map(([heading, , figure]) => (
                        <td key={heading} className="px-3 py-2 text-right font-mono tabular-nums">
                          {figure(machine)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
