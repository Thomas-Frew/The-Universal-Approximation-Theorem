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
      className="relative flex min-h-dvh snap-start flex-col items-center justify-center px-8 text-center"
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
        <span className="mt-4 block font-title text-[clamp(2.25rem,5vw,6.5rem)] leading-[1.15] font-bold uppercase">
          <span className="draw-ink block [--delay:800ms]">Universal Approximation</span>
          <span className="draw-ink block [--delay:1400ms]">Theorem</span>
        </span>
      </h1>

      <div className="draw-fade absolute bottom-12 [--delay:3000ms]">
        <Keycap direction="down" label="Begin" showLabel bob onClick={onNext} />
      </div>
    </section>
  );
}
