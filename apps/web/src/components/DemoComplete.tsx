type DemoCompleteProps = {
  levelTitle: string;
  penalty: number;
  /**
   * Solved just now, on this screen: draw the panel in (see "Solving a level"
   * in index.css). Otherwise it simply appears, e.g. when reopening the demo.
   */
  celebrate: boolean;
};

/**
 * Takes the editor's place once the demo's only level is solved. The left
 * panel stays, so the player can still look back over their observations.
 */
export function DemoComplete({ levelTitle, penalty, celebrate }: DemoCompleteProps) {
  // Each piece takes its animation class only when celebrating. `--delay`
  // staggers them: seal, ornament, then the words.
  const play = (className: string) => (celebrate ? className : "");

  return (
    // Content only: it fills the same frame the editor was in (see LevelScreen).
    <div className="flex flex-1 flex-col items-center justify-center p-4 text-center">
      {/* A brass seal: a ring drawn round, then a tick. */}
      <svg viewBox="0 0 80 80" className="size-20 text-brass" aria-hidden="true">
        <circle
          cx="40"
          cy="40"
          r="36"
          pathLength={1}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={play("draw-stroke [--delay:100ms] [--duration:900ms]")}
        />
        <circle
          cx="40"
          cy="40"
          r="31"
          pathLength={1}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.75"
          className={play("draw-stroke [--delay:350ms] [--duration:900ms]")}
        />
        <path
          d="M27 41l9 9 17-19"
          pathLength={1}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={play("draw-stroke [--delay:1000ms] [--duration:450ms]")}
        />
      </svg>

      {/* The same brass ornament as the title screen. */}
      <div className="mt-8 flex items-center gap-4" aria-hidden="true">
        <span className={`h-px w-16 origin-right bg-brass ${play("draw-rule [--delay:1300ms]")}`} />
        <span className={`text-xl text-brass italic ${play("draw-fade [--delay:1500ms]")}`}>fin</span>
        <span className={`h-px w-16 origin-left bg-brass ${play("draw-rule [--delay:1300ms]")}`} />
      </div>

      <h2 className={`mt-8 text-4xl font-bold ${play("draw-rise [--delay:1700ms]")}`}>
        The full game is coming soon.
      </h2>
      <p className={`mt-4 text-lg text-taupe italic ${play("draw-rise [--delay:1900ms]")}`}>
        You solved {levelTitle} with a penalty of{" "}
        <span className="font-mono not-italic">{penalty}</span>.
      </p>
    </div>
  );
}
