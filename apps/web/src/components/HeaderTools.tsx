import { createContext, type ReactNode, useContext } from "react";
import { GuideButton } from "./GuideButton";
import { MuteButton } from "./MuteButton";
import { SettingsMenu } from "./SettingsMenu";

/**
 * What the tools need from App: where each one leads, and which page is shown.
 * Provided once in `App.tsx`, so a screen shows the tools with a bare
 * `<HeaderTools />` instead of passing five callbacks down through its props.
 */
export type HeaderToolsActions = {
  /** After the settings menu has wiped the player's progress. */
  onWiped: () => void;
  onFeedback: () => void;
  onChangelog: () => void;
  onCredits: () => void;
  onSave: () => void;
  onAdmin: () => void;
  onMetrics: () => void;
  onSubmissions: () => void;
  onGuide: () => void;
  /** True on the guide itself, where the question mark has nowhere to go. */
  onGuidePage: boolean;
  onStats: () => void;
  /** True on the stats page itself, where Stats has nowhere to go. */
  onStatsPage: boolean;
};

export const HeaderToolsContext = createContext<HeaderToolsActions | null>(null);

/**
 * A word button in a page header, beside the tools: Menu, Back, Stats, Title.
 * All the same width, whatever the word, so the row lines up from page to
 * page. 84px holds the widest ("Stats") with room to spare, and still lets
 * a header's row (three tools and two of these) fit a 360px phone. With
 * `current`, it is the page already shown: pressed, and it does nothing.
 */
export function NavButton({
  onClick,
  current = false,
  children,
}: {
  onClick: () => void;
  current?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={current ? undefined : onClick}
      aria-current={current ? "page" : undefined}
      className={`w-21 shrink-0 rounded-md border border-stone py-2 text-center text-xs tracking-label uppercase outline-offset-4 outline-walnut focus-visible:outline-2 ${current ? "cursor-default bg-linen" : "cursor-pointer bg-paper hover:bg-linen"}`}
    >
      {children}
    </button>
  );
}

/**
 * The speaker, the gear and the question mark, on every page, in this order,
 * then Stats on every page but the title and about pages (`intro`). A
 * screen's own word button (Menu, Back, Title) goes after these.
 */
export function HeaderTools({ intro = false }: { intro?: boolean }) {
  const actions = useContext(HeaderToolsContext);
  if (!actions) throw new Error("HeaderTools needs a HeaderToolsContext provider (App.tsx).");
  const { onWiped, onFeedback, onChangelog, onCredits, onSave, onAdmin, onMetrics, onSubmissions, onGuide, onGuidePage, onStats, onStatsPage } = actions;
  return (
    <>
      <MuteButton />
      <SettingsMenu
        onWiped={onWiped}
        onFeedback={onFeedback}
        onChangelog={onChangelog}
        onCredits={onCredits}
        onSave={onSave}
        onAdmin={onAdmin}
        onMetrics={onMetrics}
        onSubmissions={onSubmissions}
      />
      <GuideButton onClick={onGuide} current={onGuidePage} />
      {!intro && (
        <NavButton onClick={onStats} current={onStatsPage}>
          Stats
        </NavButton>
      )}
    </>
  );
}
