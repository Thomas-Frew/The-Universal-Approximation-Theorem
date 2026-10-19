import {
  type Language,
  languageSchema,
  type Progress,
  type RunOutcome,
  type SubmissionResult,
} from "@uat/shared";
import { useState } from "react";
import { runCode, submitCode } from "../lib/api";
import { playSound } from "../lib/sound";
import { LANGUAGE_NAMES, STARTER_CODE } from "../lib/starterCode";
import { CodeEditor } from "./CodeEditor";
import { Label } from "./Label";

type HypothesisPanelProps = {
  levelNumber: number;
  /** The player's progress after every verdict: counters, log and solved state. */
  onProgress: (progress: Progress) => void;
};

type Status = {
  tone: "neutral" | "success" | "error";
  text: string;
  /** Compiler output, shown above the status line. */
  detail?: string;
  /** Observations a Run got wrong, shown above the status line. */
  mismatches?: RunOutcome[];
};

const OUTCOME_NOTES: Partial<Record<RunOutcome["verdict"], string>> = {
  runtime_error: "runtime error",
  time_limit: "time limit exceeded",
};

const buttonBase =
  "cursor-pointer rounded-md border px-6 py-3 text-xs tracking-label uppercase outline-offset-4 outline-walnut transition-colors focus-visible:outline-2 disabled:cursor-default disabled:opacity-60";

const TONE_CLASSES = {
  neutral: "text-taupe italic",
  success: "text-sage",
  error: "text-oxblood",
};

/** Sits in the top right corner of a details box, outside its scrolling area. */
function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close"
      className="absolute top-2 right-2 flex size-6 cursor-pointer items-center justify-center rounded-full border border-stone bg-paper text-taupe outline-offset-2 outline-walnut transition-colors hover:border-taupe hover:bg-linen hover:text-ink focus-visible:outline-2"
    >
      <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden="true">
        <path
          d="M1 1l8 8M9 1l-8 8"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

/** Quiet between the end of the "unknown" sound and the verdict. */
const VERDICT_PAUSE_MS = 500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function describe(result: SubmissionResult): Status {
  switch (result.status) {
    case "accepted":
      return { tone: "success", text: "Accepted." };
    case "compile_error":
      return { tone: "error", text: "Compilation error.", detail: result.message };
    case "wrong_answer":
      return { tone: "error", text: "Wrong answer. The failing case has been added to your observations." };
    case "runtime_error":
      return { tone: "error", text: "Runtime error. The failing case has been added to your observations." };
    case "time_limit":
      return { tone: "error", text: "Time limit exceeded. The failing case has been added to your observations." };
  }
}

