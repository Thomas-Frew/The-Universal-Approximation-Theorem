/**
 * Lets at most `max` tasks run at once. One more is turned away at the door
 * (`busy` is thrown) rather than queued: under a flood, a queue would only
 * grow, and every waiting request would still hold a connection and memory.
 * A turned-away player is told to try again, and is charged nothing.
 *
 * Counts within this process only. Each Dokploy app (demo, live) is one
 * process, so each has its own gates.
 */
export function createGate(max: number, busy: () => Error) {
  let active = 0;
  return async function through<T>(task: () => Promise<T>): Promise<T> {
    if (active >= max) throw busy();
    active++;
    try {
      return await task();
    } finally {
      active--;
    }
  };
}
