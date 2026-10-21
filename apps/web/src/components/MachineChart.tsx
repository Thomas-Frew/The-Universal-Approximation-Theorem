import { toRoman } from "../lib/roman";

/**
 * One row per machine: a bar for everyone's average, always shown, and a
 * diamond for where this player is (filled once solved, hollow while in
 * progress, absent if not started). Horizontal, so machine names fit and it
 * works at phone width. Two series, so it has a legend; the diamond also
 * differs by shape, never by colour alone.
 */

export type MachineRow = {
  number: number;
  title: string;
  /** Everyone's average, or null if nobody has solved it yet. */
  average: number | null;
  /** This player's value, or null if they have not started it (or it has no figure). */
  you: number | null;
  solved: boolean;
};

type MachineChartProps = {
  rows: MachineRow[];
  /** A value as text, e.g. "4.2" or "12 m". */
  format: (value: number) => string;
};

function Diamond({ solved, className = "" }: { solved: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      // The Paper ring keeps it clear of the bar underneath.
      className={`block size-2.5 rotate-45 border-2 border-ink ring-2 ring-paper ${solved ? "bg-ink" : "bg-paper"} ${className}`}
    />
  );
}

export function MachineChart({ rows, format }: MachineChartProps) {
  // One scale for every row, so bars compare across machines.
  const top = Math.max(1, ...rows.flatMap((row) => [row.average ?? 0, row.you ?? 0])) * 1.05;
  const at = (value: number) => `${(value / top) * 100}%`;

  return (
    <figure>
      <figcaption className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-taupe">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-5 rounded-sm bg-walnut" aria-hidden="true" /> Average
        </span>
        <span className="flex items-center gap-2">
          <Diamond solved /> You, solved
        </span>
        <span className="flex items-center gap-2">
          <Diamond solved={false} /> You, in progress
        </span>
      </figcaption>

      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => {
          const summary = [
            row.average === null ? "nobody has solved it yet" : `average ${format(row.average)}`,
            row.you === null ? null : `you ${format(row.you)}${row.solved ? "" : " so far"}`,
          ]
            .filter(Boolean)
            .join(", ");
          return (
            <li
              key={row.number}
              className="group relative grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_3.5rem] items-center gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_4rem]"
            >
              <span className="truncate text-sm">
                <span className="mr-2 font-mono text-xs text-taupe">{toRoman(row.number)}</span>
                <span className="italic">{row.title}</span>
              </span>

              <span className="relative h-4">
                {row.average !== null && (
                  <span
                    className="absolute inset-y-0 left-0 rounded-r bg-walnut transition-opacity group-hover:opacity-80"
                    style={{ width: at(row.average) }}
                  />
                )}
                {row.average === null && (
                  <span className="absolute inset-y-0 left-0 flex items-center text-xs text-taupe italic">
                    No solves yet
                  </span>
                )}
                {row.you !== null && (
                  <span
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                    style={{ left: at(row.you) }}
                  >
                    <Diamond solved={row.solved} />
                  </span>
                )}
              </span>

              <span className="text-right font-mono text-xs text-taupe">
                {row.average === null ? "–" : format(row.average)}
              </span>

              {/* Hover: both figures. Screen readers get the same as plain text. */}
              <span className="pointer-events-none absolute right-0 bottom-full z-10 hidden rounded bg-ink px-2 py-1 text-xs whitespace-nowrap text-paper group-hover:block">
                {row.title}: {summary}
              </span>
              <span className="sr-only">
                Machine {toRoman(row.number)}, {row.title}: {summary}.
              </span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
