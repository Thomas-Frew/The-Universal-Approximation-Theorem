/**
 * How long a move between full screens takes, and its slow-start, slow-finish
 * curve. The CSS view transition in index.css uses the same values
 * (`--screen-transition`, `--ease-screen`); keep them equal.
 */
export const SCREEN_TRANSITION_MS = 1100;
const SCREEN_EASING = "cubic-bezier(0.65, 0, 0.35, 1)";

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Scroll the page to `top`, making `content` appear to glide there.
 *
 * Scrolling a little on every frame from JavaScript is choppy: each step runs
 * on the main thread and makes the browser lay out and paint again. Instead we
 * jump the scroll position at once, shift `content` back by the same distance
 * so nothing appears to have moved, and animate that shift away. A transform
 * animation runs on the GPU compositor, off the main thread, at the display's
 * full refresh rate.
 *
 * Returns a function that stops the animation early.
 */
export function slideScrollTo(
  content: HTMLElement,
  top: number,
  onDone: () => void,
): () => void {
  const distance = top - window.scrollY;
  window.scrollTo({ top, behavior: "instant" });

  if (distance === 0 || prefersReducedMotion()) {
    onDone();
    return () => {};
  }

  // Snap points move with the shifted content, and the browser would keep
  // re-snapping to them and cancel out the glide. Switch snapping off meanwhile.
  const root = document.documentElement;
  root.style.scrollSnapType = "none";
  const restoreSnap = () => {
    root.style.scrollSnapType = "";
  };

  const animation = content.animate(
    [{ transform: `translateY(${distance}px)` }, { transform: "translateY(0)" }],
    { duration: SCREEN_TRANSITION_MS, easing: SCREEN_EASING },
  );
  // `finished` rejects if the animation is cancelled; that is not an error here.
  animation.finished.then(
    () => {
      restoreSnap();
      onDone();
    },
    () => {},
  );
  return () => {
    animation.cancel();
    restoreSnap();
  };
}
