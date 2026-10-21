import type { StatsResponse } from "@uat/shared";
import type { ReactNode } from "react";
import { MachineChart } from "../components/MachineChart";
import { Label } from "../components/Label";
import { fetchStats } from "../lib/api";
import { toRoman } from "../lib/roman";
import { useRemote } from "../lib/useRemote";

type StatsScreenProps = {
  onBack: () => void;
};

const buttonBase =
  "cursor-pointer rounded-md border border-stone bg-paper px-4 py-2 text-xs tracking-label uppercase outline-offset-4 outline-walnut hover:bg-linen focus-visible:outline-2";

/** 45 s, 12 m, 1 h 5 m. */
function formatDuration(seconds: number): string {
  const rounded = Math.round(seconds);
  if (rounded < 60) return `${rounded} s`;
  const minutes = Math.floor(rounded / 60);
  if (minutes < 60) return `${minutes} m`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} m`;
}

const percent = (rate: number | null) => (rate === null ? "–" : `${Math.round(rate * 100)}%`);

/** A big number with its label, and an optional note beneath. */
function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col rounded-md border border-stone bg-vellum p-5">
      <Label>{label}</Label>
      <span className="mt-2 font-mono text-3xl whitespace-nowrap 2xl:text-4xl">{value}</span>
      {note && <span className="mt-1 text-sm text-taupe italic">{note}</span>}
    </div>
  );
}

/** One "most" record: which machine, and how much. */
function Record({ label, record, format }: {
  label: string;
  record: StatsResponse["most"]["penalty"];
  format: (value: number) => string;
}) {
  return (
    <div className="flex flex-col rounded-md border border-stone bg-vellum p-5">
      <Label>{label}</Label>
      {record ? (
        <>
          <span className="mt-2 text-lg italic">{record.title}</span>
          <span className="flex items-baseline justify-between text-sm text-taupe">
            Machine {toRoman(record.number)}
            <span className="font-mono text-2xl text-ink">{format(record.value)}</span>
          </span>
        </>
      ) : (
        <span className="mt-2 text-sm text-taupe italic">Nothing yet.</span>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-xl italic">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** A small brass seal, for first solves. */
function Seal() {
  return (
    <svg viewBox="0 0 20 20" className="size-5 shrink-0 text-brass" aria-hidden="true">
      <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6.5 10.2l2.4 2.4 4.6-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LevelList({ levels, empty, icon }: {
  levels: StatsResponse["flawless"];
  empty: string;
  icon: ReactNode;
}) {
  if (levels.length === 0) return <p className="text-sm text-taupe italic">{empty}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {levels.map((level) => (
        <li key={level.number} className="flex items-center gap-3">
          {icon}
          <Label>Machine {toRoman(level.number)}</Label>
          <span className="italic">{level.title}</span>
        </li>
      ))}
    </ul>
  );
}

/** The player's statistics: totals, records, special solves, and two histograms. */
export function StatsScreen({ onBack }: StatsScreenProps) {
  const stats = useRemote(fetchStats, "stats");

  return (
    <main className="mx-auto min-h-dvh max-w-[min(104rem,94vw)] py-10 [view-transition-name:stats]">
      {/* The same grid as the level select's header, so the button sits in
          exactly the same place: beside the small label on narrow screens,
          level with the bottom of the title on wide ones. */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-8 border-b border-stone pb-4">
        <div className="col-start-1 row-start-1">
          <Label>The Universal Approximation Theorem</Label>
        </div>
        <h1 className="col-span-2 row-start-2 text-4xl font-bold lg:col-span-1">Your Statistics</h1>
        <div className="col-start-2 row-start-1 flex items-center gap-3 self-start lg:row-span-2 lg:self-end">
          <button type="button" onClick={onBack} className={buttonBase}>
            Menu
          </button>
        </div>
      </header>

      {stats.status === "loading" && <p className="mt-8 text-taupe italic">Counting…</p>}
      {stats.status === "error" && (
        <p role="alert" className="mt-8 text-oxblood">
          The statistics could not be fetched. {stats.message}
        </p>
      )}
      {stats.status === "ready" && (
        <>
          <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-6">
            <Tile label="Total penalty" value={String(stats.totals.penalty)} />
            <Tile label="Solved" value={String(stats.totals.accepted)} />
            <Tile label="Wrong answers" value={String(stats.totals.wrong)} />
            <Tile
              label="AC rate"
              value={percent(stats.totals.acRate)}
              note={stats.totals.meanAcRate === null ? undefined : `average: ${percent(stats.totals.meanAcRate)}`}
            />
            <Tile label="Queries used" value={String(stats.totals.queries)} />
            <Tile label="Time in game" value={formatDuration(stats.totals.seconds)} />
          </div>

          <Section title="Records">
            <div className="grid gap-5 sm:grid-cols-3">
              <Record label="Most penalty" record={stats.most.penalty} format={String} />
              <Record label="Most queries" record={stats.most.queries} format={String} />
              <Record label="Longest to solve" record={stats.most.seconds} format={formatDuration} />
            </div>
          </Section>

          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="First Solves">
              {/* Shiny: you were the first anywhere to solve these. */}
              <div className="shine rounded-md border border-brass bg-vellum p-5">
                <p className="mb-4 text-sm text-taupe">Machines you solved before anyone else.</p>
                <LevelList
                  levels={stats.firstSolves}
                  empty="None yet. Be the first to solve a machine."
                  icon={<Seal />}
                />
              </div>
            </Section>
            <Section title="Flawless">
              <div className="rounded-md border border-stone bg-vellum p-5">
                <p className="mb-4 text-sm text-taupe">Machines solved without any penalty.</p>
                <LevelList
                  levels={stats.flawless}
                  empty="None yet."
                  icon={<span className="size-2 shrink-0 rounded-full bg-sage" aria-hidden="true" />}
                />
              </div>
            </Section>
          </div>

          {/* Per machine: everyone's average as a bar, always there; you as a diamond. */}
          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="Penalty per Machine">
              <div className="rounded-md border border-stone bg-vellum p-5">
                <MachineChart
                  rows={stats.machines.map((machine) => ({
                    number: machine.number,
                    title: machine.title,
                    average: machine.meanPenalty,
                    you: machine.you?.penalty ?? null,
                    solved: machine.you?.solved ?? false,
                  }))}
                  format={(value) => (Number.isInteger(value) ? String(value) : value.toFixed(1))}
                />
              </div>
            </Section>
            <Section title="Time per Machine">
              <div className="rounded-md border border-stone bg-vellum p-5">
                <MachineChart
                  rows={stats.machines.map((machine) => ({
                    number: machine.number,
                    title: machine.title,
                    average: machine.meanSeconds,
                    you: machine.you?.seconds ?? null,
                    solved: machine.you?.solved ?? false,
                  }))}
                  format={formatDuration}
                />
              </div>
            </Section>
          </div>
        </>
      )}
    </main>
  );
}
