import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { wipeProgress } from "../lib/api";
import { isMuted, subscribeMuted, toggleMuted } from "../lib/sound";

type SettingsMenuProps = {
  /** Called once the player's progress is gone, to show the game from the start. */
  onWiped: () => void;
};

const rowButton =
  "cursor-pointer rounded-md border px-3 py-1.5 text-xs tracking-label uppercase outline-offset-2 outline-walnut transition-colors focus-visible:outline-2 disabled:cursor-default disabled:opacity-60";

/**
 * A gear that opens a small menu: sound on or off (the same setting as the
 * speaker button), and wiping the player's progress. Closes on a click
 * outside it or on Escape.
 */
export function SettingsMenu({ onWiped }: SettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const muted = useSyncExternalStore(subscribeMuted, isMuted);
  // Wiping takes two clicks: the first asks, the second does it.
  const [wipe, setWipe] = useState<"idle" | "confirm" | "working">("idle");
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    setWipe("idle");
    setError(null);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const confirmWipe = async () => {
    setWipe("working");
    setError(null);
    try {
      await wipeProgress();
      close();
      onWiped();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That did not work.");
      setWipe("confirm");
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Settings"
        title="Settings"
        className="flex size-9 cursor-pointer items-center justify-center rounded-md border border-stone text-taupe outline-offset-4 outline-walnut hover:bg-linen hover:text-ink focus-visible:outline-2"
      >
        {/* A gear: eight teeth evenly spaced around (10, 10), worked out
            rather than drawn by hand so it is exactly symmetric. */}
        <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <circle cx="10" cy="10" r="2.5" />
          <path
            strokeLinejoin="round"
            d="M8.60 4.17L8.91 1.87L11.09 1.87L11.40 4.17L13.13 4.88L14.97 3.48L16.52 5.03L15.12 6.87L15.83 8.60L18.13 8.91L18.13 11.09L15.83 11.40L15.12 13.13L16.52 14.97L14.97 16.52L13.13 15.12L11.40 15.83L11.09 18.13L8.91 18.13L8.60 15.83L6.87 15.12L5.03 16.52L3.48 14.97L4.88 13.13L4.17 11.40L1.87 11.09L1.87 8.91L4.17 8.60L4.88 6.87L3.48 5.03L5.03 3.48L6.87 4.88Z"
          />
        </svg>
      </button>

      {open && (
        // Phones: the width of the screen, 16px in from each side (fixed, with
        // no top set, so it stays just below the gear). Wider: a dropdown
        // under the gear, its right edge in line with the gear's.
        <div
          role="dialog"
          aria-label="Settings"
          className="fixed inset-x-4 z-20 mt-2 rounded-md sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:w-72 border border-stone bg-paper p-4 text-left shadow-[0_8px_24px_-12px_var(--color-ink)]"
        >
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm">Sound</span>
            <button
              type="button"
              role="switch"
              aria-checked={!muted}
              onClick={toggleMuted}
              className={`${rowButton} w-16 ${muted ? "border-stone bg-paper text-taupe hover:bg-linen" : "border-sage bg-sage text-paper"}`}
            >
              {muted ? "Off" : "On"}
            </button>
          </div>

          <div className="mt-4 border-t border-stone pt-4">
            {wipe === "idle" ? (
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm">Progress</span>
                <button
                  type="button"
                  onClick={() => setWipe("confirm")}
                  className={`${rowButton} border-stone bg-paper hover:bg-linen`}
                >
                  Wipe
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-taupe">
                  This deletes every observation and submission, on every machine. It cannot be undone.
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setWipe("idle")}
                    disabled={wipe === "working"}
                    className={`${rowButton} border-stone bg-paper hover:bg-linen`}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmWipe()}
                    disabled={wipe === "working"}
                    className={`${rowButton} border-oxblood bg-oxblood text-paper hover:bg-ink`}
                  >
                    {wipe === "working" ? "Wiping" : "Wipe it all"}
                  </button>
                </div>
              </>
            )}
            {error && (
              <p role="alert" className="mt-2 text-sm text-oxblood">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
