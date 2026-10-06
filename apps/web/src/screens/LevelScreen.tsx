import type { Level } from "@uat/shared";
import type { ReactNode } from "react";
import { HypothesisPanel } from "../components/HypothesisPanel";
import { toRoman } from "../lib/roman";

type LevelScreenProps = {
  level: Level;
  onExit: () => void;
};

function Label({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs tracking-label text-taupe uppercase">
      {children}
    </span>
  );
}

function FormatCard({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-md border border-stone bg-vellum p-6">
      <h2 className="text-xl italic">{title}</h2>
      <p className="mt-2 leading-relaxed">{body}</p>
    </section>
  );
}

/** First cut of the level page: no querying yet, and nothing is sent anywhere. */
export function LevelScreen({ level, onExit }: LevelScreenProps) {
  return (
    <main className="mx-auto min-h-dvh max-w-[min(104rem,94vw)] py-10 [view-transition-name:level]">
      <header className="flex items-end justify-between border-b border-stone pb-4">
        <div>
          <Label>Level {toRoman(level.number)}</Label>
          <h1 className="text-4xl font-bold">{level.title}</h1>
        </div>
        <button
          type="button"
          onClick={onExit}
          className="cursor-pointer rounded-md border border-stone px-4 py-2 text-xs tracking-label uppercase outline-offset-4 outline-walnut hover:bg-linen focus-visible:outline-2"
        >
          Menu
        </button>
      </header>

      <div className="mt-8 grid items-stretch gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex flex-col gap-6">
          <FormatCard title="Input" body={level.inputFormat} />
          <FormatCard title="Output" body={level.outputFormat} />

          <section className="flex-1 rounded-md border border-stone bg-vellum p-6">
            <h2 className="text-xl italic">Observations</h2>
            <p className="mt-1 text-sm text-taupe">
              These samples are free. Your own queries will be added here.
            </p>
            <table className="mt-4 w-full text-left">
              <thead>
                <tr>
                  <th className="w-16 pb-2 font-normal">
                    <Label>#</Label>
                  </th>
                  <th className="pb-2 font-normal">
                    <Label>Input</Label>
                  </th>
                  <th className="pb-2 font-normal">
                    <Label>Output</Label>
                  </th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {level.samples.map((sample, index) => (
                  <tr key={sample.input} className="odd:bg-paper">
                    <td className="px-2 py-2 text-taupe">
                      {String(index + 1).padStart(2, "0")}
                    </td>
                    <td className="py-2 whitespace-pre-wrap">
                      {sample.input.trimEnd()}
                    </td>
                    <td className="py-2 whitespace-pre-wrap text-walnut">
                      {sample.output.trimEnd()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <HypothesisPanel />
      </div>
    </main>
  );
}
