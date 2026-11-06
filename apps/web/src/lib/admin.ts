import { useSyncExternalStore } from "react";
import { fetchIsAdmin } from "./api";

/**
 * Whether this browser's player is an admin, asked of the API (the only
 * judge: every admin route checks again). Kept here rather than passed down
 * through every screen, so the settings menu and the level screen can each
 * read it. False until the API says otherwise.
 */

let admin = false;
const listeners = new Set<() => void>();

/** Asks the API again, e.g. on load and after the `?admin=` link is used. */
export async function refreshAdmin(): Promise<void> {
  try {
    admin = await fetchIsAdmin();
  } catch {
    admin = false;
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useIsAdmin(): boolean {
  return useSyncExternalStore(subscribe, () => admin);
}
