import { DIFFICULTY_SCALE, isExtended, type LevelSummary, penaltyOf } from "@uat/shared";
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Label } from "../components/Label";
import { GuideButton } from "../components/GuideButton";
import { MuteButton } from "../components/MuteButton";
import { SettingsMenu } from "../components/SettingsMenu";
import { StatusBadge } from "../components/StatusBadge";
import { toRoman } from "../lib/roman";
import { useLevelList } from "../lib/useLevel";

type LevelSelectScreenProps = {
  onOpen: (number: number) => void;
  /** Opens the stats page. */
  onStats: () => void;
  onExit: () => void;
  /** After the settings menu has wiped the player's progress. */
  onWiped: () => void;
  onFeedback: () => void;
  onGuide: () => void;
  onAdmin: () => void;
};

// The grid's measurements, in pixels. The page size is however many cards of
// this size fit the space, so it follows the screen.
const CARD_HEIGHT = 176;
const GAP = 20;
/** Narrowest a card may be. On a phone that makes one column of full-width cards. */
const MIN_CARD_WIDTH = 230;
const MAX_COLUMNS = 6;

const buttonBase =
  "cursor-pointer rounded-md border border-stone bg-paper px-4 py-2 text-xs tracking-label uppercase outline-offset-4 outline-walnut hover:bg-linen focus-visible:outline-2 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent";

