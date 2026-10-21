import type { Ref } from "react";
import { Keycap } from "../components/Keycap";

type AboutScreenProps = {
  ref: Ref<HTMLElement>;
  onBack: () => void;
  onStart: () => void;
  /** The public demo: say what it holds, and that more is coming. */
  demo: boolean;
};

export function AboutScreen({ ref, onBack, onStart, demo }: AboutScreenProps) {
  return (
    <section
      ref={ref}
      // Exactly one screen tall, with the keys at its top and bottom. The page
      // itself does not scroll during the intro (see IntroScreen), so when the
      // text is taller than the space between the keys, as on a phone, that
      // middle part scrolls on its own and the keys stay put.
      className="relative flex h-dvh snap-start flex-col items-center gap-8 px-6 py-12 sm:gap-12 sm:px-8"
    >
      <Keycap direction="up" label="Back to title" onClick={onBack} />

      {/* `my-auto` centres the text when it fits; unlike justify-center, it
          never pushes the top out of reach when it does not. */}
      <div className="flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto overscroll-contain">
        <div className="my-auto max-w-[80vw]">
          <h2 className="text-center text-[clamp(1.5rem,2.1vw,2.75rem)] text-brass italic">
            What Is the Universal Approximation Theorem?
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
            {demo && (
              <aside className="pt-7">
                <span className="mx-auto block h-px w-16 bg-brass" aria-hidden="true" />
                <p className="mt-10 text-taupe italic">
                  Note: This demo only has a single machine. The full game, with a whole
                  workshop of them, is coming soon.
                </p>
              </aside>
            )}
          </div>
        </div>
      </div>

      <Keycap direction="down" label="Start" showLabel onClick={onStart} />
    </section>
  );
}
