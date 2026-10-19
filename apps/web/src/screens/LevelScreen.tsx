import { type Level, penaltyOf, type Progress } from "@uat/shared";
import { useState } from "react";
import { HypothesisPanel } from "../components/HypothesisPanel";
import { Label } from "../components/Label";
import { ObservationPanel } from "../components/ObservationPanel";
import { Tex } from "../components/Tex";
import { toRoman } from "../lib/roman";

type LevelScreenProps = {
  level: Level;
  /** The player's progress when the level was fetched. */
  initialProgress: Progress;
  onExit: () => void;
};

const BADGES = {
  in_progress: { text: "In progress", className: "border-stone text-taupe" },
  solved: { text: "Solved", className: "border-sage bg-sage text-paper" },
};

/** A small mark beside the title. A level not yet touched has none. */
function StatusBadge({ status }: { status: Progress["status"] }) {
  if (status === "new") return null;
  const badge = BADGES[status];
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs tracking-label uppercase ${badge.className}`}
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
export function LevelScreen({ level, initialProgress, onExit }: LevelScreenProps) {
  // The server's word on where the player stands. Every query and submission
  // answers with a fresh copy, which simply replaces this one.
  const [progress, setProgress] = useState(initialProgress);
  const { queries, wrongSubmissions } = progress;
  const penalty = penaltyOf({ queries, wrongSubmissions });

  return (
    <main className="mx-auto min-h-dvh max-w-[min(104rem,94vw)] py-10 [view-transition-name:level]">
      <header className="flex items-end justify-between border-b border-stone pb-4">
        <div>
          <Label>Level {toRoman(level.number)}</Label>
          <div className="flex items-center gap-4">
            <h1 className="text-4xl font-bold">{level.title}</h1>
            <StatusBadge status={progress.status} />
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
            onProgress={setProgress}
          />
        </div>

        <HypothesisPanel levelNumber={level.number} onProgress={setProgress} />
      </div>
    </main>
  );
}
