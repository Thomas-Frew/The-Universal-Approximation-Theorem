import { formatMean, GameEntries, LevelEntries, LevelMeans } from "../components/AdminFeedback";
import { Label } from "../components/Label";
import { fetchAdminFeedback } from "../lib/api";
import { toRoman } from "../lib/roman";
import { useRemote } from "../lib/useRemote";

type AdminScreenProps = {
  onBack: () => void;
};

const buttonBase =
  "cursor-pointer rounded-md border border-stone bg-paper px-4 py-2 text-xs tracking-label uppercase outline-offset-4 outline-walnut hover:bg-linen focus-visible:outline-2";

/**
 * Admins only (the API refuses anyone else): what players have said about
 * the game as a whole, and about each machine, with the averages of their
 * ratings on its current version.
 */
export function AdminScreen({ onBack }: AdminScreenProps) {
  const report = useRemote(fetchAdminFeedback, "admin");

  return (
    <main className="mx-auto min-h-dvh max-w-[min(104rem,94vw)] py-10 [view-transition-name:admin]">
      {/* The same header grid as the level select and stats pages. */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-8 border-b border-stone pb-4">
        <div className="col-start-1 row-start-1">
          <Label>Admin</Label>
        </div>
        <h1 className="col-span-2 row-start-2 text-4xl font-bold lg:col-span-1">Player Feedback</h1>
        <div className="col-start-2 row-start-1 flex items-center gap-3 self-start lg:row-span-2 lg:self-end">
          <button type="button" onClick={onBack} className={buttonBase}>
            Back
          </button>
        </div>
      </header>

      {report.status === "loading" && <p className="mt-8 text-taupe italic">Fetching…</p>}
      {report.status === "error" && (
        <p role="alert" className="mt-8 text-oxblood">
          The feedback could not be fetched. {report.message}
        </p>
      )}
      {report.status === "ready" && (
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <section>
            <h2 className="text-xl italic">The Game</h2>
            <div className="mt-4 rounded-md border border-stone bg-vellum p-5">
              <div className="mb-5 flex gap-8">
                <div className="flex flex-col">
                  <Label>Messages</Label>
                  <span className="font-mono text-2xl">{report.game.entries.length}</span>
                </div>
                <div className="flex flex-col">
                  <Label>Overall</Label>
                  <span className="font-mono text-2xl">{formatMean(report.game.mean)}</span>
                </div>
              </div>
              <GameEntries entries={report.game.entries} />
            </div>
          </section>

          <section>
            <h2 className="text-xl italic">Per Machine</h2>
            <p className="mt-1 text-sm text-taupe">
              Averages are over each machine's current version. Open a machine for every response.
            </p>
            {/* Column names for the rows below, on screens wide enough for them. */}
            <div className="mt-4 hidden grid-cols-[minmax(0,1fr)_repeat(4,6.5rem)] gap-x-6 px-5 text-right sm:grid [&>*]:leading-tight">
              <span />
              <Label>Responses</Label>
              <Label>Overall</Label>
              <Label>Working out</Label>
              <Label>Code</Label>
            </div>
            <ul className="mt-4 flex flex-col gap-2 sm:mt-2">
              {report.levels.map((level) => {
                const current = level.entries.filter((entry) => entry.current).length;
                return (
                  <li key={level.number}>
                    {/* A native disclosure: keyboard and screen readers for free. */}
                    <details className="group rounded-md border border-stone bg-vellum">
                      <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-1 rounded-md px-5 py-3 outline-offset-2 outline-walnut hover:bg-linen focus-visible:outline-2 sm:grid-cols-[minmax(0,1fr)_repeat(4,6.5rem)]">
                        <span className="truncate">
                          <span className="mr-2 font-mono text-xs text-taupe">{toRoman(level.number)}</span>
                          <span className="italic">{level.title}</span>
                        </span>
                        <span className="text-right font-mono text-sm">
                          {current}
                          <span className="ml-1 font-display text-xs text-taupe sm:hidden">{current === 1 ? "response" : "responses"}</span>
                        </span>
                        <span className="hidden text-right font-mono text-sm sm:block">{formatMean(level.means.overall)}</span>
                        <span className="hidden text-right font-mono text-sm sm:block">{formatMean(level.means.understanding)}</span>
                        <span className="hidden text-right font-mono text-sm sm:block">{formatMean(level.means.implementation)}</span>
                      </summary>
                      <div className="flex flex-col gap-5 border-t border-stone px-5 py-4">
                        <LevelMeans level={level} />
                        <LevelEntries entries={level.entries} />
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
    </main>
  );
}
