/**
 * Whether this browser's player has been through the welcome page, which asks
 * what to call them. A UI convenience, so localStorage: losing it only means
 * the page is shown once more (and only to a player with no progress).
 */
const WELCOMED_KEY = "uat:welcomed";

export function wasWelcomed(): boolean {
  try {
    return localStorage.getItem(WELCOMED_KEY) === "true";
  } catch {
    return false;
  }
}

export function markWelcomed(): void {
  try {
    localStorage.setItem(WELCOMED_KEY, "true");
  } catch {
    // Private browsing: the page may simply be shown again.
  }
}
