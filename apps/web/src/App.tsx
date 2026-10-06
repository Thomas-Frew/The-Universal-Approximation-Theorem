import { useEffect, useRef } from "react";
import { AboutScreen } from "./screens/AboutScreen";
import { TitleScreen } from "./screens/TitleScreen";

const NEXT_KEYS = new Set(["ArrowDown", "PageDown", " "]);
const PREVIOUS_KEYS = new Set(["ArrowUp", "PageUp"]);

/** After the wheel changes screen, ignore it this long so one flick moves one screen. */
const WHEEL_COOLDOWN_MS = 700;

export function App() {
  const titleRef = useRef<HTMLElement>(null);
  const aboutRef = useRef<HTMLElement>(null);

  // Smoothness comes from `scroll-behavior` in index.css, so reduced-motion
  // users get an instant jump without any extra logic here.
  const showTitle = () => titleRef.current?.scrollIntoView();
  const showAbout = () => aboutRef.current?.scrollIntoView();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // Space on a focused button should press that button, not change screen.
      if (event.key === " " && event.target instanceof HTMLButtonElement) return;

      if (NEXT_KEYS.has(event.key)) {
        event.preventDefault();
        aboutRef.current?.scrollIntoView();
      } else if (PREVIOUS_KEYS.has(event.key)) {
        event.preventDefault();
        titleRef.current?.scrollIntoView();
      }
    };

    // A single mouse-wheel notch is too small to carry past the snap point on
    // its own, so treat any wheel movement as "go to the screen in that direction".
    let wheelLockedUntil = 0;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.deltaY === 0) return; // ctrl+wheel is pinch-zoom
      event.preventDefault();
      if (event.timeStamp < wheelLockedUntil) return;

      wheelLockedUntil = event.timeStamp + WHEEL_COOLDOWN_MS;
      const target = event.deltaY > 0 ? aboutRef : titleRef;
      target.current?.scrollIntoView();
    };

    window.addEventListener("keydown", onKeyDown);
    // `passive: false` is required for preventDefault to work on wheel events.
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("wheel", onWheel);
    };
  }, []);

  return (
    <main>
      <TitleScreen ref={titleRef} onNext={showAbout} />
      <AboutScreen ref={aboutRef} onBack={showTitle} />
    </main>
  );
}
