import { MAX_FEEDBACK_COMMENT_LENGTH } from "@uat/shared";
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { fetchFeedback, sendFeedback } from "../lib/api";
import { prefersReducedMotion } from "../lib/motion";
import { RatingRow } from "./RatingRow";

/** Lets the level screen open the card from elsewhere (the completion panel's Feedback button). */
export type FeedbackSectionHandle = { reveal: () => void };

type FeedbackSectionProps = { levelNumber: number; ref?: Ref<FeedbackSectionHandle> };

type RatingKey = "understanding" | "implementation" | "overall";

// The general rating first, then the two kinds of difficulty, named as such.
const QUESTIONS: { key: RatingKey; label: string; low: string; high: string }[] = [
  { key: "overall", label: "Overall rating", low: "Did not enjoy", high: "Loved it" },
  { key: "understanding", label: "Difficulty of working out what it does", low: "Easy", high: "Very hard" },
  { key: "implementation", label: "Difficulty of writing the code", low: "Easy", high: "Very hard" },
];

const NO_RATINGS: Record<RatingKey, number | null> = { overall: null, understanding: null, implementation: null };

const buttonBase =
  "cursor-pointer rounded-md border px-4 py-2 text-xs tracking-label uppercase outline-offset-4 outline-walnut transition-colors focus-visible:outline-2 disabled:cursor-default disabled:opacity-60";

/**
 * A collapsed card under the observations: three ratings from 1 to 8 and an
 * optional comment, usable whether or not the level is solved. The player's
 * earlier feedback is fetched the first time it is opened, and sending again
 * replaces it.
 */
export function FeedbackSection({ levelNumber, ref }: FeedbackSectionProps) {
  const [open, setOpen] = useState(false);
  const [ratings, setRatings] = useState(NO_RATINGS);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "ready" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const sectionRef = useRef<HTMLElement>(null);

  // Fetch once, on the first opening; after that the form keeps its own state.
  const load = async () => {
    if (state !== "idle") return;
    setState("loading");
    try {
      const previous = await fetchFeedback(levelNumber);
      if (previous) {
        const { comment: previousComment, ...previousRatings } = previous;
        setRatings(previousRatings);
        setComment(previousComment);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your feedback could not be fetched.");
    }
    setState("ready");
  };

  const toggle = () => {
    setOpen(!open);
    if (!open) void load();
  };

  // Opens the card (never closes it) and scrolls it into view. The scroll
  // waits for the effect below, until the form is on screen: scrolling at
  // once would measure the closed card, before the form has made the page
  // long enough to bring it up.
  const scrollPending = useRef(false);
  const formShown = open && state !== "idle" && state !== "loading";
  const scrollToCard = () =>
    sectionRef.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
  useImperativeHandle(ref, () => ({
    reveal: () => {
      // Already open: the page is already its full length.
      if (formShown) return scrollToCard();
      scrollPending.current = true;
      setOpen(true);
      void load();
    },
  }));
  useEffect(() => {
    if (!formShown || !scrollPending.current) return;
    scrollPending.current = false;
    scrollToCard();
  }, [formShown]);

  // Every part is optional, but there must be something to send.
  const filled = Object.values(ratings).some((value) => value !== null) || comment.trim() !== "";

  // Any change after sending makes it sendable again.
  const edited = () => {
    if (state === "sent") setState("ready");
  };

  const send = async () => {
    if (!filled) return;
    setState("sending");
    setError(null);
    try {
      await sendFeedback(levelNumber, { ...ratings, comment });
      setState("sent");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That did not send.");
      setState("ready");
    }
  };

  return (
    <section ref={sectionRef} className="scroll-mt-6 rounded-md border border-stone bg-vellum">
      {/* The heading is the toggle, so the whole top row is one big target. */}
      <h2>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="feedback-form"
          className="flex w-full cursor-pointer items-center justify-between gap-4 rounded-md p-6 text-left outline-offset-4 outline-walnut focus-visible:outline-2"
        >
          <span>
            <span className="block text-xl italic">Feedback</span>
            <span className="mt-1 block text-sm text-taupe">How did you find this machine?</span>
          </span>
          <svg
            viewBox="0 0 20 20"
            className={`size-5 shrink-0 text-taupe transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 8l5 5 5-5" />
          </svg>
        </button>
      </h2>

      {open && (
        <form
          id="feedback-form"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
          className="flex flex-col gap-5 px-6 pb-6"
        >
          <p className="text-sm text-taupe">
            Solved or not, it helps us tune the machines. Everything is optional; fill in at least one.
          </p>

          {state === "loading" ? (
            <p className="text-taupe italic">Fetching…</p>
          ) : (
            <>
              {QUESTIONS.map((question) => (
                <RatingRow
                  key={question.key}
                  label={question.label}
                  low={question.low}
                  high={question.high}
                  value={ratings[question.key]}
                  onChange={(value) => {
                    setRatings((previous) => ({ ...previous, [question.key]: value }));
                    edited();
                  }}
                />
              ))}
              <label className="flex flex-col gap-2">
                <span className="text-sm">Anything else?</span>
                <textarea
                  value={comment}
                  onChange={(event) => {
                    setComment(event.target.value);
                    edited();
                  }}
                  maxLength={MAX_FEEDBACK_COMMENT_LENGTH}
                  rows={4}
                  className="resize-none rounded-md border border-stone bg-paper p-3 text-sm outline-offset-2 outline-walnut focus-visible:outline-2"
                />
              </label>
            </>
          )}

          {error && (
            <p role="alert" className="text-sm text-oxblood">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-4">
            {state === "sent" && (
              <p role="status" className="text-sm text-sage">
                Thank you. You can change this feedback at any time.
              </p>
            )}
            <button
              type="submit"
              disabled={!filled || state !== "ready"}
              className={`${buttonBase} border-walnut bg-walnut text-paper hover:bg-ink`}
            >
              {state === "sending" ? "Sending" : state === "sent" ? "Sent" : "Send"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
