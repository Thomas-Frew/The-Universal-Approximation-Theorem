import { type Level, penaltyOf, type Progress } from "@uat/shared";
import { useEffect, useState } from "react";
import { DemoComplete } from "../components/DemoComplete";
import { HypothesisPanel } from "../components/HypothesisPanel";
import { Label } from "../components/Label";
import { MuteButton } from "../components/MuteButton";
import { ObservationPanel } from "../components/ObservationPanel";
import { Tex } from "../components/Tex";
import { resetProgress } from "../lib/api";
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
      // Centring on the heading's line box sits it high, since that box keeps
      // room below for descenders; top-1 lowers it onto the middle of the
      // lowercase letters, where the eye reads the title's centre.
      className={`relative top-1 shrink-0 rounded-full border whitespace-nowrap px-3 py-1 text-xs tracking-label uppercase ${badge.className} ${celebrate ? "badge-pop" : ""}`}
    >
      {badge.text}
    </span>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-start whitespace-nowrap lg:items-end">
      {/* Tighter letter-spacing on phones, so all three fit on one line. */}
      <Label className="tracking-[0.1em] sm:tracking-label">{label}</Label>
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
      {/* Placed on a grid, so one header serves both layouts:

            phone and tablet           wide (lg)
            MACHINE I    [🔈][MENU]    MACHINE I       QUERIES … PENALTY  [🔈][MENU]
            The Mainspring (badge)     The Mainspring   0         0
            QUERIES … PENALTY

          On narrow screens the buttons share the top line with the small
          label, so the title gets the full width. The badge and labels never
          break mid-phrase. */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-8 border-b border-stone pb-4 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="col-start-1 row-start-1">
          <Label>Machine {toRoman(level.number)}</Label>
        </div>
        <div className="col-span-2 row-start-2 flex flex-wrap items-center gap-x-4 gap-y-2 lg:col-span-1">
          <h1 className="text-4xl font-bold">{level.title}</h1>
          <StatusBadge status={progress.status} celebrate={justSolved} />
        </div>
        <div className="col-span-2 row-start-3 mt-4 flex gap-6 sm:gap-8 lg:col-span-1 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0">
          <Counter label="Queries" value={queries} />
          <Counter label="Wrong answers" value={wrongSubmissions} />
          <Counter label="Penalty" value={penalty} />
        </div>
        <div className="col-start-2 row-start-1 mb-2 flex items-center gap-3 lg:col-start-3 lg:row-span-2 lg:mb-0 lg:gap-8">
          <MuteButton />
          <button
            type="button"
            onClick={onExit}
            className="cursor-pointer rounded-md border border-stone px-4 py-2 text-xs tracking-label uppercase outline-offset-4 outline-walnut hover:bg-linen focus-visible:outline-2"
          >
            Menu
          </button>
        </div>
      </header>

      {/* minmax(0, ...) on both layouts: a plain column would grow to its widest
          content (a long line of code, a wide table) and push off the screen. */}
      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] items-stretch gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
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
            <DemoComplete
              solution={progress.solution}
              celebrate={justSolved}
              onStartAgain={async () => {
                setProgress(await resetProgress(level.number));
                setJustSolved(false);
                setRightPanel("editor");
              }}
            />
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
