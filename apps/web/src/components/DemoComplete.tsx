type DemoCompleteProps = {
  levelTitle: string;
  penalty: number;
};

/**
 * Takes the editor's place once the demo's only level is solved. The left
 * panel stays, so the player can still look back over their observations.
 */
export function DemoComplete({ levelTitle, penalty }: DemoCompleteProps) {
  return (
    <section className="flex min-h-[40rem] flex-col items-center justify-center rounded-md border border-stone bg-vellum p-10 text-center">
      {/* The same brass ornament as the title screen. */}
      <div className="flex items-center gap-4" aria-hidden="true">
        <span className="h-px w-16 bg-brass" />
        <span className="text-xl text-brass italic">fin</span>
        <span className="h-px w-16 bg-brass" />
      </div>

      <p className="mt-8 text-xs tracking-label text-taupe uppercase">Demo complete</p>
      <h2 className="mt-3 text-4xl font-bold">The full game is coming soon.</h2>
      <p className="mt-4 text-lg text-taupe italic">
        You solved {levelTitle} with a penalty of{" "}
        <span className="font-mono not-italic">{penalty}</span>.
      </p>
    </section>
  );
}
