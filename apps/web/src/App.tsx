import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { excludeFromStats } from "./lib/api";
import { prefersReducedMotion } from "./lib/motion";
import { playSound, preloadSounds } from "./lib/sound";
import { useLevel, useLevelList } from "./lib/useLevel";
import { IntroScreen } from "./screens/IntroScreen";
import { LevelScreen } from "./screens/LevelScreen";
import { LevelSelectScreen } from "./screens/LevelSelectScreen";
import { StatsScreen } from "./screens/StatsScreen";

// No router yet: the app is one of four screens. The intro leads to the
// level select, which opens a level or the stats page; both return to the
// select. The demo has a single machine, so it skips the select both ways.
type Screen =
  | { name: "intro" }
  | { name: "select" }
  | { name: "level"; number: number }
  | { name: "stats" };

/**
 * The `?exclude=<token>` link leaves this browser's player out of global
 * stats. Read once on load, and taken out of the address straight away so
 * it is not bookmarked or shared by accident. Says how it went in a notice.
 */
function useExcludeLink(): string | null {
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("exclude");
    if (!token) return;
    url.searchParams.delete("exclude");
    window.history.replaceState(null, "", url);
    excludeFromStats(token).then(
      () => setNotice("This browser is now left out of global stats."),
      (error: unknown) => setNotice(error instanceof Error ? error.message : String(error)),
    );
  }, []);
  // The notice fades after a few seconds.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  return notice;
}

const backButton =
  "cursor-pointer rounded-md border border-stone px-4 py-2 text-xs tracking-label uppercase outline-offset-4 outline-walnut hover:bg-linen focus-visible:outline-2";

/** Fetches a level, then shows it; meanwhile, a short message. */
function LevelRoute({
  number,
  demo,
  onExit,
  onWiped,
}: {
  number: number;
  demo: boolean;
  onExit: () => void;
  onWiped: () => void;
}) {
  const level = useLevel(number);
  if (level.status === "ready") {
    return (
      <LevelScreen
        level={level.level}
        initialProgress={level.progress}
        demo={level.demo}
        onExit={onExit}
        onWiped={onWiped}
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
      <button type="button" onClick={onExit} className={backButton}>
        {demo ? "Back" : "Back to the machines"}
      </button>
    </main>
  );
}

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: "intro" });
  const current = useRef(screen);
  current.current = screen;

  // Asked for on first render: it says whether this is the demo, which
  // decides where the intro leads, and has usually arrived before the
  // player has read the intro.
  const list = useLevelList();
  const demo = list.status === "ready" && list.demo;

  useEffect(preloadSounds, []);

  // Each screen starts at the top, without the smooth-scroll animation.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [screen]);

  // A view transition photographs the page, lets us change it, then animates
  // from the old picture to the new one (see the ::view-transition rules in
  // index.css). flushSync makes React apply the change inside that window.
  // `data-from` and `data-to` tell the CSS which way we are going, since the
  // level select is entered and left both forwards and back.
  const show = useCallback((next: Screen) => {
    document.documentElement.dataset.from = current.current.name;
    document.documentElement.dataset.to = next.name;
    const update = () => flushSync(() => setScreen(next));
    if ("startViewTransition" in document && !prefersReducedMotion()) {
      document.startViewTransition(update);
    } else {
      update();
    }
  }, []);

  // Bumped when the player wipes their progress. It is part of each screen's
  // key, so the screen is replaced by a fresh one that refetches from the API.
  const [wipes, setWipes] = useState(0);
  // After a wipe every machine but the first is locked again, so go to the
  // start: the level select, or the demo's one machine. No transition: the
  // player stays where they were, only emptied.
  const afterWipe = useCallback(() => {
    setWipes((count) => count + 1);
    setScreen(demo ? { name: "level", number: 1 } : { name: "select" });
  }, [demo]);

  const showIntro = useCallback(() => show({ name: "intro" }), [show]);
  const showStats = useCallback(() => show({ name: "stats" }), [show]);
  const notice = useExcludeLink();
  const showSelect = useCallback(() => show({ name: "select" }), [show]);
  // Going into a machine and coming back out each have a sound: C, F, G
  // rising (enter.m4a), then the same falling back home (leave.m4a). Played
  // here, in the click, which is what lets the browser play sound at all.
  const openLevel = useCallback(
    (number: number) => {
      void playSound("enter");
      show({ name: "level", number });
    },
    [show],
  );
  const exitLevel = useCallback(
    (to: () => void) => () => {
      void playSound("leave");
      to();
    },
    [],
  );
  const leaveIntro = useCallback(
    () => (demo ? openLevel(1) : showSelect()),
    [demo, openLevel, showSelect],
  );

  let content: ReactNode;
  switch (screen.name) {
    case "intro":
      // Until the API answers, the about page simply says nothing about the demo.
      content = <IntroScreen onStart={leaveIntro} demo={demo} />;
      break;
    case "select":
      content = (
        <LevelSelectScreen
          key={wipes}
          onOpen={openLevel}
          onStats={showStats}
          onExit={showIntro}
          onWiped={afterWipe}
        />
      );
      break;
    case "stats":
      content = <StatsScreen key={wipes} onBack={showSelect} />;
      break;
    case "level":
      content = (
        <LevelRoute
          // A fresh screen per level, so no state carries over between them.
          key={`${screen.number}-${wipes}`}
          number={screen.number}
          demo={demo}
          onExit={exitLevel(demo ? showIntro : showSelect)}
          onWiped={afterWipe}
        />
      );
      break;
  }

  return (
    <>
      {content}
      {notice && (
        <p
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md border border-stone bg-vellum px-4 py-2 text-sm shadow"
        >
          {notice}
        </p>
      )}
    </>
  );
}
