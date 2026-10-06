import type { Ref } from "react";
import { Keycap } from "../components/Keycap";

type AboutScreenProps = {
  ref: Ref<HTMLElement>;
  onBack: () => void;
};

export function AboutScreen({ ref, onBack }: AboutScreenProps) {
  return (
    <section
      ref={ref}
      className="relative flex min-h-dvh snap-start flex-col items-center justify-center px-8"
    >
      <div className="absolute top-12">
        <Keycap direction="up" label="Back to title" onClick={onBack} />
      </div>

      <div className="max-w-[80vw]">
        <h2 className="text-center text-[clamp(1.75rem,3.1vw,4rem)] text-brass italic">
          What is the universal approximation theorem?
        </h2>
        {/* Placeholder blurb: replace with the real introduction. */}
        <p className="mt-10 text-[clamp(1.125rem,2.2vw,2.75rem)] leading-snug">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
          eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad
          minim veniam, quis nostrud exercitation ullamco laboris nisi ut
          aliquip ex ea commodo consequat.
        </p>
      </div>
    </section>
  );
}
