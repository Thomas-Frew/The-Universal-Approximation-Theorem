import type { Language } from "@uat/shared";
import { LANGUAGE_NAMES } from "../lib/starterCode";
import { CodeEditor } from "./CodeEditor";

type SolvedCodeProps = {
  language: Language;
  code: string;
  /** Back to the completion panel, with the solution. */
  onBack: () => void;
};

/** The player's accepted code, read-only, in the editor's place. */
export function SolvedCode({ language, code, onBack }: SolvedCodeProps) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-end justify-between gap-6">
        <div>
          <h2 className="text-xl italic">Your code</h2>
          <p className="mt-1 text-sm text-taupe">Your latest accepted submission, in {LANGUAGE_NAMES[language]}.</p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="cursor-pointer rounded-md border border-stone bg-paper px-4 py-2 text-xs tracking-label uppercase outline-offset-4 outline-walnut hover:bg-linen focus-visible:outline-2"
        >
          Solution
        </button>
      </div>
      <div className="relative mt-4 min-h-[28rem] flex-1 overflow-hidden rounded-md border border-stone">
        <CodeEditor language={language} value={code} onChange={() => {}} readOnly />
      </div>
    </div>
  );
}
