type KeycapProps = {
  direction: "up" | "down";
  /** Accessible name; also shown next to the key when `showLabel` is set. */
  label: string;
  showLabel?: boolean;
  /** Gently bob the key to draw the eye. Off for reduced-motion users. */
  bob?: boolean;
  onClick: () => void;
};

/** A keyboard-key shaped button with an arrow, used to move between screens. */
export function Keycap({
  direction,
  label,
  showLabel = false,
  bob = false,
  onClick,
}: KeycapProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`group flex cursor-pointer items-center gap-3 rounded-md outline-offset-8 outline-walnut focus-visible:outline-2 ${
        direction === "down" ? "flex-col" : "flex-col-reverse"
      }`}
    >
      {showLabel && (
        <span className="text-xs tracking-label text-taupe uppercase transition-colors group-hover:text-ink">
          {label}
        </span>
      )}
      <span className={bob ? "motion-safe:animate-bob" : undefined}>
        <span className="grid size-16 place-items-center rounded-md border-2 border-b-[5px] border-brass bg-paper text-brass transition-all group-hover:bg-linen group-active:translate-y-[3px] group-active:border-b-2">
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={`size-8 fill-none stroke-current stroke-2 ${
              direction === "up" ? "rotate-180" : ""
            }`}
          >
            <path d="M5 9l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </span>
    </button>
  );
}
