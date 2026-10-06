/**
 * How long a move between full screens takes. The CSS view transition in
 * index.css uses the same number (`--screen-transition`); keep them equal.
 */
export const SCREEN_TRANSITION_MS = 1100;

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Slow start, slow finish. Matches `--ease-screen` in index.css. */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * Scroll the page to `top` over SCREEN_TRANSITION_MS. The browser's own smooth
 * scrolling has a fixed speed, so we move the page ourselves, frame by frame.
 * Returns a function that stops the animation early.
 */
export function animateScrollTo(top: number, onDone: () => void): () => void {
  const from = window.scrollY;
  const root = document.documentElement;
  const jump = (y: number) => window.scrollTo({ top: y, behavior: "instant" });

  if (prefersReducedMotion() || from === top) {
    jump(top);
    onDone();
    return () => {};
  }

  // Scroll snapping would yank every in-between position to the nearest
  // screen, so switch it off for the duration.
  root.style.scrollSnapType = "none";
  const startedAt = performance.now();
  let frame = requestAnimationFrame(function step(now) {
    const progress = Math.min(1, (now - startedAt) / SCREEN_TRANSITION_MS);
    jump(from + (top - from) * easeInOutCubic(progress));
    if (progress < 1) {
      frame = requestAnimationFrame(step);
    } else {
      root.style.scrollSnapType = "";
      onDone();
    }
  });

  return () => {
    cancelAnimationFrame(frame);
    root.style.scrollSnapType = "";
  };
}
