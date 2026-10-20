import type { Ref } from "react";
import { Keycap } from "../components/Keycap";

type TitleScreenProps = {
  ref: Ref<HTMLElement>;
  onNext: () => void;
};

export function TitleScreen({ ref, onNext }: TitleScreenProps) {
  return (
    <section
      ref={ref}
      className="relative flex min-h-dvh snap-start flex-col items-center justify-center px-6 text-center sm:px-8"
    >
      <h1>
        <span className="flex items-center justify-center gap-6">
          {/* The rules are drawn outward from "The"; see "Drawing the title" in index.css. */}
          <span className="draw-rule h-px w-[13vw] origin-right bg-brass" />
          <span className="draw-fade text-[clamp(1.5rem,2.4vw,3rem)] text-brass italic [--delay:500ms]">
            The
          </span>
          <span className="draw-rule h-px w-[13vw] origin-left bg-brass" />
        </span>
        {/* 5vw on wide screens; on narrow ones 9vw, which makes the longest
            line, "APPROXIMATION" (about 9em wide in bold capitals), fill most
            of a phone's width with a margin to spare. Never below 3rem until
            9vw is smaller, never above 6.5rem. */}
        <span className="mt-4 block font-title text-[min(9vw,max(3rem,5vw),6.5rem)] leading-[1.15] font-bold uppercase">
          {/* Each word is drawn on its own, a quarter second after the last.
              They are inline blocks, so the first two still share a line where
              there is room and wrap apart where there is not. */}
          <span className="block">
            <span className="draw-ink inline-block [--delay:800ms]">Universal</span>{" "}
            <span className="draw-ink inline-block [--delay:1050ms]">Approximation</span>
          </span>
          <span className="draw-ink inline-block [--delay:1300ms]">Theorem</span>
        </span>
      </h1>

      <div className="draw-fade absolute bottom-12 [--delay:3000ms]">
        <Keycap direction="down" label="Begin" showLabel bob onClick={onNext} />
      </div>
    </section>
  );
}
