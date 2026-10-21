import { HEARTBEAT_SECONDS, type Level, penaltyOf, type Progress } from "@uat/shared";
import { useEffect, useRef, useState } from "react";
import { LevelComplete } from "../components/LevelComplete";
import { AdminLevelFeedbackCard } from "../components/AdminFeedback";
import { FeedbackSection, type FeedbackSectionHandle } from "../components/FeedbackSection";
import { HypothesisPanel } from "../components/HypothesisPanel";
import { GuideButton } from "../components/GuideButton";
import { Label } from "../components/Label";
import { MuteButton } from "../components/MuteButton";
import { ObservationPanel } from "../components/ObservationPanel";
import { SettingsMenu } from "../components/SettingsMenu";
import { SolvedCode } from "../components/SolvedCode";
import { StatusBadge } from "../components/StatusBadge";
import { Tex } from "../components/Tex";
import { resetProgress, sendHeartbeat } from "../lib/api";
import { useIsAdmin } from "../lib/admin";
import { clearDrafts } from "../lib/drafts";
import { prefersReducedMotion } from "../lib/motion";
import { toRoman } from "../lib/roman";

type LevelScreenProps = {
  level: Level;
  /** The player's progress when the level was fetched. */
  initialProgress: Progress;
  /** The public demo: solving this level ends it, so the editor gives way to a message. */
  demo: boolean;
  onExit: () => void;
  /** After the settings menu has wiped the player's progress. */
  onWiped: () => void;
  onFeedback: () => void;
  onGuide: () => void;
  onAdmin: () => void;
};

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
export function LevelScreen({ level, initialProgress, demo, onExit, onWiped, onFeedback, onGuide, onAdmin }: LevelScreenProps) {
  const admin = useIsAdmin();
  // The server's word on where the player stands. Every query and submission
  // answers with a fresh copy, which simply replaces this one.
  const [progress, setProgress] = useState(initialProgress);
  // The feedback card under the observations; the completion panel's Feedback button opens it.
  const feedbackRef = useRef<FeedbackSectionHandle>(null);

  // Time played, for the stats page: a heartbeat every HEARTBEAT_SECONDS
  // while this level is open and its tab is visible. The API stops counting
  // once the level is solved, and ignores beats that come too fast.
  useEffect(() => {
    const beat = setInterval(() => {
      if (document.visibilityState === "visible") void sendHeartbeat(level.number);
    }, HEARTBEAT_SECONDS * 1000);
    return () => clearInterval(beat);
  }, [level.number]);
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
  // Solving swaps the editor for the completion panel (the solution, and a
  // way to read back the code that solved it). A beat on "Accepted.", then the
  // editor fades out and the panel draws itself in. A level solved before
  // opens straight on the panel.
  const [rightPanel, setRightPanel] = useState<"editor" | "leaving" | "complete" | "code">(
    initialProgress.status === "solved" ? "complete" : "editor",
  );
  useEffect(() => {
    if (!justSolved) return;
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
  }, [justSolved]);

  // Between the editor, the solution panel and the code view: fade out,
  // swap while invisible, fade in.
  const [swapping, setSwapping] = useState(false);
  const swapPanel = (next: "editor" | "complete" | "code") => {
    // The panel's entrance plays once, when the level is solved; coming back
    // to it later simply fades it in.
    const swap = () => {
      setJustSolved(false);
      setRightPanel(next);
      setSwapping(false);
    };
    if (prefersReducedMotion()) return swap();
    setSwapping(true);
    setTimeout(swap, 300);
  };
  // Bumped by the demo's "Start again", for a fresh editor with the starter code.
  const [editorKey, setEditorKey] = useState(0);

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
          {/* Centring on the heading's line box sits the badge high, since that
              box keeps room below for descenders; top-1 lowers it onto the
              middle of the lowercase letters, where the eye reads the centre. */}
          <StatusBadge status={progress.status} celebrate={justSolved} className="relative top-1" />
        </div>
        <div className="col-span-2 row-start-3 mt-4 flex gap-6 sm:gap-8 lg:col-span-1 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0">
          <Counter label="Queries" value={queries} />
          <Counter label="Wrong answers" value={wrongSubmissions} />
          <Counter label="Penalty" value={penalty} />
        </div>
        <div className="col-start-2 row-start-1 flex items-center gap-3 self-start lg:col-start-3 lg:row-span-2 lg:ml-8 lg:self-end">
          <MuteButton />
          <SettingsMenu onWiped={onWiped} onFeedback={onFeedback} onAdmin={onAdmin} />
          <GuideButton onClick={onGuide} />
          <button
            type="button"
            onClick={onExit}
            className="cursor-pointer rounded-md border border-stone bg-paper px-4 py-2 text-xs tracking-label uppercase outline-offset-4 outline-walnut hover:bg-linen focus-visible:outline-2"
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
          <FeedbackSection ref={feedbackRef} levelNumber={level.number} />
          {admin && <AdminLevelFeedbackCard levelNumber={level.number} />}
        </div>

        {/* One frame for the right-hand side. When the level is solved, the
            frame stays and only its content changes: the editor fades out,
            then the completion panel draws itself in. */}
        <section className="flex min-h-[40rem] flex-col rounded-md border border-stone bg-vellum p-6">
          {/* Everything on this side shares one wrapper, which fades out
              ("leaving", when the level is first solved, or `swapping`),
              changes what it shows while invisible, and fades back in. */}
          <div
            className={`flex flex-1 flex-col transition-opacity ease-out ${
              rightPanel === "leaving" ? "opacity-0 duration-500" : swapping ? "opacity-0 duration-300" : "duration-300"
            }`}
          >
            {rightPanel === "code" && progress.solvedWith && (
              <SolvedCode
                language={progress.solvedWith.language}
                code={progress.solvedWith.code}
                onBack={() => swapPanel("complete")}
                onTryAgain={() => swapPanel("editor")}
              />
            )}
            {(rightPanel === "complete" || (rightPanel === "code" && !progress.solvedWith)) && (
              <LevelComplete
                demo={demo}
                solution={progress.solution}
                onReadCode={() => swapPanel("code")}
                onTryAgain={() => swapPanel("editor")}
                onFeedback={() => feedbackRef.current?.reveal()}
                celebrate={justSolved}
                onStartAgain={async () => {
                  setProgress(await resetProgress(level.number));
                  setJustSolved(false);
                  // A fresh editor, with the starter code rather than the saved draft.
                  clearDrafts(level.id);
                  setEditorKey((key) => key + 1);
                  setRightPanel("editor");
                }}
              />
            )}
            {/* The editor stays mounted while hidden, so going to the solution
                and back keeps whatever the player had written. */}
            <div
              className={rightPanel === "editor" || rightPanel === "leaving" ? "flex flex-1 flex-col" : "hidden"}
            >
              <HypothesisPanel
                key={editorKey}
                levelNumber={level.number}
                levelId={level.id}
                onProgress={updateProgress}
                // On a level solved before, start from the latest solution.
                initialDraft={editorKey === 0 ? initialProgress.solvedWith : undefined}
                onShowSolution={progress.status === "solved" ? () => swapPanel("complete") : undefined}
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
