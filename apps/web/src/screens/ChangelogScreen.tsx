import { Fragment } from "react";
import { HeaderTools, NavButton } from "../components/HeaderTools";
import { Label } from "../components/Label";
import { CHANGELOG, formatChangelogDate } from "../lib/changelog";

type ChangelogScreenProps = {
  onBack: () => void;
};

/** A line of an entry, with `backticks` shown as code. */
function Inline({ text }: { text: string }) {
  // Splitting on the backticks puts the code at the odd positions.
  return text.split("`").map((part, index) =>
    index % 2 === 1 ? (
      <code key={index} className="font-mono text-[0.9em]">
        {part}
      </code>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

/**
 * What has changed in the game, newest first, from the settings menu. The
 * entries are files in `apps/web/changelog/` (`lib/changelog.ts`).
 */
export function ChangelogScreen({ onBack }: ChangelogScreenProps) {
  return (
    <main className="mx-auto min-h-dvh max-w-[min(104rem,94vw)] py-10 [view-transition-name:changelog]">
      {/* The same header grid as the level select and stats pages, so the
          buttons sit in the same place. */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-8 border-b border-stone pb-4">
        <div className="col-span-2 row-start-2 lg:col-span-1 lg:row-start-1">
          <Label>The Universal Approximation Theorem</Label>
        </div>
        <h1 className="col-span-2 row-start-3 text-4xl font-bold lg:col-span-1 lg:row-start-2">Changelog</h1>
        <div className="col-span-2 row-start-1 mb-4 flex items-center gap-3 lg:col-span-1 lg:col-start-2 lg:row-span-2 lg:mb-0 lg:self-end">
          <HeaderTools />
          <NavButton onClick={onBack}>Back</NavButton>
        </div>
      </header>

      <div className="mx-auto mt-8 flex max-w-3xl flex-col gap-6">
        {CHANGELOG.length === 0 && <p className="text-taupe italic">Nothing yet.</p>}
        {CHANGELOG.map((entry) => (
          <article key={entry.id} className="rounded-md border border-stone bg-vellum p-6">
            <Label>{formatChangelogDate(entry.date)}</Label>
            {entry.title && <h2 className="mt-1 text-xl italic">{entry.title}</h2>}
            <div className="mt-4 flex flex-col gap-2 leading-relaxed">
              {entry.blocks.map((block, index) =>
                block.kind === "item" ? (
                  <p key={index} className="relative pl-5">
                    <span aria-hidden="true" className="absolute left-0 text-brass">
                      ·
                    </span>
                    <Inline text={block.text} />
                  </p>
                ) : (
                  <p key={index}>
                    <Inline text={block.text} />
                  </p>
                ),
              )}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
