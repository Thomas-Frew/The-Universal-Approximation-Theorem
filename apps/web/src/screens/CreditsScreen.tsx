import { useSyncExternalStore } from "react";
import logoDark from "../../brand/logo-dark.png";
import logo from "../../brand/logo.png";
import { HeaderTools, NavButton } from "../components/HeaderTools";
import { Label } from "../components/Label";
import { currentTheme, subscribeTheme } from "../lib/theme";

type CreditsScreenProps = {
  onBack: () => void;
};

/**
 * Who the game is dedicated to, each with a short line of why. All the lines
 * keep one shape, so they read as a set. Placeholders for now.
 */
const DEDICATIONS = [
  { name: "Shalya Nguyen", line: "Driving force for young women in competitive programming" },
  { name: "Rory Peterson", line: "ACPC president and testament to the power of competitive programming" },
  { name: "Parsa Pordastan", line: "Competitive programming legend, and my personal inspiration" },
];

/**
 * Who made the game, under the owl, from the settings menu. The logo follows
 * the theme, as the tab icon does: cream ground on Paper, owl-brown on Coffee.
 */
export function CreditsScreen({ onBack }: CreditsScreenProps) {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme);
  return (
    <main className="mx-auto min-h-dvh max-w-[min(104rem,94vw)] py-10 [view-transition-name:credits]">
      {/* The same header grid as the other pages. */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-8 border-b border-stone pb-4">
        <div className="col-span-2 row-start-2 lg:col-span-1 lg:row-start-1">
          <Label>The Universal Approximation Theorem</Label>
        </div>
        <h1 className="col-span-2 row-start-3 text-4xl font-bold lg:col-span-1 lg:row-start-2">Credits</h1>
        <div className="col-span-2 row-start-1 mb-4 flex items-center gap-3 lg:col-span-1 lg:col-start-2 lg:row-span-2 lg:mb-0 lg:self-end">
          <HeaderTools />
          <NavButton onClick={onBack}>Back</NavButton>
        </div>
      </header>

      <div className="mx-auto mt-12 flex max-w-2xl flex-col items-center text-center">
        <img
          src={theme === "coffee" ? logoDark : logo}
          alt="The game's logo: an owl's face"
          width={192}
          height={192}
          className="size-48 rounded-md border border-stone"
        />
        <p className="mt-8 text-sm tracking-label text-taupe uppercase">Created by</p>
        <p className="mt-2 text-3xl font-bold">Thomas Frew</p>
        <p className="mt-8 text-sm tracking-label text-taupe uppercase">Dedicated to</p>
        {DEDICATIONS.map(({ name, line }, index) => (
          <div key={name} className={index === 0 ? "mt-2" : "mt-5"}>
            <p className="text-3xl font-bold">{name}</p>
            <p className="mt-1 text-taupe italic">{line}</p>
          </div>
        ))}
        {/* A thin rule with a brass diamond, as an ornament under the name. */}
        <div aria-hidden="true" className="mt-8 flex w-40 items-center gap-3">
          <span className="h-px flex-1 bg-stone" />
          <span className="size-1.5 rotate-45 bg-brass" />
          <span className="h-px flex-1 bg-stone" />
        </div>
        <p className="mt-8 text-taupe italic">Thank you for playing!</p>
      </div>
    </main>
  );
}
