/**
 * Whether this browser has seen the guide, or waved away the banner that
 * suggests it. A UI convenience, so localStorage is the right place; wiping
 * progress keeps it, since the player has still read the guide.
 */
const GUIDE_SEEN_KEY = "uat:guideSeen";

export function hasSeenGuide(): boolean {
  try {
    return localStorage.getItem(GUIDE_SEEN_KEY) === "true";
  } catch {
    // Blocked storage: show nothing rather than nag on every machine.
    return true;
  }
}

export function markGuideSeen(): void {
  try {
    localStorage.setItem(GUIDE_SEEN_KEY, "true");
  } catch {
    // Blocked: the banner is simply gone for this visit.
  }
}