/** How many columns and rows of cards fit in the element, kept up to date as it resizes. */
function useGridCapacity(ref: RefObject<HTMLElement | null>) {
  const [capacity, setCapacity] = useState({ columns: 1, rows: 1 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      // n cards take n widths plus n - 1 gaps, so (space + gap) / (card + gap).
      const fit = (space: number, size: number) => Math.floor((space + GAP) / (size + GAP));
      setCapacity({
        columns: Math.min(MAX_COLUMNS, Math.max(1, fit(width, MIN_CARD_WIDTH))),
        rows: Math.max(1, fit(height, CARD_HEIGHT)),
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return capacity;
}

/** What the line along the bottom of a card says. */
function cardFooter(level: LevelSummary): { label: string; penalty?: number } {
  switch (level.status) {
    case "solved":
      return { label: "Penalty", penalty: penaltyOf(level) };
    case "in_progress":
      return { label: "Penalty so far", penalty: penaltyOf(level) };
    case "new":
      return { label: "Not started" };
    case "locked":
      return { label: "Locked" };
  }
}

function LockIcon() {
  return (
    <svg viewBox="0 0 12 14" className="h-3.5 w-3 text-taupe" aria-hidden="true">
      <rect x="1" y="6" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3.5 6V4a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** One pip per step of the difficulty scale (game.config.json), filled up to the level's difficulty. */
function Difficulty({ value, fill }: { value: number; fill: string }) {
  return (
    <span className="flex gap-1" role="img" aria-label={`Difficulty ${value} of ${DIFFICULTY_SCALE}`} title={`Difficulty ${value} of ${DIFFICULTY_SCALE}`}>
      {Array.from({ length: DIFFICULTY_SCALE }, (_, index) => (
        <span
          key={index}
          className={`size-1.5 rounded-full ${index < value ? fill : "bg-stone"}`}
        />
      ))}
    </span>
  );
}

function LevelCard({ level, onOpen }: { level: LevelSummary; onOpen: () => void }) {
  const locked = level.status === "locked";
  const extended = isExtended(level.difficulty);
  const footer = cardFooter(level);
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={locked}
      aria-label={`Machine ${toRoman(level.number)}: ${level.title}, difficulty ${level.difficulty} of ${DIFFICULTY_SCALE}${extended ? ", extended" : ""}${locked ? ", locked" : ""}`}
      // Every card has the same Stone outline, except extended levels (the
      // hardest, from game.config.json), which are marked in Oxblood: outline,
      // a band along the top, their pips and the word. Locked ones are told
      // apart by their faded fill and text, and the lock.
      className={`flex flex-col rounded-md border p-4 text-left outline-offset-4 outline-walnut transition-colors focus-visible:outline-2 ${
        extended ? "border-oxblood/60 shadow-[inset_0_3px_0_var(--color-oxblood)]" : "border-stone"
      } ${locked ? "cursor-default bg-vellum/50 text-taupe" : "cursor-pointer bg-vellum hover:bg-linen"}`}
    >
      {/* A fixed height, so a card with a badge lines up with one without. */}
      <span className="flex h-5 items-center justify-between gap-2">
        <Label>Machine {toRoman(level.number)}</Label>
        {locked ? <LockIcon /> : <StatusBadge status={level.status} size="small" />}
      </span>
      <span className="mt-3 flex flex-1 flex-col">
        <span className="line-clamp-2 text-lg leading-snug italic">{level.title}</span>
        <span className="mt-1 text-xs text-taupe">
          {level.solves === 0
            ? "Not yet solved"
            : `Solved by ${level.solves} ${level.solves === 1 ? "player" : "players"}`}
        </span>
      </span>
      {/* A fixed height, so the "Extended" word (taller than the pips) cannot
          grow this row and lift the pips above where other cards have them. */}
      <span className="mb-3 flex h-4 items-center justify-between gap-2">
        <Difficulty
          value={level.difficulty}
          fill={extended ? "bg-oxblood" : locked ? "bg-taupe" : "bg-walnut"}
        />
        {extended && (
          <span className="text-[0.625rem] leading-none tracking-label text-oxblood uppercase">Extended</span>
        )}
      </span>
      <span className="flex items-end justify-between border-t border-stone pt-2">
        <Label>{footer.label}</Label>
        {footer.penalty !== undefined && <span className="font-mono text-sm">{footer.penalty}</span>}
      </span>
    </button>
  );
}

/** The level select: every machine as a card, a page at a time, sized to the screen. */
export function LevelSelectScreen({ onOpen, onStats, onExit, onWiped, onFeedback, onGuide, onAdmin }: LevelSelectScreenProps) {
  const list = useLevelList();
  const gridRef = useRef<HTMLDivElement>(null);
  const { columns, rows } = useGridCapacity(gridRef);
  const perPage = columns * rows;

  const levels = list.status === "ready" ? list.levels : [];
  // The first machine not yet solved and not locked: where the player is up to.
  const current = levels.find((level) => level.status === "new" || level.status === "in_progress");

  // The page is kept as the index of its first level, not a page number, so
  // when a resize changes how many fit, the same machines stay in view.
  const [anchor, setAnchor] = useState(0);
  // Once the list arrives, start on the page with the current machine.
  useEffect(() => {
    if (current) setAnchor(current.number - 1);
  }, [current?.number]);

  const pageCount = Math.max(1, Math.ceil(levels.length / perPage));
  const page = Math.min(Math.floor(anchor / perPage), pageCount - 1);
  const shown = levels.slice(page * perPage, (page + 1) * perPage);
  const goTo = (next: number) => setAnchor(next * perPage);

  // Left and right arrow keys turn the page.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" && page < pageCount - 1) goTo(page + 1);
      if (event.key === "ArrowLeft" && page > 0) goTo(page - 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const solved = levels.filter((level) => level.status === "solved").length;
  const totalPenalty = levels.reduce((sum, level) => sum + penaltyOf(level), 0);

  return (
    // Exactly one screen tall: the grid takes what the header and pager leave.
    <main className="mx-auto flex h-dvh max-w-[min(104rem,94vw)] flex-col py-10 [view-transition-name:select]">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-8 border-b border-stone pb-4 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="col-span-2 row-start-2 lg:col-span-1 lg:row-start-1">
          <Label>The Universal Approximation Theorem</Label>
        </div>
        <h1 className="col-span-2 row-start-3 text-4xl font-bold lg:col-span-1 lg:row-start-2">Machines</h1>
        <div className="col-span-2 row-start-4 mt-4 flex gap-8 lg:col-span-1 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0">
          <div className="flex flex-col items-start whitespace-nowrap lg:items-end">
            <Label>Solved</Label>
            <span className="font-mono text-2xl">
              {solved} / {levels.length}
            </span>
          </div>
          <div className="flex flex-col items-start whitespace-nowrap lg:items-end">
            <Label>Total penalty</Label>
            <span className="font-mono text-2xl">{totalPenalty}</span>
          </div>
        </div>
        <div className="col-span-2 row-start-1 mb-4 flex items-center gap-3 lg:col-span-1 lg:col-start-3 lg:row-span-2 lg:mb-0 lg:ml-8 lg:self-end">
          <MuteButton />
          <SettingsMenu onWiped={onWiped} onFeedback={onFeedback} onAdmin={onAdmin} />
          <GuideButton onClick={onGuide} />
          <button type="button" onClick={onStats} className={buttonBase}>
            Stats
          </button>
          <button type="button" onClick={onExit} className={buttonBase}>
            Title
          </button>
        </div>
      </header>

      <div ref={gridRef} className="mt-8 min-h-0 flex-1">
        {list.status === "loading" && <p className="text-taupe italic">Fetching the machines…</p>}
        {list.status === "error" && (
          <p role="alert" className="text-oxblood">
            The machines could not be fetched. {list.message}
          </p>
        )}
        {list.status === "ready" && (
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gridAutoRows: `${CARD_HEIGHT}px`,
              gap: `${GAP}px`,
            }}
          >
            {shown.map((level) => (
              <LevelCard
                key={level.number}
                level={level}
                onOpen={() => onOpen(level.number)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Always laid out, and hidden when there is one page: if it came and
          went, the grid's space would change, and with it how many fit. */}
      <nav
        className={`mt-6 flex items-center justify-center gap-3 sm:gap-6 ${pageCount > 1 ? "" : "invisible"}`}
        aria-label="Pages"
      >
        <button type="button" onClick={() => goTo(page - 1)} disabled={page === 0} className={buttonBase}>
          Prev
        </button>
        {/* The current page sits in a slot as wide as the page count's digits
            (`ch` is the width of a "0"), with tabular figures, so the label is
            the same width on every page and "Page" and "of" never shift as
            the centred label re-centres around a narrower "1". */}
        <Label className="tracking-label whitespace-nowrap tabular-nums">
          Page{" "}
          <span className="inline-block text-center" style={{ width: `${String(pageCount).length}ch` }}>
            {page + 1}
          </span>{" "}
          of {pageCount}
        </Label>
        <button
          type="button"
          onClick={() => goTo(page + 1)}
          disabled={page === pageCount - 1}
          className={buttonBase}
        >
          Next
        </button>
      </nav>
    </main>
  );
}
