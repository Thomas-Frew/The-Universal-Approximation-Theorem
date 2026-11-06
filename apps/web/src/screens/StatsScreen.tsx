import {
  type FirstSolverRow,
  SCOREBOARD_PAGE_SIZE,
  type ScoreboardResponse,
  type ScoreboardRow,
  type SolverRow,
  type StatsResponse,
} from "@uat/shared";
import { type CSSProperties, type ReactNode, useRef, useState } from "react";
import { HeaderTools, NavButton } from "../components/HeaderTools";
import { MachineChart } from "../components/MachineChart";
import { RenameAlias } from "../components/RenameAlias";
import { Label } from "../components/Label";
import { useIsAdmin } from "../lib/admin";
import { fetchScoreboard, fetchSolvers, fetchStats, renameAlias, saveAlias } from "../lib/api";
import { toRoman } from "../lib/roman";
import { useRemote } from "../lib/useRemote";

type StatsScreenProps = {
  onBack: () => void;
};

const buttonBase =
  "cursor-pointer rounded-md border border-stone bg-paper px-4 py-2 text-xs tracking-label uppercase outline-offset-4 outline-walnut hover:bg-linen focus-visible:outline-2 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-paper";

/** 45 s, 12 m 30 s, 1 h 5 m 0 s: hours only once there are any, seconds always. */
function formatDuration(seconds: number): string {
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const rest = rounded % 60;
  if (hours > 0) return `${hours} h ${minutes} m ${rest} s`;
  if (minutes > 0) return `${minutes} m ${rest} s`;
  return `${rest} s`;
}

const percent = (rate: number | null) => (rate === null ? "–" : `${Math.round(rate * 100)}%`);

/** A big number with its label, and an optional note beneath. */
/**
 * One headline figure. `gold` once every machine is solved: the figures can no
 * longer change, so the tile is dressed like the First Solves card, a brass
 * border with its slow glint.
 */
function Tile({ label, value, note, gold = false }: { label: string; value: string; note?: string; gold?: boolean }) {
  return (
    // A size container (`@container`), so the value can be sized to the
    // tile's width with `cqi` (1cqi is 1% of it).
    <div
      className={`@container flex flex-col rounded-md border p-5 ${gold ? "shine border-brass" : "border-stone"} bg-vellum`}
    >
      <Label>{label}</Label>
      {/* As large as text-3xl (text-4xl on very wide screens), but never wider
          than the tile: IBM Plex Mono gives every character 0.6em, so a value
          of n characters fits at 100cqi / (n × 0.6). A long duration such as
          "1 h 13 m 30 s" shrinks to fit; short numbers keep the full size.
          The line height stays that of the full size (text-3xl's and
          text-4xl's), so a shrunk value sits on the same line as the others. */}
      <span
        style={{ "--chars": Math.max(value.length, 1) } as CSSProperties}
        className={`mt-2 font-mono leading-[2.25rem] whitespace-nowrap text-[length:min(1.875rem,calc(100cqi/var(--chars)/0.6))] 2xl:leading-[2.5rem] 2xl:text-[length:min(2.25rem,calc(100cqi/var(--chars)/0.6))]`}
      >
        {value}
      </span>
      {note && <span className="mt-1 text-sm text-taupe italic">{note}</span>}
    </div>
  );
}

/** One "most" record: which machine, and how much. */
function Record({ label, record, format }: {
  label: string;
  record: StatsResponse["most"]["penalty"];
  format: (value: number) => string;
}) {
  return (
    <div className="flex flex-col rounded-md border border-stone bg-vellum p-5">
      <Label>{label}</Label>
      {record ? (
        <>
          <span className="mt-2 text-lg italic">{record.title}</span>
          <span className="flex items-baseline justify-between text-sm text-taupe">
            Machine {toRoman(record.number)}
            <span className="font-mono text-2xl text-ink">{format(record.value)}</span>
          </span>
        </>
      ) : (
        <span className="mt-2 text-sm text-taupe italic">Nothing yet.</span>
      )}
    </div>
  );
}

/**
 * Who has the most first solves: every player who was first to solve some
 * machine, with the machines they took. At most one row per machine, so it
 * needs no pages. Plain like the scoreboard. Admins are left off, as from
 * every global figure.
 */
