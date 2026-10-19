import { type Level, penaltyOf, type Progress } from "@uat/shared";
import { useEffect, useState } from "react";
import { DemoComplete } from "../components/DemoComplete";
import { HypothesisPanel } from "../components/HypothesisPanel";
import { Label } from "../components/Label";
import { ObservationPanel } from "../components/ObservationPanel";
import { Tex } from "../components/Tex";
import { prefersReducedMotion } from "../lib/motion";
import { toRoman } from "../lib/roman";

type LevelScreenProps = {
  level: Level;
  /** The player's progress when the level was fetched. */
  initialProgress: Progress;
  /** The public demo: solving this level ends it, so the editor gives way to a message. */
  demo: boolean;
  onExit: () => void;
};

const BADGES = {
  in_progress: { text: "In progress", className: "border-stone text-taupe" },
  solved: { text: "Solved", className: "border-sage bg-sage text-paper" },
};

/**
 * A small mark beside the title. A level not yet touched has none. `celebrate`
 * plays a short flourish, for the moment the level is solved.
 */
function StatusBadge({ status, celebrate }: { status: Progress["status"]; celebrate: boolean }) {
  if (status === "new") return null;
  const badge = BADGES[status];
  return (
    <span
      // A new key per status remounts the badge, so its flourish plays on change.
      key={status}
      className={`rounded-full border px-3 py-1 text-xs tracking-label uppercase ${badge.className} ${celebrate ? "badge-pop" : ""}`}
    >
      {badge.text}
    </span>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-end">
      <Label>{label}</Label>
      <span className="font-mono text-2xl">{value}</span>
    </div>
  );
}

function FormatCard({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-md border border-stone bg-vellum p-6">
      <h2 className="text-xl italic">{title}</h2>
      <Tex source={body} />
    </section>
  );
}

/** The level page: query the machine, then submit code that reproduces it. */
export function LevelScreen({ level, initialProgress, demo, onExit }: LevelScreenProps) {
  // The server's word on where the player stands. Every query and submission
  // answers with a fresh copy, which simply replaces this one.
  const [progress, setProgress] = useState(initialProgress);
  const { queries, wrongSubmissions } = progress;
  const penalty = penaltyOf({ queries, wrongSubmissions });

  // True once the player solves the level while on this screen; not when they
  // open a level they solved before, which simply shows as solved.
  const [justSolved, setJustSolved] = useState(false);
  const updateProgress = (next: Progress) => {
    if (next.status === "solved" && progress.status !== "solved") setJustSolved(true);
    setProgress(next);
  };

  // In the demo, solving swaps the editor for the "coming soon" panel. A beat
  // on "Accepted.", then the editor fades out and the panel draws itself in.
  const [rightPanel, setRightPanel] = useState<"editor" | "leaving" | "complete">(
    demo && initialProgress.status === "solved" ? "complete" : "editor",
  );
  useEffect(() => {
    if (!demo || !justSolved) return;
    if (prefersReducedMotion()) {
      setRightPanel("complete");
      return;
    }
    const fadeOut = setTimeout(() => setRightPanel("leaving"), 900);
    const swap = setTimeout(() => setRightPanel("complete"), 1400);
    return () => {
      clearTimeout(fadeOut);
      clearTimeout(swap);
    };
  }, [demo, justSolved]);

  return (
    <main className="mx-auto min-h-dvh max-w-[min(104rem,94vw)] py-10 [view-transition-name:level]">
      <header className="flex items-end justify-between border-b border-stone pb-4">
        <div>
          <Label>Level {toRoman(level.number)}</Label>
          <div className="flex items-center gap-4">
            <h1 className="text-4xl font-bold">{level.title}</h1>
            <StatusBadge status={progress.status} celebrate={justSolved} />
          </div>
        </div>
        <div className="flex items-end gap-8">
          <Counter label="Queries" value={queries} />
          <Counter label="Wrong answers" value={wrongSubmissions} />
          <Counter label="Penalty" value={penalty} />
          <button
            type="button"
            onClick={onExit}
            className="cursor-pointer rounded-md border border-stone px-4 py-2 text-xs tracking-label uppercase outline-offset-4 outline-walnut hover:bg-linen focus-visible:outline-2"
          >
            Menu
          </button>
        </div>
      </header>

      <div className="mt-8 grid items-stretch gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex flex-col gap-6">
          <FormatCard title="Input" body={level.inputFormat} />
          <FormatCard title="Output" body={level.outputFormat} />
          <ObservationPanel
            level={level}
            log={progress.log}
            onProgress={updateProgress}
          />
        </div>

        {/* One frame for the right-hand side. When the demo is solved, the
            frame stays and only its content changes: the editor fades out,
            then the completion panel draws itself in. */}
        <section className="flex min-h-[40rem] flex-col rounded-md border border-stone bg-vellum p-6">
          {rightPanel === "complete" ? (
            <DemoComplete levelTitle={level.title} penalty={penalty} celebrate={justSolved} />
          ) : (
            <div
              className={`flex flex-1 flex-col transition-opacity duration-500 ease-out ${rightPanel === "leaving" ? "opacity-0" : ""}`}
            >
              <HypothesisPanel levelNumber={level.number} onProgress={updateProgress} />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
