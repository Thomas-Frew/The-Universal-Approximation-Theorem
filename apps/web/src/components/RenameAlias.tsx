import { aliasSchema, MAX_ALIAS_LENGTH } from "@uat/shared";
import { type FormEvent, useState } from "react";

const smallButton =
  "cursor-pointer rounded-md border px-2 py-0.5 text-[0.625rem] font-normal tracking-label uppercase outline-offset-2 outline-walnut transition-colors focus-visible:outline-2 disabled:cursor-default disabled:opacity-60";

type RenameAliasProps = {
  /** The name as it stands. */
  name: string;
  /** Saves the new name, already checked with `aliasSchema`; throws with a reason if refused. */
  rename: (to: string) => Promise<void>;
  onRenamed: () => void;
  /** An admin renaming someone else: a Brass outline, to mark the power. */
  admin?: boolean;
};

/**
 * A Rename button beside a name on the scoreboard, which opens a small form
 * in its place. Used for your own name (`saveAlias`) and, by admins, for
 * anyone else's (`renameAlias`); which one is up to `rename`, and the API
 * decides who may do what. The new name is checked with `aliasSchema` here,
 * rude words included, and again by the API.
 */
export function RenameAlias({ name, rename, onRenamed, admin = false }: RenameAliasProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(name);
          setError(null);
          setEditing(true);
        }}
        aria-label={`Rename ${name}`}
        className={`${smallButton} ml-2 ${admin ? "border-brass" : "border-stone"} bg-paper text-taupe hover:bg-linen`}
      >
        Rename
      </button>
    );
  }

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = aliasSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "That alias is not allowed.");
      return;
    }
    setSaving(true);
    try {
      await rename(parsed.data);
      setEditing(false);
      onRenamed();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That did not work.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="mt-1 flex flex-wrap items-center gap-2 font-normal">
      <input
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        maxLength={MAX_ALIAS_LENGTH}
        aria-label={`New alias for ${name}`}
        autoFocus
        className="w-48 rounded-md border border-stone bg-paper px-2 py-0.5 text-sm outline-offset-2 outline-walnut focus-visible:outline-2"
      />
      <button type="submit" disabled={saving} className={`${smallButton} border-walnut bg-walnut text-paper hover:bg-ink`}>
        Save
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className={`${smallButton} border-stone bg-paper hover:bg-linen`}
      >
        Cancel
      </button>
      {error && (
        <span role="alert" className="w-full text-xs text-oxblood">
          {error}
        </span>
      )}
    </form>
  );
}
