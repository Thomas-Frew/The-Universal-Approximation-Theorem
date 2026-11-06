import {
  type AdminSubmissionRow,
  SUBMISSION_VERDICTS,
  type SubmissionVerdict,
  submissionVerdictSchema,
} from "@uat/shared";
import { Fragment, useEffect, useState } from "react";
import { CodeEditor } from "../components/CodeEditor";
import { HeaderTools, NavButton } from "../components/HeaderTools";
import { Label } from "../components/Label";
import { fetchAdminSubmissionCode, fetchAdminSubmissions, fetchLevels } from "../lib/api";
import { toRoman } from "../lib/roman";
import { LANGUAGE_NAMES } from "../lib/starterCode";
import { useRemote } from "../lib/useRemote";

type SubmissionsScreenProps = {
  onBack: () => void;
  /** Start filtered to this machine (from the metrics page's row for it). */
  machine?: number;
};

const VERDICT_NAMES: Record<SubmissionVerdict, string> = {
  pending: "Pending",
  accepted: "Accepted",
  wrong_answer: "Wrong Answer",
  runtime_error: "Runtime Error",
  time_limit: "Time Limit Exceeded",
  compile_error: "Compilation Error",
  judge_error: "Judge Error",
};

/** Accepted reads as success; the three that cost a wrong submission, as errors; the rest are neutral. */
const VERDICT_TONES: Record<SubmissionVerdict, string> = {
  pending: "text-taupe",
  accepted: "text-sage",
  wrong_answer: "text-oxblood",
  runtime_error: "text-oxblood",
  time_limit: "text-oxblood",
  compile_error: "text-taupe",
  judge_error: "text-taupe",
};

const control =
  "rounded-md border border-stone bg-paper px-2 py-1 text-sm outline-offset-2 outline-walnut focus-visible:outline-2";
const pagerButton =
  "cursor-pointer rounded-md border border-stone bg-paper px-3 py-1.5 text-xs tracking-label uppercase outline-offset-2 outline-walnut hover:bg-linen focus-visible:outline-2 disabled:cursor-default disabled:opacity-40";

/** "3 Nov, 14:05:09" in the admin's own time zone. */
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const milliseconds = (ms: number | null) => (ms === null ? "—" : `${ms} ms`);
const megabytes = (kb: number | null) => (kb === null ? "—" : `${(kb / 1024).toFixed(1)} MB`);

/** How long the judge took: from sending to the verdict. */
function judgedIn(row: AdminSubmissionRow): string {
  if (!row.judgedAt) return "—";
  return `${((Date.parse(row.judgedAt) - Date.parse(row.submittedAt)) / 1000).toFixed(1)} s`;
}

/** One submission's code, fetched when its row is opened. */
function SubmissionCode({ id }: { id: number }) {
  const code = useRemote(() => fetchAdminSubmissionCode(id), id);
  if (code.status === "loading") return <p className="text-sm text-taupe italic">Fetching the code…</p>;
  if (code.status === "error") {
    return (
      <p role="alert" className="text-sm text-oxblood">
        The code could not be fetched. {code.message}
      </p>
    );
  }
  return (
    <div>
      <p className="text-sm text-taupe">
        {LANGUAGE_NAMES[code.language]}, {code.code.split("\n").length} lines.
      </p>
      <div className="relative mt-2 h-[28rem] overflow-hidden rounded-md border border-stone">
        <CodeEditor language={code.language} value={code.code} onChange={() => {}} readOnly />
      </div>
    </div>
  );
}

/**
 * Admins only (the API refuses anyone else): every player's submissions,
 * newest first, with how each ran, and its code on a click. Narrowed by
 * machine, verdict or part of a player's alias. Admins' own are included and
 * marked, since testing is part of what this is for.
 */
