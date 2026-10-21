/** A question mark that opens the guide, styled like the speaker and gear beside it. */
export function GuideButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Guide"
      title="Guide"
      className="flex size-9 cursor-pointer items-center justify-center rounded-md border border-stone bg-paper text-taupe outline-offset-4 outline-walnut hover:bg-linen hover:text-ink focus-visible:outline-2"
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
        {/* The hook of the question mark, then its dot. */}
        <path d="M6.5 7a3.5 3.5 0 1 1 5.2 3.06c-1 .56-1.7 1.3-1.7 2.44v.5" />
        <path d="M10 16.5v.01" strokeWidth="2" />
      </svg>
    </button>
  );
}
