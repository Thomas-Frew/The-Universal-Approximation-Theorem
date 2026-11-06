import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { ProfileResponse } from "@uat/shared";
import { type HeaderToolsActions, HeaderToolsContext } from "./components/HeaderTools";
import { refreshAdmin } from "./lib/admin";
import { claimAdmin, fetchLevel, fetchLevels, fetchProfile, type LevelListResponse, type LevelResponse } from "./lib/api";
import { prefersReducedMotion } from "./lib/motion";
import { reportMode } from "./lib/report";
import { playSound, prepareSound, preloadSounds, type Sound } from "./lib/sound";
import { useLevel, useLevelList } from "./lib/useLevel";
import { wasWelcomed } from "./lib/welcome";
import { IntroScreen } from "./screens/IntroScreen";
import { LevelScreen } from "./screens/LevelScreen";
import { LevelSelectScreen } from "./screens/LevelSelectScreen";
import { MetricsScreen } from "./screens/MetricsScreen";
import { SubmissionsScreen } from "./screens/SubmissionsScreen";
import { AdminScreen } from "./screens/AdminScreen";
import { GuideScreen } from "./screens/GuideScreen";
import { FeedbackScreen } from "./screens/FeedbackScreen";
import { SaveScreen } from "./screens/SaveScreen";
import { StatsScreen } from "./screens/StatsScreen";
import { ChangelogScreen } from "./screens/ChangelogScreen";
import { CreditsScreen } from "./screens/CreditsScreen";
import { WelcomeScreen } from "./screens/WelcomeScreen";

// No router yet: the app is one of a few screens. The intro leads to the
// level select (by way of the welcome page, which asks a new player's name,
// the first time), which opens a level; a level returns to the select. The
// demo has a single machine, so it skips the select both ways. The stats
// page, the guide (the question mark), the feedback page and, for admins,
// the page of player feedback each remember the screen they were opened
// from and go back to it.
//
// `prefetched` carries data fetched before the screen was shown (see `go`),
// so it can appear complete, in step with its sound.
type Screen =
  | { name: "intro" }
  | { name: "welcome"; prefetched?: ProfileResponse }
  | { name: "select"; prefetched?: LevelListResponse }
  | { name: "level"; number: number; prefetched?: LevelResponse }
  | { name: "stats"; back: Screen }
  | { name: "feedback"; back: Screen }
  | { name: "changelog"; back: Screen }
  | { name: "credits"; back: Screen }
  | { name: "save"; back: Screen }
  | { name: "guide"; back: Screen; focus?: string }
  | { name: "admin"; back: Screen }
  | { name: "metrics"; back: Screen }
  // `machine` filters it to start with; not kept in the address.
  | { name: "submissions"; back: Screen; machine?: number };

/**
 * The screen as the part of the address after `#`, so reloading the page
 * stays on it: `machines`, `machine/3`, `machine/3/guide`. A page opened from
 * another (stats, guide, ...) is its name after that screen's, so Back still
 * knows where to go. The title screen has none.
 */
function toHash(screen: Screen): string {
  switch (screen.name) {
    case "intro":
      return "";
    case "welcome":
      return "welcome";
    case "select":
      return "machines";
    case "level":
      return `machine/${screen.number}`;
    default: {
      const back = toHash(screen.back);
      return back ? `${back}/${screen.name}` : screen.name;
    }
  }
}

/** The reverse of `toHash`. Anything it does not recognise is the title screen. */
function fromHash(hash: string): Screen {
  const parts = hash.replace(/^#/, "").split("/").filter(Boolean);
  let screen: Screen = { name: "intro" };
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === "machines") screen = { name: "select" };
    else if (part === "welcome") screen = { name: "welcome" };
    else if (part === "machine" && /^[1-9]\d*$/.test(parts[i + 1] ?? "")) {
      screen = { name: "level", number: Number(parts[i + 1]) };
      i++;
    } else if (part === "stats" || part === "feedback" || part === "changelog" || part === "credits" || part === "save" || part === "guide" || part === "admin" || part === "metrics" || part === "submissions") {
      screen = { name: part, back: screen };
    } else return { name: "intro" };
  }
  return screen;
}

/**
 * The screen to go back to, without data fetched for it then: by the time the
 * player returns it is out of date, so the screen fetches afresh.
 */
function backTo(screen: Screen): Screen {
  return screen.name === "select" || screen.name === "level" || screen.name === "welcome"
    ? { ...screen, prefetched: undefined }
    : screen;
}

/** The longest a screen change waits for its data and sound before going anyway. */
const PREPARE_TIMEOUT_MS = 3000;

