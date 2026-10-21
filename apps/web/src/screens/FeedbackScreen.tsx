import { MAX_FEEDBACK_COMMENT_LENGTH } from "@uat/shared";
import { useState } from "react";
import { Label } from "../components/Label";
import { RatingRow } from "../components/RatingRow";
import { sendGameFeedback } from "../lib/api";

type FeedbackScreenProps = {
  onBack: () => void;
};

const buttonBase =
  "cursor-pointer rounded-md border px-4 py-2 text-xs tracking-label uppercase outline-offset-4 outline-walnut transition-colors focus-visible:outline-2 disabled:cursor-default disabled:opacity-60";

/**
 * Feedback on the game as a whole, opened from the settings menu: one rating
 * and a comment. Unlike a machine's Feedback card, which holds one answer the
 * player can change, this sends a new message each time, as often as they
 * like, so the form starts empty and clears after each send.
 */
export function FeedbackScreen({ onBack }: FeedbackScreenProps) {
  const [overall, setOverall] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"ready" | "sending" | "sent">("ready");
  const [error, setError] = useState<string | null>(null);

  const filled = overall !== null || comment.trim() !== "";

  // Starting the next message takes away the thank-you for the last.
  const edited = () => {
    if (state === "sent") setState("ready");
  };

  const send = async () => {
    if (!filled) return;
    setState("sending");
    setError(null);
    try {
      await sendGameFeedback({ overall, comment });
      // Sent and kept: clear the form for the next one.
      setOverall(null);
      setComment("");
      setState("sent");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That did not send.");
      setState("ready");
    }
  };

  return (
    <main className="mx-auto min-h-dvh max-w-[min(104rem,94vw)] py-10 [view-transition-name:feedback]">
      {/* The same header grid as the level select and stats pages, so the
          button sits in the same place. */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-8 border-b border-stone pb-4">
        <div className="col-start-1 row-start-1">
          <Label>The Universal Approximation Theorem</Label>
        </div>
        <h1 className="col-span-2 row-start-2 text-4xl font-bold lg:col-span-1">Feedback</h1>
        <div className="col-start-2 row-start-1 flex items-center gap-3 self-start lg:row-span-2 lg:self-end">
          <button type="button" onClick={onBack} className={`${buttonBase} border-stone bg-paper hover:bg-linen`}>
            Back
          </button>
        </div>
      </header>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        className="mx-auto mt-8 flex max-w-2xl flex-col gap-6 rounded-md border border-stone bg-vellum p-6"
      >
        <div>
          <h2 className="text-xl italic">How Are You Finding the Game?</h2>
          <p className="mt-1 text-sm text-taupe">
            Anything helps: what you enjoyed, what frustrated you, what you would change. Everything is
            optional; fill in at least one. Send as many as you like. For one machine in particular, use
            the Feedback card on its page.
          </p>
        </div>

        <RatingRow
          label="Overall rating"
          low="Did not enjoy"
          high="Loved it"
          value={overall}
          onChange={(value) => {
            setOverall(value);
            edited();
          }}
        />
        <label className="flex flex-col gap-2">
          <span className="text-sm">Your thoughts</span>
          <textarea
            value={comment}
            onChange={(event) => {
              setComment(event.target.value);
              edited();
            }}
            maxLength={MAX_FEEDBACK_COMMENT_LENGTH}
            rows={8}
            className="resize-none rounded-md border border-stone bg-paper p-3 text-sm outline-offset-2 outline-walnut focus-visible:outline-2"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-oxblood">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-4">
          {state === "sent" && (
            <p role="status" className="text-sm text-sage">
              Thank you. Send another whenever you like.
            </p>
          )}
          <button
            type="submit"
            disabled={!filled || state === "sending"}
            className={`${buttonBase} border-walnut bg-walnut text-paper hover:bg-ink`}
          >
            {state === "sending" ? "Sending" : "Send"}
          </button>
        </div>
      </form>
    </main>
  );
}
