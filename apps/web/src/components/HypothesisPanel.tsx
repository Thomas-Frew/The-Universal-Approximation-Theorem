import { type Language, languageSchema, type SubmissionResult } from "@uat/shared";
import { useState } from "react";
import { submitCode } from "../lib/api";
import { LANGUAGE_NAMES, STARTER_CODE } from "../lib/starterCode";
import { CodeEditor } from "./CodeEditor";

type HypothesisPanelProps = {
  levelNumber: number;
  /** Called with every verdict, so the screen can update counters and the log. */
  onVerdict: (result: SubmissionResult) => void;
};

type Status = {
  tone: "neutral" | "success" | "error";
  text: string;
  /** Compiler output, shown under the status line. */
  detail?: string;
};

const buttonBase =
  "cursor-pointer rounded-md border px-6 py-3 text-xs tracking-label uppercase outline-offset-4 outline-walnut transition-colors focus-visible:outline-2 disabled:cursor-default disabled:opacity-60";

const TONE_CLASSES = {
  neutral: "text-taupe italic",
  success: "text-sage",
  error: "text-oxblood",
};

function describe(result: SubmissionResult): Status {
  switch (result.status) {
    case "accepted":
      return { tone: "success", text: "Accepted." };
    case "compile_error":
      return { tone: "error", text: "Compilation error.", detail: result.message };
    case "wrong_answer":
      return { tone: "error", text: "Wrong answer. The failing case is in your log." };
    case "runtime_error":
      return { tone: "error", text: "Runtime error. The failing case is in your log." };
    case "time_limit":
      return { tone: "error", text: "Time limit exceeded. The failing case is in your log." };
  }
}

/** The right-hand panel: pick a language, write the code, run or submit it. */
export function HypothesisPanel({ levelNumber, onVerdict }: HypothesisPanelProps) {
  const [language, setLanguage] = useState<Language>("python");
  // One draft per language, so switching language does not lose your work.
  const [drafts, setDrafts] = useState(STARTER_CODE);
  const [judging, setJudging] = useState(false);
  const [status, setStatus] = useState<Status>({
    tone: "neutral",
    text: "Not yet submitted.",
  });

  const setCode = (code: string) =>
    setDrafts((previous) => ({ ...previous, [language]: code }));

  const submit = async () => {
    if (judging) return;
    setJudging(true);
    setStatus({ tone: "neutral", text: "Judging…" });
    try {
      const result = await submitCode(levelNumber, language, drafts[language]);
      setStatus(describe(result));
      onVerdict(result);
    } catch (error) {
      // No verdict was reached, so nothing is counted against the player.
      setStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "The judge did not answer.",
      });
    } finally {
      setJudging(false);
    }
  };

  return (
    <section className="flex min-h-[40rem] flex-col rounded-md border border-stone bg-vellum p-6">
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
          <select
            value={language}
            onChange={(event) =>
              setLanguage(languageSchema.parse(event.target.value))
            }
            className="cursor-pointer rounded-md border border-stone bg-paper px-3 py-2 font-mono text-sm outline-offset-2 outline-walnut focus-visible:outline-2"
          >
            {languageSchema.options.map((option) => (
              <option key={option} value={option}>
                {LANGUAGE_NAMES[option]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="relative mt-4 flex-1 overflow-hidden rounded-md border border-stone focus-within:border-walnut">
        <CodeEditor language={language} value={drafts[language]} onChange={setCode} />
      </div>

      {status.detail && (
        <pre className="mt-4 max-h-48 overflow-auto rounded-md border border-stone bg-paper p-3 font-mono text-sm whitespace-pre-wrap text-oxblood">
          {status.detail}
        </pre>
      )}

      <div className="mt-4 flex items-center gap-4">
        <p role="status" className={`flex-1 text-sm ${TONE_CLASSES[status.tone]}`}>
          {status.text}
        </p>
        <button
          type="button"
          onClick={() =>
            setStatus({ tone: "neutral", text: "Run is not connected yet." })
          }
          className={`${buttonBase} border-stone bg-paper hover:bg-linen`}
        >
          Run
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={judging}
          className={`${buttonBase} border-walnut bg-walnut text-paper hover:bg-ink`}
        >
          {judging ? "Judging" : "Submit"}
        </button>
      </div>
    </section>
  );
}
