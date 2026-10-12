import { type Level, penaltyOf, type SubmissionResult } from "@uat/shared";
import { useState } from "react";
import { HypothesisPanel } from "../components/HypothesisPanel";
import { Label } from "../components/Label";
import { ObservationPanel } from "../components/ObservationPanel";
import { Tex } from "../components/Tex";
import type { LogEntry } from "../lib/log";
import { toRoman } from "../lib/roman";

type LevelScreenProps = {
  level: Level;
  onExit: () => void;
};

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
export function LevelScreen({ level, onExit }: LevelScreenProps) {
  // Kept in memory only for now, so it is lost on reload. It moves to
  // Postgres with the rest of a player's progress.
  const [log, setLog] = useState<LogEntry[]>([]);
  const [wrongSubmissions, setWrongSubmissions] = useState(0);

  // A revealed case is in the log too, but only the player's own queries cost.
  const queries = log.filter((entry) => entry.source === "query").length;
  const penalty = penaltyOf({ queries, wrongSubmissions });

  const onVerdict = (result: SubmissionResult) => {
    // Accepted costs nothing, and neither does a program that did not compile.
    if (result.status === "accepted" || result.status === "compile_error") return;
    const { revealed } = result;
    setWrongSubmissions((count) => count + 1);
    setLog((previous) => {
      const known = [...level.samples, ...previous].some(
        (entry) => entry.input === revealed.input,
      );
      return known ? previous : [...previous, { ...revealed, source: "revealed" }];
    });
  };

  return (
    <main className="mx-auto min-h-dvh max-w-[min(104rem,94vw)] py-10 [view-transition-name:level]">
      <header className="flex items-end justify-between border-b border-stone pb-4">
        <div>
          <Label>Level {toRoman(level.number)}</Label>
          <h1 className="text-4xl font-bold">{level.title}</h1>
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
            log={log}
            onObserved={(observation) =>
              setLog((previous) => [...previous, { ...observation, source: "query" }])
            }
          />
        </div>

        <HypothesisPanel
          levelNumber={level.number}
          observations={[...level.samples, ...log]}
          onVerdict={onVerdict}
        />
      </div>
    </main>
  );
}
