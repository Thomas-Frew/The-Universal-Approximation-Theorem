import { aliasSchema, MAX_ALIAS_LENGTH, type ProfileResponse } from "@uat/shared";
import { useState } from "react";
import { HeaderTools, NavButton } from "../components/HeaderTools";
import { Label } from "../components/Label";
import { fetchProfile, saveAlias } from "../lib/api";
import { markWelcomed } from "../lib/welcome";
import { useRemote } from "../lib/useRemote";
import { KeyCard, LoadCard } from "./SaveScreen";

type WelcomeScreenProps = {
  /** The profile, if fetched before the screen was shown. */
  initialProfile: ProfileResponse | undefined;
  /** On to the machines, once the player has a name. */
  onContinue: () => void;
  onExit: () => void;
};

const buttonBase =
  "cursor-pointer rounded-md border px-4 py-2 text-xs tracking-label uppercase outline-offset-4 outline-walnut transition-colors focus-visible:outline-2 disabled:cursor-default disabled:opacity-60";

/** The name form: the made-up alias to start with, kept or changed. */
function NameForm({ alias, onDone }: { alias: string; onDone: () => void }) {
  const [draft, setDraft] = useState(alias);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    // The same rules as the API, checked here first so a bad name gets its
    // reason in words.
    const checked = aliasSchema.safeParse(draft);
    if (!checked.success) {
      setError(checked.error.issues[0]?.message ?? "That name will not do.");
      return;
    }
    setSaving(true);
    try {
      // Kept as it is, there is nothing to send.
      if (checked.data !== alias) await saveAlias(checked.data);
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That did not save.");
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap gap-3">
        <input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          maxLength={MAX_ALIAS_LENGTH}
          aria-label="Your name"
          autoFocus
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md border border-stone bg-paper px-4 py-3 text-xl outline-offset-2 outline-walnut focus-visible:outline-2"
        />
        <button
          type="submit"
          disabled={saving || draft.trim() === ""}
          className={`${buttonBase} border-walnut bg-walnut px-6 text-paper hover:bg-ink`}
        >
          {saving ? "Saving" : "Continue"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-oxblood">
          {error}
        </p>
      )}
    </form>
  );
}

/**
 * The page between the intro and the machines, shown once, to a new player:
 * what to call them (their alias on the scoreboard, a made-up one to start
 * with), their save key, and a way to load an old one instead. Everything
 * here is also on the save page, under Settings.
 */
export function WelcomeScreen({ initialProfile, onContinue, onExit }: WelcomeScreenProps) {
  const profile = useRemote(fetchProfile, "profile", initialProfile);
  const done = () => {
    markWelcomed();
    onContinue();
  };

  return (
    <main className="mx-auto min-h-dvh max-w-[min(104rem,94vw)] py-10 [view-transition-name:welcome]">
      <header className="flex items-center justify-end gap-3">
        <HeaderTools />
        <NavButton onClick={onExit}>Title</NavButton>
      </header>

      <div className="mx-auto mt-12 flex max-w-3xl flex-col gap-6 sm:mt-20">
        <div>
          <h1 className="mt-2 text-4xl font-bold">What should we call you?</h1>
          <p className="mt-2 text-taupe italic">
            Keep this one or choose your own. you can change it later under Settings.
          </p>
        </div>

        {profile.status === "loading" && <p className="text-taupe italic">Fetching your name…</p>}
        {profile.status === "error" && (
          <div className="flex flex-col items-start gap-3">
            <p role="alert" className="text-oxblood">
              Your name could not be fetched. {profile.message}
            </p>
            <button type="button" onClick={done} className={`${buttonBase} border-stone bg-paper hover:bg-linen`}>
              Skip
            </button>
          </div>
        )}
        {profile.status === "ready" && (
          <>
            <NameForm alias={profile.alias} onDone={done} />
            <div className="mt-6 flex flex-col gap-6 border-t border-stone pt-8">
              <KeyCard saveKey={profile.key} />
              {/* Loading lands on the machines: a player with a key has been here before. */}
              <LoadCard
                saveKey={profile.key}
                hasProgress={profile.hasProgress}
                title="Played Before?"
                landOn="machines"
              />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
