import correctUrl from "../assets/sounds/correct.m4a";
import enterUrl from "../assets/sounds/enter.m4a";
import leaveUrl from "../assets/sounds/leave.m4a";
import queryUrl from "../assets/sounds/query.m4a";
import titleUrl from "../assets/sounds/title.m4a";
import unknownUrl from "../assets/sounds/unknown.m4a";
import unmuteUrl from "../assets/sounds/unmute.m4a";
import wrongUrl from "../assets/sounds/wrong.m4a";

/**
 * The game's sound effects. One plays at a time: starting a sound always cuts
 * off whatever is playing.
 *
 * Built on the Web Audio API rather than <audio> elements. Browsers only allow
 * sound after the player has interacted with the page, and Safari also blocks
 * an <audio> element started after an `await` (as the verdict sound is). An
 * AudioContext, once resumed during a click, keeps working.
 *
 * Sound never holds up the game: if a file fails to load or the browser
 * refuses to play, every function here simply resolves.
 */

const URLS = {
  query: queryUrl,
  unknown: unknownUrl,
  correct: correctUrl,
  wrong: wrongUrl,
  enter: enterUrl,
  leave: leaveUrl,
  title: titleUrl,
  unmute: unmuteUrl,
};
export type Sound = keyof typeof URLS;

const MUTED_KEY = "uat:muted";

/** Remembered per browser: a UI convenience, so localStorage is the right place. */
function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === "true";
  } catch {
    return false;
  }
}

let muted = readMuted();
const listeners = new Set<() => void>();

export function isMuted(): boolean {
  return muted;
}

/** Mutes or unmutes, silencing anything playing at once, and remembers the choice. */
export function setMuted(value: boolean): void {
  muted = value;
  if (muted) stopSound();
  try {
    localStorage.setItem(MUTED_KEY, String(muted));
  } catch {
    // Private browsing and the like: muting still works for this visit.
  }
  for (const listener of listeners) listener();
}

/**
 * What every sound switch does (the speaker buttons, the settings menu):
 * flips muting, and on turning sound back on says so with `unmute`, G rising
 * to C. Call it from the click itself, which also unlocks audio.
 */
export function toggleMuted(): void {
  setMuted(!muted);
  if (!muted) void playSound("unmute");
}

/** For React's useSyncExternalStore: call `listener` whenever muting changes. */
export function subscribeMuted(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let context: AudioContext | null = null;
const files = new Map<Sound, Promise<ArrayBuffer | null>>();
const buffers = new Map<Sound, Promise<AudioBuffer | null>>();
let current: AudioBufferSourceNode | null = null;
/** Bumped by every playSound call, so a sound still loading knows it was overtaken. */
let latest = 0;

function audioContext(): AudioContext | null {
  try {
    context ??= new AudioContext();
  } catch {
    return null;
  }
  return context;
}

/** The file's bytes, downloaded once. */
function download(name: Sound): Promise<ArrayBuffer | null> {
  let file = files.get(name);
  if (!file) {
    file = fetch(URLS[name])
      .then((response) => (response.ok ? response.arrayBuffer() : null))
      .catch(() => null);
    files.set(name, file);
  }
  return file;
}

/** The decoded sound, ready to play. Decoding needs the AudioContext, so it
    waits for the first play, which comes from a click. */
function load(name: Sound): Promise<AudioBuffer | null> {
  let buffer = buffers.get(name);
  if (!buffer) {
    buffer = download(name)
      // slice(): decoding takes ownership of the bytes it is given.
      .then((bytes) => (bytes ? (audioContext()?.decodeAudioData(bytes.slice(0)) ?? null) : null))
      .catch(() => null);
    buffers.set(name, buffer);
  }
  return buffer;
}

/**
 * Downloads every sound ahead of time, so none waits on the network when it is
 * first needed. Creates no AudioContext: browsers warn about one made before
 * the player has clicked anything.
 */
export function preloadSounds(): void {
  for (const name of Object.keys(URLS) as Sound[]) void download(name);
}

/**
 * Plays a sound as soon as the browser allows: at once if the visitor has
 * already clicked or pressed a key on this page, or else on their first
 * click, tap or key press. Returns a function that cancels a sound still
 * waiting for that.
 */
export function playWhenAllowed(name: Sound): () => void {
  if (navigator.userActivation?.hasBeenActive) {
    void playSound(name);
    return () => {};
  }
  const play = () => {
    cancel();
    void playSound(name);
  };
  const cancel = () => {
    window.removeEventListener("pointerdown", play);
    window.removeEventListener("keydown", play);
  };
  window.addEventListener("pointerdown", play);
  window.addEventListener("keydown", play);
  return cancel;
}

/** Stops whatever is playing. */
export function stopSound(): void {
  latest += 1;
  current?.stop();
  current = null;
}

/**
 * Plays a sound, cutting off any other. Resolves when it ends, or when
 * something else cuts it off, or straight away if muted or it cannot play.
 */
export function playSound(name: Sound): Promise<void> {
  const ticket = ++latest;
  current?.stop();
  current = null;
  // Muted: nothing to wait for, so the verdict is not held back either.
  if (muted) return Promise.resolve();

  const audio = audioContext();
  if (!audio) return Promise.resolve();
  // Called first thing in a click handler, this unlocks sound for the page.
  void audio.resume().catch(() => {});

  return load(name).then(
    (buffer) =>
      new Promise<void>((resolve) => {
        // Another sound was asked for while this one loaded: it wins.
        if (!buffer || ticket !== latest) return resolve();
        const source = audio.createBufferSource();
        source.buffer = buffer;
        source.connect(audio.destination);
        // Fires when it plays to the end, and when stop() cuts it off.
        source.onended = () => {
          if (current === source) current = null;
          resolve();
        };
        current = source;
        source.start();
      }),
  );
}
