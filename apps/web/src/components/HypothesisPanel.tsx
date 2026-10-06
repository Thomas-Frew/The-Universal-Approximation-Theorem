import { type Language, languageSchema } from "@uat/shared";
import { useState } from "react";
import { LANGUAGE_NAMES, STARTER_CODE } from "../lib/starterCode";
import { CodeEditor } from "./CodeEditor";

const buttonBase =
  "cursor-pointer rounded-md border px-6 py-3 text-xs tracking-label uppercase outline-offset-4 outline-walnut transition-colors focus-visible:outline-2";

/** The right-hand panel: pick a language, write the code, run or submit it. */
export function HypothesisPanel() {
  const [language, setLanguage] = useState<Language>("python");
  // One draft per language, so switching language does not lose your work.
  const [drafts, setDrafts] = useState(STARTER_CODE);
  const [status, setStatus] = useState("Not yet tested against your observations.");

  const setCode = (code: string) =>
    setDrafts((previous) => ({ ...previous, [language]: code }));

  // Placeholder until the API and judge exist.
  const notConnected = (action: string) =>
    setStatus(`${action} is not connected yet: there is no judge to send code to.`);

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

      <div className="mt-4 flex items-center gap-4">
        <p role="status" className="flex-1 text-sm text-taupe italic">
          {status}
        </p>
        <button
          type="button"
          onClick={() => notConnected("Run")}
          className={`${buttonBase} border-stone bg-paper hover:bg-linen`}
        >
          Run
        </button>
        <button
          type="button"
          onClick={() => notConnected("Submit")}
          className={`${buttonBase} border-walnut bg-walnut text-paper hover:bg-ink`}
        >
          Submit
        </button>
      </div>
    </section>
  );
}