/**
 * The `?admin=<token>` link makes this browser's player an admin: left out of
 * global stats, and able to read every player's feedback. Read once on load,
 * and taken out of the address straight away so it is not bookmarked or
 * shared by accident. Says how it went in a notice. Also asks, on load,
 * whether this player is already an admin.
 */
function useAdminLink(): string | null {
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("admin");
    if (!token) {
      void refreshAdmin();
      return;
    }
    url.searchParams.delete("admin");
    window.history.replaceState(window.history.state, "", url);
    claimAdmin(token).then(
      () => setNotice("This browser is now an admin."),
      (error: unknown) => setNotice(error instanceof Error ? error.message : String(error)),
    ).finally(() => void refreshAdmin());
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
  "cursor-pointer rounded-md border border-stone bg-paper px-4 py-2 text-xs tracking-label uppercase outline-offset-4 outline-walnut hover:bg-linen focus-visible:outline-2";

/** Fetches a level, then shows it; meanwhile, a short message. */
function LevelRoute({
  number,
  prefetched,
  demo,
  onNext,
  onExit,
  onGuideLists,
}: {
  number: number;
  prefetched: LevelResponse | undefined;
  demo: boolean;
  onNext: () => void;
  onExit: () => void;
  onGuideLists: () => void;
}) {
  const level = useLevel(number, prefetched);
  if (level.status === "ready") {
    return (
      <LevelScreen
        level={level.level}
        initialProgress={level.progress}
        demo={level.demo}
        onNext={level.hasNext ? onNext : undefined}
        onExit={onExit}
        onGuideLists={onGuideLists}
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
  // Starts on the screen named in the address, so a reload stays put.
  const [screen, setScreen] = useState<Screen>(() => fromHash(window.location.hash));
  const current = useRef(screen);
  current.current = screen;

  // ...and keeps the address in step. A page opened from another (the guide,
  // stats, ...) is a new history entry, marked `opened`, so the browser's
  // Back leaves it just as the page's own Back does (`goBack`). Every other
  // change replaces the entry, so Back never walks through machines.
  const pushNext = useRef(false);
  useEffect(() => {
    const push = pushNext.current;
    pushNext.current = false;
    const url = new URL(window.location.href);
    url.hash = toHash(screen);
    if (url.href === window.location.href) return;
    if (push) window.history.pushState({ opened: true }, "", url);
    else window.history.replaceState(window.history.state, "", url);
  }, [screen]);

  // Where each screen was scrolled to when it was left, by its address, so
  // going back returns to the same place rather than the top.
  const scrolls = useRef(new Map<string, number>());
  const restoreScroll = useRef(false);

  // The level select's page, as the index of a machine on it: the first one
  // shown, or the machine just left, so Menu returns to the page holding it.
  // Forgotten on a wipe.
  const selectAnchor = useRef<number | undefined>(undefined);

  // Asked for on first render: it says whether this is the demo, which
  // decides where the intro leads, and has usually arrived before the
  // player has read the intro.
  const list = useLevelList();
  const demo = list.status === "ready" && list.demo;

  // Error reports say whether they came from the demo or the full game.
  useEffect(() => {
    if (list.status === "ready") reportMode(list.demo);
  }, [list]);

  useEffect(preloadSounds, []);

  // Each screen starts at the top, without the smooth-scroll animation, unless
  // it was gone back to: then where it was left. A screen that fetches its
  // data (a level) is short at first, so that keeps trying for a second,
  // until the page is tall enough to get there.
  useLayoutEffect(() => {
    const top = restoreScroll.current ? (scrolls.current.get(toHash(screen)) ?? 0) : 0;
    restoreScroll.current = false;
    window.scrollTo({ top, behavior: "instant" });
    if (top === 0) return;
    const until = performance.now() + 1000;
    let frame = 0;
    const retry = () => {
      if (Math.abs(window.scrollY - top) < 2 || performance.now() > until) return;
      window.scrollTo({ top, behavior: "instant" });
      frame = requestAnimationFrame(retry);
    };
    frame = requestAnimationFrame(retry);
    return () => cancelAnimationFrame(frame);
  }, [screen]);

  // A view transition photographs the page, lets us change it, then animates
  // from the old picture to the new one (see the ::view-transition rules in
  // index.css). flushSync makes React apply the change inside that window.
  // `data-from` and `data-to` tell the CSS which way we are going, since the
  // level select is entered and left both forwards and back.
  const show = useCallback((next: Screen) => {
    scrolls.current.set(toHash(current.current), window.scrollY);
    document.documentElement.dataset.from = current.current.name;
    document.documentElement.dataset.to = next.name;
    const update = () => flushSync(() => setScreen(next));
    if ("startViewTransition" in document && !prefersReducedMotion()) {
      document.startViewTransition(update);
    } else {
      update();
    }
  }, []);

  // Opens a page from the current screen, as a new history entry.
  const open = useCallback(
    (next: Screen) => {
      pushNext.current = true;
      show(next);
    },
    [show],
  );
  // A page's Back. If the page was opened from the screen it returns to, step
  // back through the browser's history (the listener below shows it), so the
  // two Backs agree; if not (an address bookmarked or typed), show it in place.
  const goBack = useCallback(
    (back: Screen) => {
      if ((window.history.state as { opened?: boolean } | null)?.opened) {
        window.history.back();
      } else {
        restoreScroll.current = true;
        show(back);
      }
    },
    [show],
  );

  // The browser's Back and Forward, and an address edited by hand (only the
  // part after `#`, which does not reload the page), move to that screen.
  // Writing the address above never fires this.
  useEffect(() => {
    const onHashChange = () => {
      if (window.location.hash.replace(/^#/, "") !== toHash(current.current)) {
        restoreScroll.current = true;
        show(fromHash(window.location.hash));
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [show]);

  // Bumped when the player wipes their progress. It is part of each screen's
  // key, so the screen is replaced by a fresh one that refetches from the API.
  const [wipes, setWipes] = useState(0);
  // After a wipe every machine but the first is locked again, so go to the
  // start: the level select, or the demo's one machine. No transition: the
  // player stays where they were, only emptied. On the title or about page
  // they are already at the start, so they stay there.
  const afterWipe = useCallback(() => {
    setWipes((count) => count + 1);
    selectAnchor.current = undefined;
    if (current.current.name === "intro" || current.current.name === "welcome") return;
    setScreen(demo ? { name: "level", number: 1 } : { name: "select" });
  }, [demo]);

  const showIntro = useCallback(() => show({ name: "intro" }), [show]);
  // A page opened from another remembers that one, to go back to it. The
  // tools are on every page, so a page can be asked for while it is already
  // shown (Settings, then Save key, on the save page): then nothing happens,
  // rather than stacking a second copy whose Back leads to the first.
  const showPage = useCallback(
    (name: "stats" | "feedback" | "changelog" | "credits" | "save" | "admin" | "metrics" | "guide") => {
      if (current.current.name !== name) open({ name, back: backTo(current.current) });
    },
    [open],
  );
  const showStats = useCallback(() => showPage("stats"), [showPage]);
  const showFeedback = useCallback(() => showPage("feedback"), [showPage]);
  const showChangelog = useCallback(() => showPage("changelog"), [showPage]);
  const showCredits = useCallback(() => showPage("credits"), [showPage]);
  const showSave = useCallback(() => showPage("save"), [showPage]);
  const showAdmin = useCallback(() => showPage("admin"), [showPage]);
  const showMetrics = useCallback(() => showPage("metrics"), [showPage]);
  // From the settings menu (every machine) or a machine's row on the metrics page.
  const showSubmissions = useCallback(
    (machine?: number) => {
      if (current.current.name !== "submissions") open({ name: "submissions", back: backTo(current.current), machine });
    },
    [open],
  );
  const showGuide = useCallback(() => showPage("guide"), [showPage]);
  const showGuideLists = useCallback(
    () => open({ name: "guide", back: backTo(current.current), focus: "lists" }),
    [open],
  );
  const notice = useAdminLink();

  // A screen change that has data to fetch, and perhaps a sound, waits for
  // both, then starts the sound and the transition together, so what is
  // heard matches what is seen (rather than the sound playing over "Fetching
  // the machine…"). If either takes too long it goes anyway, and the screen
  // fetches for itself. Clicks while one is under way are ignored.
  const going = useRef(false);
  const go = useCallback(
    async (fetch: () => Promise<Screen>, fallback: Screen, sound?: Sound) => {
      if (going.current) return;
      going.current = true;
      // Called in the click, which is what lets the browser play sound at all.
      const soundReady = sound ? prepareSound(sound) : Promise.resolve();
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), PREPARE_TIMEOUT_MS));
      const next = await Promise.race([
        Promise.all([fetch().catch(() => fallback), soundReady]).then(([screen]) => screen),
        timeout,
      ]);
      going.current = false;
      if (sound) void playSound(sound);
      show(next ?? fallback);
    },
    [show],
  );

  const showSelect = useCallback(
    (sound?: Sound) =>
      void go(
        async () => ({ name: "select", prefetched: await fetchLevels() }),
        { name: "select" },
        sound,
      ),
    [go],
  );
  // Going into a machine and coming back out each have a sound: a half
  // cadence rising (enter.m4a), then its mirror settling home (leave.m4a).
  const openLevel = useCallback(
    (number: number) =>
      void go(
        async () => ({ name: "level", number, prefetched: await fetchLevel(number) }),
        { name: "level", number },
        "enter",
      ),
    [go],
  );
  const exitLevel = useCallback(() => {
    if (demo) {
      void playSound("leave");
      showIntro();
    } else {
      // Back on the page with the machine just left, which after "Next
      // machine" may not be the page it was first opened from.
      const from = current.current;
      if (from.name === "level") selectAnchor.current = from.number - 1;
      showSelect("leave");
    }
  }, [demo, showIntro, showSelect]);
  // A new player (no progress, and not welcomed in this browser) is asked
  // their name first. The demo goes straight to its one machine.
  const leaveIntro = useCallback(() => {
    if (demo) return openLevel(1);
    if (wasWelcomed()) return showSelect();
    void go(
      async () => {
        const profile = await fetchProfile();
        return profile.hasProgress
          ? { name: "select", prefetched: await fetchLevels() }
          : { name: "welcome", prefetched: profile };
      },
      { name: "select" },
    );
  }, [demo, go, openLevel, showSelect]);

  let content: ReactNode;
  switch (screen.name) {
    case "intro":
      // Until the API answers, the about page simply says nothing about the demo.
      content = <IntroScreen onStart={leaveIntro} demo={demo} />;
      break;
    case "welcome":
      content = (
        <WelcomeScreen
          key={wipes}
          initialProfile={screen.prefetched}
          onContinue={() => showSelect()}
          onExit={showIntro}
        />
      );
      break;
    case "select":
      content = (
        <LevelSelectScreen
          key={wipes}
          initialList={screen.prefetched}
          initialAnchor={selectAnchor.current}
          onAnchor={(anchor) => {
            selectAnchor.current = anchor;
          }}
          onOpen={openLevel}
          onExit={showIntro}
        />
      );
      break;
    case "stats": {
      const back = screen.back;
      content = <StatsScreen key={wipes} onBack={() => goBack(back)} />;
      break;
    }
    case "admin": {
      const back = screen.back;
      content = <AdminScreen onBack={() => goBack(back)} />;
      break;
    }
    case "metrics": {
      const back = screen.back;
      content = <MetricsScreen onBack={() => goBack(back)} onOpenSubmissions={showSubmissions} />;
      break;
    }
    case "submissions": {
      const back = screen.back;
      content = <SubmissionsScreen onBack={() => goBack(back)} machine={screen.machine} />;
      break;
    }
    case "guide": {
      const back = screen.back;
      // The save page opened from here comes back here, without the jump to
      // a pattern that a `\guide{}` link asked for on the way in.
      const guide = { ...screen, focus: undefined };
      content = (
        <GuideScreen
          onBack={() => goBack(back)}
          onOpenSave={() => open({ name: "save", back: guide })}
          focus={screen.focus}
        />
      );
      break;
    }
    case "feedback": {
      const back = screen.back;
      content = <FeedbackScreen onBack={() => goBack(back)} />;
      break;
    }
    case "changelog": {
      const back = screen.back;
      content = <ChangelogScreen onBack={() => goBack(back)} />;
      break;
    }
    case "credits": {
      const back = screen.back;
      content = <CreditsScreen onBack={() => goBack(back)} />;
      break;
    }
    case "save": {
      const back = screen.back;
      content = <SaveScreen onBack={() => goBack(back)} />;
      break;
    }
    case "level":
      content = (
        <LevelRoute
          // A fresh screen per level, so no state carries over between them.
          key={`${screen.number}-${wipes}`}
          number={screen.number}
          prefetched={screen.prefetched}
          demo={demo}
          onNext={() => openLevel(screen.number + 1)}
          onExit={exitLevel}
          onGuideLists={showGuideLists}
        />
      );
      break;
  }

  // The speaker, gear, question mark and Stats on every page read these
  // (`HeaderTools`), so no screen has to pass them down.
  const onGuidePage = screen.name === "guide";
  const onStatsPage = screen.name === "stats";
  const tools = useMemo<HeaderToolsActions>(
    () => ({
      onWiped: afterWipe,
      onFeedback: showFeedback,
      onChangelog: showChangelog,
      onCredits: showCredits,
      onSave: showSave,
      onAdmin: showAdmin,
      onMetrics: showMetrics,
      onSubmissions: showSubmissions,
      onGuide: showGuide,
      onGuidePage,
      onStats: showStats,
      onStatsPage,
    }),
    [afterWipe, showFeedback, showChangelog, showCredits, showSave, showAdmin, showMetrics, showSubmissions, showGuide, onGuidePage, showStats, onStatsPage],
  );

  return (
    <HeaderToolsContext value={tools}>
      {content}
      {notice && (
        <p
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md border border-stone bg-vellum px-4 py-2 text-sm shadow"
        >
          {notice}
        </p>
      )}
    </HeaderToolsContext>
  );
}