function FirstSolvers({ rows }: { rows: FirstSolverRow[] }) {
  const cell = "px-3 py-2";
  return (
    <div className="overflow-x-auto rounded-md border border-stone bg-vellum p-5">
      {rows.length === 0 ? (
        <p className="text-sm text-taupe italic">Nobody has solved a machine yet.</p>
      ) : (
        <table className="w-full table-fixed text-left">
          <thead>
            <tr className="border-b border-stone">
              <th className={`${cell} w-16`}>
                <Label>Rank</Label>
              </th>
              <th className={cell}>
                <Label>Player</Label>
              </th>
              <th className={`${cell} w-24 text-right`}>
                <Label>Firsts</Label>
              </th>
              <th className={`${cell} hidden w-2/5 sm:table-cell`}>
                <Label>Machines</Label>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <tr
                key={entry.name}
                className={entry.you ? "bg-linen font-semibold" : "border-t border-stone/50"}
              >
                <td className={`${cell} font-mono tabular-nums`}>{entry.rank}</td>
                <td className={cell}>
                  {entry.name}
                  {entry.you && " (you)"}
                </td>
                <td className={`${cell} text-right font-mono tabular-nums`}>{entry.machines.length}</td>
                {/* The machines by numeral; on a phone there is no room, and the count says enough.
                    Always one line, so every row is the same height: a list too long
                    for the column ends in an ellipsis, and hovering shows it all. */}
                <td
                  className={`${cell} hidden truncate font-mono text-xs font-normal text-taupe sm:table-cell`}
                  title={entry.machines.map(toRoman).join(" · ")}
                >
                  {entry.machines.map(toRoman).join(" · ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-xl italic">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** A small brass seal, for first solves. */
function Seal() {
  return (
    <svg viewBox="0 0 20 20" className="size-5 shrink-0 text-brass" aria-hidden="true">
      <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6.5 10.2l2.4 2.4 4.6-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LevelList({ levels, empty, icon }: {
  levels: StatsResponse["flawless"];
  empty: string;
  icon: ReactNode;
}) {
  if (levels.length === 0) return <p className="text-sm text-taupe italic">{empty}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {levels.map((level) => (
        <li key={level.number} className="flex items-center gap-3">
          {icon}
          <Label>Machine {toRoman(level.number)}</Label>
          <span className="italic">{level.title}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * How many first solves are still to be had: machines nobody has solved. A
 * machine has no average until someone counted has solved it, so that is the
 * test. An admin's own solves are not counted in the average, so the machines
 * they solved are left out here too: they cannot be first on those.
 */
function OpenFirstSolves({ machines }: { machines: StatsResponse["machines"] }) {
  const open = machines.filter((machine) => machine.meanPenalty === null && !machine.you?.solved).length;
  return (
    <p className="mt-4 border-t border-stone pt-3 text-sm text-taupe">
      {open === 0
        ? "Every machine has been solved."
        : `${open} ${open === 1 ? "machine has" : "machines have"} not been solved by anyone yet.`}
    </p>
  );
}

/**
 * Everyone with a solve, ranked like a contest: most machines solved, then
 * least penalty on them. A page at a time (`SCOREBOARD_PAGE_SIZE` rows), from
 * `GET /scoreboard`. Your own row is pinned above every page, in bold, so it
 * is always in view; on the page that holds it, it also sits in its place.
 */
function Scoreboard() {
  const [page, setPage] = useState(0);
  // Bumped after a rename (yours, or an admin's of someone), to fetch the page again.
  const [renames, setRenames] = useState(0);
  const board = useRemote(() => fetchScoreboard(page), `${page}-${renames}`);
  const admin = useIsAdmin();
  // Keep the last page on screen, dimmed, while the next one loads, so the
  // table does not collapse to "Counting…" and back on every turn.
  const last = useRef<ScoreboardResponse | null>(null);
  if (board.status === "ready") last.current = board;
  const shown = last.current;

  if (!shown) {
    return (
      <div className="rounded-md border border-stone bg-vellum p-5">
        {board.status === "error" ? (
          <p role="alert" className="text-sm text-oxblood">
            The scoreboard could not be fetched. {board.message}
          </p>
        ) : (
          <p className="text-sm text-taupe italic">Counting…</p>
        )}
      </div>
    );
  }

  const { rows, you, size, pageCount } = shown;
  const renamed = () => setRenames((count) => count + 1);
  const cell = "px-3 py-2";
  const row = (entry: ScoreboardRow, pinned = false) => (
    <tr
      key={`${pinned ? "pinned" : entry.rank}-${entry.name}`}
      className={entry.you ? "bg-linen font-semibold" : "border-t border-stone/50"}
    >
      <td className={`${cell} font-mono tabular-nums`}>{entry.rank}</td>
      <td className={cell}>
        {/* Gold for a player who has solved every machine. */}
        <span className={entry.complete ? "text-gilt" : undefined}>{entry.name}</span>
        {entry.you && " (you)"}
        {entry.admin && <span className="font-normal text-taupe"> (admin)</span>}
        {/* You can rename yourself, on your pinned row (always in view; the
            copy in its place on the page has no button, so there is one form).
            Admins can rename anyone else. */}
        {entry.you
          ? pinned && <RenameAlias name={entry.name} rename={saveAlias} onRenamed={renamed} />
          : admin && (
              <RenameAlias
                name={entry.name}
                rename={(to) => renameAlias(entry.name, to)}
                onRenamed={renamed}
                admin
              />
            )}
      </td>
      <td className={`${cell} text-right font-mono tabular-nums`}>{entry.solved}</td>
      <td className={`${cell} text-right font-mono tabular-nums`}>{entry.penalty}</td>
    </tr>
  );

  return (
    <div className="overflow-x-auto rounded-md border border-stone bg-vellum p-5">
      {/* The table is `table-fixed`: column widths come from the header row
          alone, not from what each page happens to hold, so the columns stay
          put as the pages turn (a 153 on one page would otherwise widen Penalty). */}
      {rows.length === 0 ? (
        <p className="text-sm text-taupe italic">Nobody has solved a machine yet.</p>
      ) : (
        <table className={`w-full table-fixed text-left transition-opacity ${board.status === "loading" ? "opacity-50" : ""}`}>
          <thead>
            <tr className="border-b border-stone">
              <th className={`${cell} w-16`}>
                <Label>Rank</Label>
              </th>
              <th className={cell}>
                <Label>Player</Label>
              </th>
              <th className={`${cell} w-24 text-right`}>
                <Label>Solved</Label>
              </th>
              <th className={`${cell} w-24 text-right`}>
                <Label>Penalty</Label>
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Your row first, whatever the page, set off by a rule. */}
            {you && row(you, true)}
            {you && (
              <tr aria-hidden="true">
                <td colSpan={4} className="h-2 border-b border-stone p-0" />
              </tr>
            )}
            {rows.map((entry) => row(entry))}
            {/* Blank rows fill a short last page, so the table, and the Prev and
                Next buttons under it, stay put from page to page. */}
            {Array.from({ length: SCOREBOARD_PAGE_SIZE - rows.length }, (_, index) => (
              <tr key={`blank-${index}`} aria-hidden="true" className="border-t border-stone/50">
                <td colSpan={4} className={cell}>
                  &nbsp;
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pageCount > 1 && (
        <nav className="mt-4 flex items-center justify-center gap-3 sm:gap-6" aria-label="Scoreboard pages">
          <button
            type="button"
            onClick={() => setPage(shown.page - 1)}
            disabled={shown.page === 0}
            className={buttonBase}
          >
            Prev
          </button>
          {/* A fixed-width slot for the page number, as on the level select,
              so the label does not shift as the digits change. */}
          <Label className="tracking-label whitespace-nowrap tabular-nums">
            Page{" "}
            <span className="inline-block text-center" style={{ width: `${String(pageCount).length}ch` }}>
              {shown.page + 1}
            </span>{" "}
            of {pageCount}
          </Label>
          <button
            type="button"
            onClick={() => setPage(shown.page + 1)}
            disabled={shown.page === pageCount - 1}
            className={buttonBase}
          >
            Next
          </button>
        </nav>
      )}

      <p className="mt-4 border-t border-stone pt-3 text-sm text-taupe">
        {you ? "Penalty counts solved machines only." : "Solve a machine to join them."} Rename yourself with the button beside your name.
        {you?.admin && " As an admin you see the admins ranked in; other players see the board without them."}
      </p>
    </div>
  );
}

/** How the solvers of a machine can be ordered, each smallest first. */
const SOLVER_SORTS = {
  penalty: { label: "Penalty", key: (row: SolverRow) => row.penalty },
  // Nobody timed (play from before timing existed) goes last.
  time: { label: "Time", key: (row: SolverRow) => row.seconds ?? Infinity },
  first: { label: "Solved first", key: (row: SolverRow) => Date.parse(row.solvedAt) },
} as const;
type SolverSort = keyof typeof SOLVER_SORTS;

/**
 * The wall-clock moment of a solve, in the player's own time zone and way of
 * writing dates: "Oct 19, 2026, 2:34 PM", and on a phone, without the year,
 * "Oct 19, 2:34 PM".
 */
const solvedAtFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const solvedAtShortFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * Everyone who solved one machine, from `GET /solvers`: their penalty, time
 * taken and when they solved it, sorted by any of the three. The server sends
 * the whole list (in the order they solved it); sorting and pages happen
 * here, so changing either fetches nothing. Ranks follow the sort, and
 * players equal on it share one, listed by who solved it first. Like the
 * scoreboard: your row pinned above every page, short pages filled out.
 */
function MachineSolvers({ machines }: { machines: StatsResponse["machines"] }) {
  const [machine, setMachine] = useState(machines[0]?.number ?? 1);
  const [sort, setSort] = useState<SolverSort>("penalty");
  const [page, setPage] = useState(0);
  const solvers = useRemote(() => fetchSolvers(machine), machine);
  // The last list stays on screen, dimmed, while another machine's loads.
  const last = useRef<SolverRow[] | null>(null);
  if (solvers.status === "ready") last.current = solvers.solvers;
  const list = last.current;

  const key = SOLVER_SORTS[sort].key;
  const byFirst = (a: SolverRow, b: SolverRow) => Date.parse(a.solvedAt) - Date.parse(b.solvedAt);
  // Infinity - Infinity is NaN, which `||` passes over to the tie-break too.
  const sorted = [...(list ?? [])].sort((a, b) => key(a) - key(b) || byFirst(a, b));
  const ranked = sorted.map((row, index) => ({ row, rank: index + 1 }));
  for (const [index, entry] of ranked.entries()) {
    // Competition ranking: equal on the sort, the rank of the first of them.
    const previous = ranked[index - 1];
    if (previous && key(previous.row) === key(entry.row)) entry.rank = previous.rank;
  }
  const pageCount = Math.max(1, Math.ceil(ranked.length / SCOREBOARD_PAGE_SIZE));
  const shownPage = Math.min(page, pageCount - 1);
  const rows = ranked.slice(shownPage * SCOREBOARD_PAGE_SIZE, (shownPage + 1) * SCOREBOARD_PAGE_SIZE);
  const you = ranked.find((entry) => entry.row.you);

  const cell = "px-3 py-2";
  // A phone has room for one figure beside the name: the one being sorted
  // by. Penalty joins it on small tablets, and everything shows from md up.
  const penaltyColumn = sort === "penalty" ? "" : "hidden sm:table-cell";
  const timeColumn = sort === "time" ? "" : "hidden md:table-cell";
  const solvedColumn = sort === "first" ? "" : "hidden md:table-cell";
  const sortedHeading = (which: SolverSort) => (sort === which ? "text-ink" : undefined);
  const row = ({ row: entry, rank }: { row: SolverRow; rank: number }, pinned = false) => (
    <tr
      key={`${pinned ? "pinned" : rank}-${entry.name}`}
      className={entry.you ? "bg-linen font-semibold" : "border-t border-stone/50"}
    >
      <td className={`${cell} font-mono tabular-nums`}>{rank}</td>
      <td className={`${cell} truncate`}>
        {entry.name}
        {entry.you && " (you)"}
        {entry.admin && <span className="font-normal text-taupe"> (admin)</span>}
      </td>
      <td className={`${cell} ${penaltyColumn} text-right font-mono tabular-nums`}>{entry.penalty}</td>
      <td className={`${cell} ${timeColumn} text-right font-mono whitespace-nowrap tabular-nums`}>
        {entry.seconds === null ? "–" : formatDuration(entry.seconds)}
      </td>
      <td className={`${cell} ${solvedColumn} text-right font-mono text-xs whitespace-nowrap tabular-nums sm:text-sm`}>
        <span className="sm:hidden">{solvedAtShortFormat.format(new Date(entry.solvedAt))}</span>
        <span className="hidden sm:inline">{solvedAtFormat.format(new Date(entry.solvedAt))}</span>
      </td>
    </tr>
  );

  return (
    <div className="overflow-x-auto rounded-md border border-stone bg-vellum p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* The browser's own arrow is hidden and drawn instead, as on the editor's language select. */}
        <label className="relative">
          <span className="sr-only">Machine</span>
          <select
            value={machine}
            onChange={(event) => {
              setMachine(Number(event.target.value));
              setPage(0);
            }}
            className="max-w-full cursor-pointer appearance-none rounded-md border border-stone bg-paper py-2 pr-10 pl-3 outline-offset-2 outline-walnut focus-visible:outline-2"
          >
            {machines.map((option) => (
              <option key={option.number} value={option.number}>
                Machine {toRoman(option.number)}: {option.title}
              </option>
            ))}
          </select>
          <svg
            viewBox="0 0 10 6"
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 w-2.5 -translate-y-1/2 text-taupe"
          >
            <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </label>
        <div role="radiogroup" aria-label="Sort by" className="flex flex-wrap items-center gap-2">
          <Label className="mr-1">Sort by</Label>
          {(Object.keys(SOLVER_SORTS) as SolverSort[]).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={sort === option}
              onClick={() => {
                setSort(option);
                setPage(0);
              }}
              className={`${buttonBase} ${sort === option ? "border-walnut bg-walnut text-paper hover:bg-walnut" : ""}`}
            >
              {SOLVER_SORTS[option].label}
            </button>
          ))}
        </div>
      </div>

      {list === null ? (
        solvers.status === "error" ? (
          <p role="alert" className="mt-4 text-sm text-oxblood">
            The solvers could not be fetched. {solvers.message}
          </p>
        ) : (
          <p className="mt-4 text-sm text-taupe italic">Counting…</p>
        )
      ) : list.length === 0 ? (
        <p className="mt-4 text-sm text-taupe italic">Nobody has solved this machine yet.</p>
      ) : (
        <table
          className={`mt-4 w-full table-fixed text-left transition-opacity ${solvers.status === "loading" ? "opacity-50" : ""}`}
        >
          <thead>
            <tr className="border-b border-stone">
              <th className={`${cell} w-12 sm:w-16`}>
                <Label>Rank</Label>
              </th>
              <th className={cell}>
                <Label>Player</Label>
              </th>
              <th className={`${cell} ${penaltyColumn} w-24 text-right`}>
                <Label className={sortedHeading("penalty")}>Penalty</Label>
              </th>
              <th className={`${cell} ${timeColumn} w-32 text-right`}>
                <Label className={sortedHeading("time")}>Time</Label>
              </th>
              <th className={`${cell} ${solvedColumn} w-36 text-right sm:w-56`}>
                <Label className={sortedHeading("first")}>Solved</Label>
              </th>
            </tr>
          </thead>
          <tbody>
            {you && row(you, true)}
            {you && (
              <tr aria-hidden="true">
                <td colSpan={5} className="h-2 border-b border-stone p-0" />
              </tr>
            )}
            {rows.map((entry) => row(entry))}
            {/* Blank rows only once there is more than one page, so a short
                list stays short and a long one never moves its buttons. */}
            {pageCount > 1 &&
              Array.from({ length: SCOREBOARD_PAGE_SIZE - rows.length }, (_, index) => (
                <tr key={`blank-${index}`} aria-hidden="true" className="border-t border-stone/50">
                  <td colSpan={5} className={cell}>
                    &nbsp;
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      {pageCount > 1 && (
        <nav className="mt-4 flex items-center justify-center gap-3 sm:gap-6" aria-label="Solver pages">
          <button type="button" onClick={() => setPage(shownPage - 1)} disabled={shownPage === 0} className={buttonBase}>
            Prev
          </button>
          <Label className="tracking-label whitespace-nowrap tabular-nums">
            Page{" "}
            <span className="inline-block text-center" style={{ width: `${String(pageCount).length}ch` }}>
              {shownPage + 1}
            </span>{" "}
            of {pageCount}
          </Label>
          <button
            type="button"
            onClick={() => setPage(shownPage + 1)}
            disabled={shownPage === pageCount - 1}
            className={buttonBase}
          >
            Next
          </button>
        </nav>
      )}

      <p className="mt-4 border-t border-stone pt-3 text-sm text-taupe">
        Penalty and time stop at the solve. Times are shown in your time zone.
      </p>
    </div>
  );
}

/** The player's statistics: totals, records, special solves, and two histograms. */
export function StatsScreen({ onBack }: StatsScreenProps) {
  const stats = useRemote(fetchStats, "stats");
  // Every machine in play solved: nothing on this page can change any more.
  const complete =
    stats.status === "ready" && stats.machines.length > 0 && stats.totals.accepted === stats.machines.length;

  return (
    <main className="mx-auto min-h-dvh max-w-[min(104rem,94vw)] py-10 [view-transition-name:stats]">
      {/* The same grid as the level select's header, so the buttons sit in
          exactly the same place: on a row of their own above the small label
          on narrow screens, level with the bottom of the title on wide ones. */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-8 border-b border-stone pb-4">
        <div className="col-span-2 row-start-2 lg:col-span-1 lg:row-start-1">
          <Label>The Universal Approximation Theorem</Label>
        </div>
        <h1 className="col-span-2 row-start-3 text-4xl font-bold lg:col-span-1 lg:row-start-2">Your Statistics</h1>
        <div className="col-span-2 row-start-1 mb-4 flex items-center gap-3 lg:col-span-1 lg:col-start-2 lg:row-span-2 lg:mb-0 lg:self-end">
          <HeaderTools />
          <NavButton onClick={onBack}>Back</NavButton>
        </div>
      </header>

      {stats.status === "loading" && <p className="mt-8 text-taupe italic">Counting…</p>}
      {stats.status === "error" && (
        <p role="alert" className="mt-8 text-oxblood">
          The statistics could not be fetched. {stats.message}
        </p>
      )}
      {stats.status === "ready" && (
        <>
          <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-6">
            <Tile label="Total penalty" value={String(stats.totals.penalty)} gold={complete} />
            <Tile label="Solved" value={String(stats.totals.accepted)} gold={complete} />
            <Tile label="Wrong answers" value={String(stats.totals.wrong)} gold={complete} />
            <Tile
              gold={complete}
              label="AC rate"
              value={percent(stats.totals.acRate)}
              note={stats.totals.meanAcRate === null ? undefined : `average: ${percent(stats.totals.meanAcRate)}`}
            />
            <Tile label="Queries used" value={String(stats.totals.queries)} gold={complete} />
            <Tile label="Time in game" value={formatDuration(stats.totals.seconds)} gold={complete} />
          </div>

          <Section title="Records">
            <div className="grid gap-5 sm:grid-cols-3">
              <Record label="Most penalty" record={stats.most.penalty} format={String} />
              <Record label="Most queries" record={stats.most.queries} format={String} />
              <Record label="Longest to solve" record={stats.most.seconds} format={formatDuration} />
            </div>
          </Section>

          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="First Solves">
              {/* Shiny: you were the first anywhere to solve these. */}
              <div className="shine rounded-md border border-brass bg-vellum p-5">
                <LevelList
                  levels={stats.firstSolves}
                  empty="None yet. Be the first to solve a machine."
                  icon={<Seal />}
                />
                <OpenFirstSolves machines={stats.machines} />
              </div>
            </Section>
            <Section title="Flawless">
              <div className="rounded-md border border-stone bg-vellum p-5">
                <LevelList
                  levels={stats.flawless}
                  empty="None yet."
                  icon={<span className="size-2 shrink-0 rounded-full bg-sage" aria-hidden="true" />}
                />
              </div>
            </Section>
          </div>

          <Section title="Scoreboard">
            <Scoreboard />
          </Section>
          
          {/* Per machine: everyone's average as a bar, always there; you as a diamond. */}
          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="Penalty per Machine">
              <div className="rounded-md border border-stone bg-vellum p-5">
                <MachineChart
                  rows={stats.machines.map((machine) => ({
                    number: machine.number,
                    title: machine.title,
                    average: machine.meanPenalty,
                    you: machine.you?.penalty ?? null,
                    solved: machine.you?.solved ?? false,
                  }))}
                  format={(value) => (Number.isInteger(value) ? String(value) : value.toFixed(1))}
                />
              </div>
            </Section>
            <Section title="Time per Machine">
              <div className="rounded-md border border-stone bg-vellum p-5">
                <MachineChart
                  rows={stats.machines.map((machine) => ({
                    number: machine.number,
                    title: machine.title,
                    average: machine.meanSeconds,
                    you: machine.you?.seconds ?? null,
                    solved: machine.you?.solved ?? false,
                  }))}
                  format={formatDuration}
                />
              </div>
            </Section>
          </div>

          <Section title="Solvers per Machine">
            <MachineSolvers machines={stats.machines} />
          </Section>

          <Section title="First Solvers">
            <FirstSolvers rows={stats.firstSolvers} />
          </Section>
        </>
      )}
    </main>
  );
}
