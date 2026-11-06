import { useContext, useState } from "react";
import { hasSeenGuide, markGuideSeen } from "../lib/guideHint";
import { HeaderToolsContext } from "./HeaderTools";

/**
 * A strip above a level's header, suggesting the guide to a player who has
 * not read it. It stays, machine after machine, until they open the guide
 * (from here or the question mark) or dismiss it.
 */
export function GuideBanner() {
  const actions = useContext(HeaderToolsContext);
  const [shown, setShown] = useState(() => !hasSeenGuide());
  if (!shown || !actions) return null;

  const dismiss = () => {
    markGuideSeen();
    setShown(false);
  };

  return (
    <aside className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-md border border-brass bg-vellum px-6 py-4">
      <p className="min-w-0 flex-1 italic">
        New here? The guide explains the rules, the penalties, and how to read input in each language.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => {
            markGuideSeen();
            actions.onGuide();
          }}
          className="cursor-pointer rounded-md border border-walnut bg-walnut px-4 py-2 text-xs tracking-label text-paper uppercase outline-offset-4 outline-walnut transition-colors hover:bg-ink focus-visible:outline-2"
        >
          Read the Guide
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="cursor-pointer rounded-md border border-stone bg-paper px-4 py-2 text-xs tracking-label uppercase outline-offset-4 outline-walnut transition-colors hover:bg-linen focus-visible:outline-2"
        >
          Dismiss
        </button>
      </div>
    </aside>
  );
}
