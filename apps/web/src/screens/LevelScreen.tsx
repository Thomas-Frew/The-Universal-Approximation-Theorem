import { type Level, type Observation, penaltyOf } from "@uat/shared";
import { useState } from "react";
import { HypothesisPanel } from "../components/HypothesisPanel";
import { Label } from "../components/Label";
import { ObservationPanel } from "../components/ObservationPanel";
import { Tex } from "../components/Tex";
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

/** The level page. Querying works; running and submitting code do not yet. */
export function LevelScreen({ level, onExit }: LevelScreenProps) {
  // Kept in memory only for now, so it is lost on reload. It moves to
  // Postgres with the rest of a player's progress.
  const [queries, setQueries] = useState<Observation[]>([]);
  // Stays at zero until submissions are judged.
  const wrongSubmissions = 0;
  const penalty = penaltyOf({ queries: queries.length, wrongSubmissions });

  return (
    <main className="mx-auto min-h-dvh max-w-[min(104rem,94vw)] py-10 [view-transition-name:level]">
      <header className="flex items-end justify-between border-b border-stone pb-4">
        <div>
          <Label>Level {toRoman(level.number)}</Label>
          <h1 className="text-4xl font-bold">{level.title}</h1>
        </div>
        <div className="flex items-end gap-8">
          <Counter label="Queries" value={queries.length} />
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
            queries={queries}
            onObserved={(observation) => setQueries((previous) => [...previous, observation])}
          />
        </div>

        <HypothesisPanel />
      </div>
    </main>
  );
}
