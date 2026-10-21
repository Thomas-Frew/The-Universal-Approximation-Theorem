import type { Language } from "@uat/shared";
import { LANGUAGE_NAMES } from "../lib/starterCode";
import { CodeEditor } from "./CodeEditor";

type SolvedCodeProps = {
  language: Language;
  code: string;
  /** Back to the completion panel, with the solution. */
  onBack: () => void;
  /** Back to the editor, to query and submit again (the penalty stays frozen). */
  onTryAgain: () => void;
};

// The same size and style as Run and Submit in the editor (HypothesisPanel).
const buttonBase =
  "cursor-pointer rounded-md border px-6 py-3 text-xs tracking-label uppercase outline-offset-4 outline-walnut transition-colors focus-visible:outline-2";

/** The player's accepted code, read-only, in the editor's place. */
export function SolvedCode({ language, code, onBack, onTryAgain }: SolvedCodeProps) {
  return (
    <div className="flex flex-1 flex-col">
      <div>
        <h2 className="text-xl italic">Your Code</h2>
        <p className="mt-1 text-sm text-taupe">Your latest accepted submission, in {LANGUAGE_NAMES[language]}.</p>
      </div>
      <div className="relative mt-4 min-h-[28rem] flex-1 overflow-hidden rounded-md border border-stone">
        <CodeEditor language={language} value={code} onChange={() => {}} readOnly />
      </div>
      {/* Laid out like the editor's Run and Submit row, so the buttons sit
          where the player's hand already goes. */}
      <div className="mt-4 flex items-center justify-end gap-4">
        <button type="button" onClick={onBack} className={`${buttonBase} border-stone bg-paper hover:bg-linen`}>
          Solution
        </button>
        <button
          type="button"
          onClick={onTryAgain}
          className={`${buttonBase} border-walnut bg-walnut text-paper hover:bg-ink`}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
