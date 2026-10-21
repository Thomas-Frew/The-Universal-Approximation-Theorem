import { useSyncExternalStore } from "react";
import { isMuted, subscribeMuted, toggleMuted } from "../lib/sound";

/** A speaker that toggles every sound in the game, remembered per browser. */
export function MuteButton() {
  const muted = useSyncExternalStore(subscribeMuted, isMuted);
  const label = muted ? "Unmute sound" : "Mute sound";

  return (
    <button
      type="button"
      onClick={toggleMuted}
      aria-pressed={muted}
      aria-label={label}
      title={label}
      className="flex size-9 cursor-pointer items-center justify-center rounded-md border border-stone text-taupe outline-offset-4 outline-walnut hover:bg-linen hover:text-ink focus-visible:outline-2"
    >
      <svg
        viewBox="0 0 20 20"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* The speaker. */}
        <path d="M3 7.5h3l4-3.5v12l-4-3.5H3z" />
        {muted ? (
          // A cross where the sound would be.
          <path d="M13.5 8l4 4m0-4l-4 4" />
        ) : (
          // Two arcs of sound.
          <path d="M13.5 7.5a3.5 3.5 0 0 1 0 5M15.8 5.2a6.8 6.8 0 0 1 0 9.6" />
        )}
      </svg>
    </button>
  );
}
