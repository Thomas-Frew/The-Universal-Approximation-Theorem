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
          <span className="h-px w-[13vw] bg-brass" />
          <span className="text-[clamp(1.5rem,2.4vw,3rem)] text-brass italic">
            The
          </span>
          <span className="h-px w-[13vw] bg-brass" />
        </span>
        <span className="mt-4 block font-title text-[clamp(2.25rem,5vw,6.5rem)] leading-[1.15] font-bold uppercase">
          <span className="block">Universal Approximation</span>
          <span className="block">Theorem</span>
        </span>
      </h1>

      <div className="absolute bottom-12">
        <Keycap direction="down" label="Begin" showLabel bob onClick={onNext} />
      </div>
    </section>
  );
}
