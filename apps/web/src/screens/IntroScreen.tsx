import { useCallback, useEffect, useRef } from "react";
import { slideScrollTo } from "../lib/motion";
import { AboutScreen } from "./AboutScreen";
import { TitleScreen } from "./TitleScreen";

const NEXT_KEYS = new Set(["ArrowDown", "PageDown", " "]);
const PREVIOUS_KEYS = new Set(["ArrowUp", "PageUp"]);

/** After the wheel changes screen, ignore it at least this long. */
const WHEEL_COOLDOWN_MS = 700;
/** Wheel events closer together than this belong to the same flick. */
const WHEEL_GESTURE_GAP_MS = 150;

type IntroScreenProps = {
  /** Called when the player moves on past the about page. */
  onStart: () => void;
};

/** The title page and the about page, stacked, with one-screen-at-a-time navigation. */
export function IntroScreen({ onStart }: IntroScreenProps) {
  const mainRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLElement>(null);
  const aboutRef = useRef<HTMLElement>(null);

  // While a slide is running, further input is ignored. `stopSlide` cancels it.
  const sliding = useRef(false);
  const stopSlide = useRef(() => {});

  const slideTo = useCallback((section: HTMLElement | null) => {
    if (!section || !mainRef.current || sliding.current) return;
    sliding.current = true;
    stopSlide.current = slideScrollTo(mainRef.current, section.offsetTop, () => {
      sliding.current = false;
    });
  }, []);

  const showTitle = useCallback(() => slideTo(titleRef.current), [slideTo]);
  const showAbout = useCallback(() => slideTo(aboutRef.current), [slideTo]);

  // Leaving the intro mid-slide must not leave the animation running.
  useEffect(() => () => stopSlide.current(), []);

  useEffect(() => {
    const isOnAbout = () => {
      const about = aboutRef.current;
      return about !== null && window.scrollY >= about.offsetTop - 4;
    };
    // Forward from the title is the about page; forward from there starts the game.
    const forward = () => {
      if (sliding.current) return;
      if (isOnAbout()) onStart();
      else showAbout();
    };
    const back = showTitle;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // Space on a focused button should press that button, not change screen.
      if (event.key === " " && event.target instanceof HTMLButtonElement) return;

      if (NEXT_KEYS.has(event.key)) {
        event.preventDefault();
        forward();
      } else if (PREVIOUS_KEYS.has(event.key)) {
        event.preventDefault();
        back();
      }
    };

    // A single mouse-wheel notch is too small to carry past the snap point on
    // its own, so treat each flick of the wheel as "go one screen that way".
    // A trackpad keeps sending events while it coasts; those must not count as
    // a second flick, or one swipe on the title would run straight into the game.
    let lastWheelAt = -Infinity;
    let wheelLockedUntil = 0;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.deltaY === 0) return; // ctrl+wheel is pinch-zoom
      event.preventDefault();

      const isNewFlick = event.timeStamp - lastWheelAt > WHEEL_GESTURE_GAP_MS;
      lastWheelAt = event.timeStamp;
      if (!isNewFlick || event.timeStamp < wheelLockedUntil) return;

      wheelLockedUntil = event.timeStamp + WHEEL_COOLDOWN_MS;
      if (event.deltaY > 0) forward();
      else back();
    };

    window.addEventListener("keydown", onKeyDown);
    // `passive: false` is required for preventDefault to work on wheel events.
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("wheel", onWheel);
    };
  }, [onStart, showAbout, showTitle]);

  return (
    <main ref={mainRef} className="[view-transition-name:intro]">
      <TitleScreen ref={titleRef} onNext={showAbout} />
      <AboutScreen ref={aboutRef} onBack={showTitle} onStart={onStart} />
    </main>
  );
}
