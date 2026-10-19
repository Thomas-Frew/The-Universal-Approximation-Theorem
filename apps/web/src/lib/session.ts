import { anonymousClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/client";

/**
 * Talks to Better Auth's endpoints under /api/auth. The session itself lives
 * in an httpOnly cookie that this code never sees: the browser stores it and
 * sends it with every request to the same site.
 */
const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [anonymousClient()],
});

let ready: Promise<void> | null = null;

/**
 * Makes sure this browser has a player before the first API call: reuse the
 * existing session if there is one, otherwise create an anonymous player.
 *
 * Shared by every caller, so several requests on first load (and React's
 * double-run of effects in development) create one player, not several.
 */
export function ensureSession(): Promise<void> {
  ready ??= (async () => {
    const { data } = await authClient.getSession();
    if (data) return;
    const { error } = await authClient.signIn.anonymous();
    if (error) {
      throw new Error(error.message ?? "Could not start a session.");
    }
  })().catch((error: unknown) => {
    // Let the next call try again instead of remembering the failure.
    ready = null;
    throw error;
  });
  return ready;
}
