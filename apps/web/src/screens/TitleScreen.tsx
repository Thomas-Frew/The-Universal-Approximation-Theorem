import { type Ref, useEffect } from "react";
import { Keycap } from "../components/Keycap";
import { playWhenAllowed } from "../lib/sound";

type TitleScreenProps = {
  ref: Ref<HTMLElement>;
  onNext: () => void;
};

export function TitleScreen({ ref, onNext }: TitleScreenProps) {
  // The title tune, each time the title is shown. On a first visit the
  // browser holds all sound until the first click or key press, so then it
  // starts on that (usually Begin) and carries on over the about page.
  useEffect(() => playWhenAllowed("title"), []);

  return (
    <section
      ref={ref}
      className="relative flex min-h-dvh snap-start flex-col items-center justify-center px-6 text-center sm:px-8"
    >
      {/* The whole title, rules and all, emerges at once; see "Revealing the
          title" in index.css. */}
      <h1 className="title-reveal">
        <span className="flex items-center justify-center gap-6">
          <span className="h-px w-[13vw] bg-brass" />
          <span className="text-[clamp(1.5rem,2.4vw,3rem)] text-brass italic">The</span>
          <span className="h-px w-[13vw] bg-brass" />
        </span>
        {/* 5vw on wide screens; on narrow ones 9vw, which makes the longest
            line, "APPROXIMATION" (about 9em wide in bold capitals), fill most
            of a phone's width with a margin to spare. Never below 3rem until
            9vw is smaller, never above 6.5rem. */}
        <span className="mt-4 block font-title text-[min(9vw,max(3rem,5vw),6.5rem)] leading-[1.15] font-bold uppercase">
          {/* "Theorem" has a line of its own; the first two words share one
              where there is room and wrap apart where there is not. */}
          <span className="block">Universal Approximation</span>
          Theorem
        </span>
      </h1>

      <div className="draw-fade absolute bottom-12 [--delay:3000ms]">
        <Keycap direction="down" label="Begin" showLabel bob onClick={onNext} />
      </div>
    </section>
  );
}
