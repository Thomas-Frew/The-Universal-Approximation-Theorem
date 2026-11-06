import { aliasSchema, MAX_ALIAS_LENGTH, normaliseSaveKey } from "@uat/shared";
import { type ReactNode, useEffect, useState } from "react";
import { HeaderTools, NavButton } from "../components/HeaderTools";
import { Label } from "../components/Label";
import { fetchProfile, loadSaveKey, saveAlias } from "../lib/api";
import { useRemote } from "../lib/useRemote";

type SaveScreenProps = {
  onBack: () => void;
};

const buttonBase =
  "cursor-pointer rounded-md border px-4 py-2 text-xs tracking-label uppercase outline-offset-4 outline-walnut transition-colors focus-visible:outline-2 disabled:cursor-default disabled:opacity-60";
const primary = `${buttonBase} border-walnut bg-walnut text-paper hover:bg-ink`;
const secondary = `${buttonBase} border-stone bg-paper hover:bg-linen`;
const field =
  "min-w-0 flex-1 rounded-md border border-stone bg-paper px-3 py-2 outline-offset-2 outline-walnut focus-visible:outline-2";

export function Card({ title, note, children }: { title: string; note: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-md border border-stone bg-vellum p-6">
      <div>
        <h2 className="text-xl italic">{title}</h2>
        <p className="mt-1 text-sm text-taupe">{note}</p>
      </div>
      {children}
    </section>
  );
}

/** The player's key, to write down or copy. */
export function KeyCard({ saveKey }: { saveKey: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Card
      title="Your Save Key"
      note="Enter it in another browser, or in this one after clearing it, to carry on as this player. Keep it to yourself, since anyone with this key can play as you."
    >
      <div className="flex flex-wrap items-center gap-4">
        {/* select-all: one click selects the whole key, for copying by hand. */}
        <code className="font-mono text-2xl tracking-wider select-all">{saveKey}</code>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(saveKey).then(() => setCopied(true), () => undefined)}
          className={secondary}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </Card>
  );
}

/** The player's name on the scoreboard. */
function AliasCard({ alias }: { alias: string }) {
  const [saved, setSaved] = useState(alias);
  const [draft, setDraft] = useState(alias);
  const [state, setState] = useState<"ready" | "saving" | "saved">("ready");
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    // Checked here first, with the same rules as the API, so a bad alias
    // gets its reason in words rather than a bare 400.
    const checked = aliasSchema.safeParse(draft);
    if (!checked.success) {
      setError(checked.error.issues[0]?.message ?? "That alias will not do.");
      return;
    }
    setState("saving");
    try {
      await saveAlias(checked.data);
      setSaved(checked.data);
      setDraft(checked.data);
      setState("saved");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That did not save.");
      setState("ready");
    }
  };

  return (
    <Card
      title="Your Alias"
      note="Your name on the scoreboard, under Stats."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="flex flex-wrap gap-3"
      >
        <input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setState("ready");
            setError(null);
          }}
          maxLength={MAX_ALIAS_LENGTH}
          placeholder="Your alias"
          aria-label="Alias"
          className={field}
        />
        <button type="submit" disabled={state === "saving" || draft.trim() === saved} className={primary}>
          {state === "saving" ? "Saving" : "Save"}
        </button>
      </form>
      {state === "saved" && (
        <p role="status" className="text-sm text-sage">
          Saved.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-oxblood">
          {error}
        </p>
      )}
    </Card>
  );
}

/**
 * Becomes the player another key belongs to. `landOn` is the screen to reload
 * onto (the part of the address after `#`); without it, the page stays put.
 */
export function LoadCard({
  saveKey,
  hasProgress,
  title = "Load a Save Key",
  landOn,
}: {
  saveKey: string;
  hasProgress: boolean;
  title?: string;
  landOn?: string;
}) {
  const [typed, setTyped] = useState("");
  // With progress here, loading takes two steps: the first warns.
  const [step, setStep] = useState<"idle" | "confirm" | "loading">("idle");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setStep("loading");
    setError(null);
    try {
      await loadSaveKey(typed);
      // The browser now holds the other player's session cookie. Reloading
      // fetches everything again as them.
      if (landOn !== undefined) window.history.replaceState(window.history.state, "", `#${landOn}`);
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That did not load.");
      setStep("idle");
    }
  };

  const start = () => {
    setError(null);
    if (normaliseSaveKey(typed) === null) {
      setError("A save key has 16 letters and digits, like ABCD-EFGH-JKMN-PQRS.");
      return;
    }
    if (hasProgress) setStep("confirm");
    else void load();
  };

  return (
    <Card
      title={title}
      note="Carry on as the player a key belongs to. This browser becomes that player."
    >
      {step === "confirm" ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            This browser&rsquo;s progress stays with its own key, <code className="font-mono">{saveKey}</code>. Copy it
            first if you want to come back to it.
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={() => setStep("idle")} className={secondary}>
              Cancel
            </button>
            <button type="button" onClick={() => void load()} className={primary}>
              Load anyway
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            start();
          }}
          className="flex flex-wrap gap-3"
        >
          <input
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
              setError(null);
            }}
            maxLength={64}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            aria-label="Save key"
            autoComplete="off"
            spellCheck={false}
            className={`${field} font-mono uppercase`}
          />
          <button type="submit" disabled={step === "loading" || typed.trim() === ""} className={primary}>
            {step === "loading" ? "Loading" : "Load"}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-oxblood">
          {error}
        </p>
      )}
    </Card>
  );
}

/**
 * Saving and loading progress, opened from the settings menu: the player's
 * save key, their alias for the scoreboard, and a way to load another key.
 * Progress itself always lives in the database; the key is just how a
 * browser says which player it is.
 */
export function SaveScreen({ onBack }: SaveScreenProps) {
  const profile = useRemote(fetchProfile, "profile");

  return (
    <main className="mx-auto min-h-dvh max-w-[min(104rem,94vw)] py-10 [view-transition-name:save]">
      {/* The same header grid as the feedback and stats pages. */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-8 border-b border-stone pb-4">
        <div className="col-span-2 row-start-2 lg:col-span-1 lg:row-start-1">
          <Label>The Universal Approximation Theorem</Label>
        </div>
        <h1 className="col-span-2 row-start-3 text-4xl font-bold lg:col-span-1 lg:row-start-2">Save Key and Alias</h1>
        <div className="col-span-2 row-start-1 mb-4 flex items-center gap-3 lg:col-span-1 lg:col-start-2 lg:row-span-2 lg:mb-0 lg:self-end">
          <HeaderTools />
          <NavButton onClick={onBack}>Back</NavButton>
        </div>
      </header>

      {profile.status === "loading" && <p className="mt-8 text-taupe italic">Fetching your key…</p>}
      {profile.status === "error" && (
        <p role="alert" className="mt-8 text-oxblood">
          Your key could not be fetched. {profile.message}
        </p>
      )}
      {profile.status === "ready" && (
        <div className="mx-auto mt-8 flex max-w-3xl flex-col gap-6">
          <KeyCard saveKey={profile.key} />
          <AliasCard alias={profile.alias} />
          <LoadCard saveKey={profile.key} hasProgress={profile.hasProgress} />
        </div>
      )}
    </main>
  );
}