export function SubmissionsScreen({ onBack, machine: startMachine }: SubmissionsScreenProps) {
  const [machine, setMachine] = useState<number | undefined>(startMachine);
  const [verdict, setVerdict] = useState<SubmissionVerdict | undefined>();
  // `typed` is the player box as it stands; `player` follows it once typing
  // pauses, so every keystroke is not a request.
  const [typed, setTyped] = useState("");
  const [player, setPlayer] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setPlayer(typed.trim()), 300);
    return () => clearTimeout(timer);
  }, [typed]);

  // Any change of filter starts again from the first page, with nothing open.
  const filtered = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setPage(1);
    setOpen(null);
  };
  useEffect(() => {
    setPage(1);
    setOpen(null);
  }, [player]);

  const levels = useRemote(fetchLevels, "levels");
  const list = useRemote(
    () => fetchAdminSubmissions({ page, machine, verdict, player }),
    `${page}/${machine}/${verdict}/${player}`,
  );

  return (
    <main className="mx-auto min-h-dvh max-w-[min(104rem,94vw)] py-10 [view-transition-name:submissions]">
      {/* The same header grid as the other pages. */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-8 border-b border-stone pb-4">
        <div className="col-span-2 row-start-2 lg:col-span-1 lg:row-start-1">
          <Label>Admin</Label>
        </div>
        <h1 className="col-span-2 row-start-3 text-4xl font-bold lg:col-span-1 lg:row-start-2">Submissions</h1>
        <div className="col-span-2 row-start-1 mb-4 flex items-center gap-3 lg:col-span-1 lg:col-start-2 lg:row-span-2 lg:mb-0 lg:self-end">
          <HeaderTools />
          <NavButton onClick={onBack}>Back</NavButton>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
        <label className="flex items-center gap-2">
          <Label>Machine</Label>
          <select
            value={machine ?? ""}
            onChange={(event) =>
              filtered(setMachine)(event.target.value === "" ? undefined : Number(event.target.value))
            }
            className={control}
          >
            <option value="">All</option>
            {levels.status === "ready" &&
              levels.levels.map((level) => (
                <option key={level.number} value={level.number}>
                  {toRoman(level.number)} · {level.title}
                </option>
              ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <Label>Verdict</Label>
          <select
            value={verdict ?? ""}
            onChange={(event) =>
              filtered(setVerdict)(event.target.value === "" ? undefined : submissionVerdictSchema.parse(event.target.value))
            }
            className={control}
          >
            <option value="">All</option>
            {SUBMISSION_VERDICTS.map((name) => (
              <option key={name} value={name}>
                {VERDICT_NAMES[name]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <Label>Player</Label>
          <input
            type="search"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="Part of an alias"
            className={`${control} w-48`}
          />
        </label>
        <span className="text-xs text-taupe italic">
          Times are in your time zone. Time is the slowest test; memory, the peak over the run.
        </span>
      </div>

      {list.status === "loading" && <p className="mt-8 text-taupe italic">Fetching…</p>}
      {list.status === "error" && (
        <p role="alert" className="mt-8 text-oxblood">
          The submissions could not be fetched. {list.message}
        </p>
      )}
      {list.status === "ready" && (
        <>
          <p className="mt-6 text-sm text-taupe">
            {list.total === 1 ? "1 submission" : `${list.total} submissions`}. Click one to read its code.
          </p>
          {/* Wide, so it scrolls sideways within itself on a phone, never the page. */}
          <div className="mt-3 overflow-x-auto rounded-md border border-stone bg-vellum">
            <table className="w-full min-w-[64rem] text-left text-sm">
              <thead>
                <tr>
                  {["Sent", "Player", "Machine", "Language", "Verdict", "Time", "Memory", "Judged in"].map(
                    (heading) => (
                      <th key={heading} className="px-3 py-2 font-normal">
                        <Label>{heading}</Label>
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {list.rows.length === 0 && (
                  <tr className="border-t border-stone">
                    <td colSpan={8} className="px-3 py-4 text-taupe italic">
                      No submissions match.
                    </td>
                  </tr>
                )}
                {list.rows.map((row) => (
                  <Fragment key={row.id}>
                    <tr
                      onClick={() => setOpen(open === row.id ? null : row.id)}
                      aria-expanded={open === row.id}
                      className={`cursor-pointer border-t border-stone hover:bg-linen ${open === row.id ? "bg-linen" : ""}`}
                    >
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap tabular-nums">
                        {when(row.submittedAt)}
                      </td>
                      <td className="px-3 py-2">
                        {row.player}
                        {row.admin && <span className="text-taupe"> (admin)</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs text-taupe">{toRoman(row.machine)}</span>{" "}
                        <span className="italic">{row.title}</span>
                        {/* An older version's tests may not be today's. */}
                        {!row.current && <span className="text-xs text-taupe"> (version {row.version})</span>}
                      </td>
                      <td className="px-3 py-2">{LANGUAGE_NAMES[row.language]}</td>
                      <td className="px-3 py-2">
                        <span className={VERDICT_TONES[row.verdict]}>{VERDICT_NAMES[row.verdict]}</span>
                        {row.failedTest !== null && (
                          <span className="text-xs text-taupe">
                            {" "}
                            on test {row.failedTest}
                            {row.tests !== null && ` of ${row.tests}`}
                          </span>
                        )}
                        {row.firstSolve && <span className="text-xs text-gilt"> · solve</span>}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs tabular-nums">{milliseconds(row.timeMs)}</td>
                      <td className="px-3 py-2 font-mono text-xs tabular-nums">{megabytes(row.memoryKb)}</td>
                      <td className="px-3 py-2 font-mono text-xs tabular-nums">{judgedIn(row)}</td>
                    </tr>
                    {open === row.id && (
                      <tr className="bg-paper">
                        <td colSpan={8} className="px-3 py-4">
                          <SubmissionCode id={row.id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-end gap-3">
            <span className="font-mono text-xs text-taupe tabular-nums">
              Page {list.page} of {list.pages}
            </span>
            <button
              type="button"
              disabled={list.page <= 1}
              onClick={() => {
                setPage(list.page - 1);
                setOpen(null);
              }}
              className={pagerButton}
            >
              Prev
            </button>
            <button
              type="button"
              disabled={list.page >= list.pages}
              onClick={() => {
                setPage(list.page + 1);
                setOpen(null);
              }}
              className={pagerButton}
            >
              Next
            </button>
          </div>
        </>
      )}
    </main>
  );
}
