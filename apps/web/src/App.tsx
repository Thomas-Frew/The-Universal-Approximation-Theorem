import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { flushSync } from "react-dom";
import { prefersReducedMotion } from "./lib/motion";
import { preloadSounds } from "./lib/sound";
import { useLevel } from "./lib/useLevel";
import { IntroScreen } from "./screens/IntroScreen";
import { LevelScreen } from "./screens/LevelScreen";

// Until there is a router and a level select, the app is one of two screens,
// and the intro leads straight into the first level.
type Screen = "intro" | "level";

export function App() {
  const [screen, setScreen] = useState<Screen>("intro");
  // Asked for on first render, so level 1 has usually arrived by the time the
  // player has read the intro.
  const level = useLevel(1);

  useEffect(preloadSounds, []);

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

  if (screen === "intro") {
    // Whether this is the demo comes from the API with level 1; until it
    // answers, the about page simply says nothing about it.
    return (
      <IntroScreen onStart={startLevel} demo={level.status === "ready" && level.demo} />
    );
  }
  if (level.status === "ready") {
    return (
      <LevelScreen
        level={level.level}
        initialProgress={level.progress}
        demo={level.demo}
        onExit={showIntro}
      />
    );
  }
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 [view-transition-name:level]">
      {level.status === "loading" ? (
        <p className="text-taupe italic">Fetching the machine…</p>
      ) : (
        <p role="alert" className="text-oxblood">
          The machine could not be fetched. {level.message}
        </p>
      )}
      <button
        type="button"
        onClick={showIntro}
        className="cursor-pointer rounded-md border border-stone px-4 py-2 text-xs tracking-label uppercase outline-offset-4 outline-walnut hover:bg-linen focus-visible:outline-2"
      >
        Back
      </button>
    </main>
  );
}