/** The right-hand panel: pick a language, write the code, run or submit it. */
export function HypothesisPanel({ levelNumber, onProgress }: HypothesisPanelProps) {
  const [language, setLanguage] = useState<Language>("cpp");
  // One draft per language, so switching language does not lose your work.
  const [drafts, setDrafts] = useState(STARTER_CODE);
  // Which button is waiting on the judge, if any. Only one at a time.
  const [busy, setBusy] = useState<"run" | "submit" | null>(null);
  const [status, setStatus] = useState<Status>({
    tone: "neutral",
    text: "Not yet run.",
  });

  // Hides the compiler output or the table of differences, keeping the status line.
  const closeDetails = () =>
    setStatus(({ tone, text }) => ({ tone, text }));

  const setCode = (code: string) =>
    setDrafts((previous) => ({ ...previous, [language]: code }));

  // Shared by both buttons: show progress, do the work, report a failure to
  // reach the judge. No verdict means nothing is counted against the player.
  const withJudge = async (action: "run" | "submit", work: () => Promise<Status>) => {
    if (busy) return;
    setBusy(action);
    setStatus({ tone: "neutral", text: action === "run" ? "Running…" : "Judging…" });
    try {
      setStatus(await work());
    } catch (error) {
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "The judge did not answer.",
      });
    } finally {
      setBusy(null);
    }
  };

  // Checks code against what the player has already seen (samples and log).
  // It is free and touches no hidden test, which is why it may show the
  // program's own output.
  const checkAgainstLog = async (code: string): Promise<Status> => {
    const result = await runCode(levelNumber, language, code);
    if (result.status === "compile_error") {
      return { tone: "error", text: "Compilation error.", detail: result.message };
    }
    const mismatches = result.outcomes.filter((outcome) => outcome.verdict !== "passed");
    const total = result.outcomes.length;
    return mismatches.length === 0
      ? { tone: "success", text: `Matches all ${total} observations.` }
      : {
          tone: "error",
          text: `Differs on ${mismatches.length} of ${total} observations.`,
          mismatches,
        };
  };

  const submit = () => {
    if (busy) return;
    // The suspense: "unknown" plays while the judge works, and the verdict is
    // held back until it has finished and half a second of quiet has passed.
    // (If another sound cuts it off, the wait ends then.) Started here, inside
    // the click, which is also what lets the browser play sound at all.
    const suspense = playSound("unknown").then(() => sleep(VERDICT_PAUSE_MS));

    return withJudge("submit", async () => {
      const code = drafts[language];
      let verdict: SubmissionResult;
      let progress: Progress;
      try {
        ({ verdict, progress } = await submitCode(levelNumber, language, code));
      } catch (error) {
        await suspense;
        throw error;
      }

      // A wrong submission has just added the failing case to the log, so a
      // Run against the log now shows where the code differs, that case
      // included. Only the one revealed hidden case is involved: the program's
      // output on the other hidden tests is never shown. It runs during the
      // suspense, so it rarely adds any wait of its own.
      const differences =
        "revealed" in verdict
          ? checkAgainstLog(code).then(
              (result) => result.mismatches,
              // The verdict stands even if the follow-up Run cannot reach the judge.
              () => undefined,
            )
          : Promise.resolve(undefined);
      const [mismatches] = await Promise.all([differences, suspense]);

      void playSound(verdict.status === "accepted" ? "correct" : "wrong");
      onProgress(progress);
      return { ...describe(verdict), ...(mismatches && { mismatches }) };
    });
  };

  const run = () =>
    withJudge("run", async () => {
      const status = await checkAgainstLog(drafts[language]);
      void playSound("query");
      return status;
    });

  return (
    // Content only: the frame around it belongs to the level screen, so it
    // stays in place if this panel gives way to another.
    <div className="flex flex-1 flex-col">
      <div className="flex items-end justify-between gap-6">
        <div>
          <h2 className="text-xl italic">Your hypothesis</h2>
          <p className="mt-1 text-sm text-taupe">
            Write the logic you believe the machine follows.
          </p>
        </div>
        <label className="flex items-center gap-3">
          <span className="text-xs tracking-label text-taupe uppercase">
            Language
          </span>
          {/* The browser's own arrow cannot be spaced, so it is hidden
              (appearance-none) and drawn here instead, with room around it. */}
          <span className="relative">
            <select
              value={language}
              onChange={(event) =>
                setLanguage(languageSchema.parse(event.target.value))
              }
              className="cursor-pointer appearance-none rounded-md border border-stone bg-paper py-2 pr-10 pl-3 font-mono text-sm outline-offset-2 outline-walnut focus-visible:outline-2"
            >
              {languageSchema.options.map((option) => (
                <option key={option} value={option}>
                  {LANGUAGE_NAMES[option]}
                </option>
              ))}
            </select>
            <svg
              viewBox="0 0 10 6"
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-3 w-2.5 -translate-y-1/2 text-taupe"
            >
              <path
                d="M1 1l4 4 4-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </label>
      </div>

      <div className="relative mt-4 flex-1 overflow-hidden rounded-md border border-stone focus-within:border-walnut">
        <CodeEditor language={language} value={drafts[language]} onChange={setCode} />
      </div>

      {status.detail && (
        <div className="relative mt-4">
          <pre className="max-h-48 overflow-auto rounded-md border border-stone bg-paper p-3 pr-10 font-mono text-sm whitespace-pre-wrap text-oxblood">
            {status.detail}
          </pre>
          <CloseButton onClick={closeDetails} />
        </div>
      )}

      {status.mismatches && (
        <div className="relative mt-4">
          <CloseButton onClick={closeDetails} />
          <div className="max-h-48 overflow-auto rounded-md border border-stone bg-paper p-3 pr-10">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className="pb-1 font-normal">
                    <Label>Input</Label>
                  </th>
                  <th className="pb-1 font-normal">
                    <Label>Expected</Label>
                  </th>
                  <th className="pb-1 font-normal">
                    <Label>Yours</Label>
                  </th>
                </tr>
              </thead>
              <tbody className="font-mono text-sm">
                {status.mismatches.map((outcome) => (
                  <tr key={outcome.input} className="align-top">
                    <td className="py-1 pr-4 whitespace-pre-wrap">
                      {outcome.input.trimEnd()}
                    </td>
                    <td className="py-1 pr-4 whitespace-pre-wrap text-walnut">
                      {outcome.expected.trimEnd()}
                    </td>
                    <td className="py-1 whitespace-pre-wrap text-oxblood">
                      {OUTCOME_NOTES[outcome.verdict] ?? outcome.actual.trimEnd()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-4">
        <p role="status" className={`flex-1 text-sm ${TONE_CLASSES[status.tone]}`}>
          {status.text}
        </p>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy !== null}
          className={`${buttonBase} border-stone bg-paper hover:bg-linen`}
        >
          {busy === "run" ? "Running" : "Run"}
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy !== null}
          className={`${buttonBase} border-walnut bg-walnut text-paper hover:bg-ink`}
        >
          {busy === "submit" ? "Judging" : "Submit"}
        </button>
      </div>
    </div>
  );
}
