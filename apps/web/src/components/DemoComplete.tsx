import { useState } from "react";

type DemoCompleteProps = {
  /** What the machine does, in words; the API sends it once the level is solved. */
  solution: string | undefined;
  /**
   * Solved just now, on this screen: draw the panel in (see "Solving a level"
   * in index.css). Otherwise it simply appears, e.g. when reopening the demo.
   */
  celebrate: boolean;
  /** Clears the player's progress and returns them to the start of the level. */
  onStartAgain: () => Promise<void>;
};

const buttonBase =
  "cursor-pointer rounded-md border px-6 py-3 text-xs tracking-label uppercase outline-offset-4 outline-walnut transition-colors focus-visible:outline-2 disabled:cursor-default disabled:opacity-60";

/**
 * Takes the editor's place once the demo's only level is solved. The left
 * panel stays, so the player can still look back over their observations.
 */
export function DemoComplete({ solution, celebrate, onStartAgain }: DemoCompleteProps) {
  // Starting again erases the player's log and submissions, so it takes two
  // clicks: the first asks, the second does it.
  const [step, setStep] = useState<"idle" | "confirm" | "working">("idle");
  const [error, setError] = useState<string | null>(null);

  const startAgain = async () => {
    setStep("working");
    setError(null);
    try {
      await onStartAgain();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That did not work.");
      setStep("confirm");
    }
  };

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
      {solution && (
        <p className={`mt-4 max-w-xl text-lg text-taupe italic ${play("draw-rise [--delay:1900ms]")}`}>
          Solution: {solution}
        </p>
      )}

      <div className={`mt-10 flex flex-col items-center gap-3 ${play("draw-rise [--delay:2300ms]")}`}>
        {step === "idle" ? (
          <button
            type="button"
            onClick={() => setStep("confirm")}
            className={`${buttonBase} border-stone bg-paper hover:bg-linen`}
          >
            Start again
          </button>
        ) : (
          <>
            <p className="text-sm text-taupe">This clears your observations and submissions.</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep("idle")}
                disabled={step === "working"}
                className={`${buttonBase} border-stone bg-paper hover:bg-linen`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void startAgain()}
                disabled={step === "working"}
                className={`${buttonBase} border-walnut bg-walnut text-paper hover:bg-ink`}
              >
                {step === "working" ? "Clearing" : "Clear and start again"}
              </button>
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="text-sm text-oxblood">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
