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
        <h2 className="text-center text-[clamp(1.5rem,2.1vw,2.75rem)] text-brass italic">
          What is the universal approximation theorem?
        </h2>

        <div className="mx-auto mt-14 max-w-[58ch] space-y-7 text-[clamp(1.0625rem,1.3vw,1.625rem)] leading-relaxed text-pretty">
          <p>
            The universal approximation theorem states that a neural network
            with a single hidden layer can approximate any continuous function
            on a bounded domain to arbitrary accuracy, given enough neurons.
          </p>
          <p>
            Your brain has a lot of neurons, and it is remarkably good at
            learning patterns from examples alone. Let's see just how good it
            is…
          </p>
        </div>
      </div>
    </section>
  );
}
