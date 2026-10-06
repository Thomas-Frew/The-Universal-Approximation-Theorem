import { useCallback, useLayoutEffect, useState } from "react";
import { flushSync } from "react-dom";
import { placeholderLevel } from "./fixtures/placeholderLevel";
import { prefersReducedMotion } from "./lib/motion";
import { IntroScreen } from "./screens/IntroScreen";
import { LevelScreen } from "./screens/LevelScreen";

// Until there is a router and a level select, the app is one of two screens,
// and the intro leads straight into the first level.
type Screen = "intro" | "level";

export function App() {
  const [screen, setScreen] = useState<Screen>("intro");

  // Each screen starts at the top, without the smooth-scroll animation.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [screen]);

  // A view transition photographs the page, lets us change it, then animates
  // from the old picture to the new one (see the ::view-transition rules in
  // index.css). flushSync makes React apply the change inside that window.
  const show = useCallback((next: Screen) => {
    const update = () => flushSync(() => setScreen(next));
    if ("startViewTransition" in document && !prefersReducedMotion()) {
      document.startViewTransition(update);
    } else {
      update();
    }
  }, []);

  const startLevel = useCallback(() => show("level"), [show]);
  const showIntro = useCallback(() => show("intro"), [show]);

  return screen === "intro" ? (
    <IntroScreen onStart={startLevel} />
  ) : (
    <LevelScreen level={placeholderLevel} onExit={showIntro} />
  );
}
