import {
  type Level,
  type LogEntry,
  normaliseText,
  PENALTY_COSTS,
  type Progress,
} from "@uat/shared";
import { type FormEvent, type KeyboardEvent, useState } from "react";
import { sendQuery } from "../lib/api";
import { Label } from "./Label";

type ObservationPanelProps = {
  level: Level;
  /** What the player has learned beyond the samples, oldest first. */
  log: readonly LogEntry[];
  /** The player's progress after a query the machine answered. */
  onProgress: (progress: Progress) => void;
};

type Notice = { tone: "info" | "error"; text: string };

const SOURCE_NAMES = { query: "Query", revealed: "Revealed" };

/** The left-hand panel: ask the machine a question, and see every answer so far. */
export function ObservationPanel({ level, log, onProgress }: ObservationPanelProps) {
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const rows = [
    ...level.samples.map((observation) => ({ source: "Sample", observation })),
    ...log.map((entry) => ({ source: SOURCE_NAMES[entry.source], observation: entry })),
  ];

  const ask = async () => {
    if (pending || input.trim() === "") return;

    // The log holds inputs in normalised form, so compare like with like.
    const normalised = normaliseText(input);
    if (rows.some((row) => row.observation.input === normalised)) {
      setNotice({ tone: "info", text: "That input is already in your log." });
      return;
    }

    setPending(true);
    setNotice(null);
    try {
      const { result, progress } = await sendQuery(level.number, input);
      if (result.status === "rejected") {
        setNotice({ tone: "error", text: `Rejected. ${result.message}` });
      } else {
        onProgress(progress);
        setInput("");
      }
    } catch (error) {
      setNotice({
        tone: "error",
        text: `The machine did not answer. ${error instanceof Error ? error.message : ""}`,
      });
    } finally {
      setPending(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void ask();
  };

  // Enter adds a line, because inputs can span several; Ctrl or Cmd + Enter sends.
  // The box starts one line tall, level with the button, and can be dragged taller.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void ask();
    }
  };

  return (
    <section className="flex-1 rounded-md border border-stone bg-vellum p-6">
      <h2 className="text-xl italic">Observations</h2>
      <p className="mt-1 text-sm text-taupe">
        The samples are free. Each new query costs {PENALTY_COSTS.query}.
      </p>

      <form onSubmit={onSubmit} className="mt-4 flex items-start gap-4">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          spellCheck={false}
          aria-label="Query input"
          placeholder="Input for the machine"
          className="min-h-12 flex-1 resize-y rounded-md border border-stone bg-paper p-3 font-mono text-sm outline-offset-2 outline-walnut placeholder:text-taupe focus-visible:outline-2"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-12 cursor-pointer rounded-md border border-walnut bg-walnut px-6 text-xs tracking-label text-paper uppercase outline-offset-4 outline-walnut transition-colors hover:bg-ink focus-visible:outline-2 disabled:cursor-default disabled:opacity-60"
        >
          {pending ? "Asking" : "Query"}
        </button>
      </form>
      <p
        role="status"
        className={`mt-2 min-h-5 text-sm ${notice?.tone === "error" ? "text-oxblood" : "text-taupe italic"}`}
      >
        {notice?.text}
      </p>

      <table className="mt-2 w-full text-left">
        <thead>
          <tr>
            <th className="w-16 pb-2 font-normal">
              <Label>#</Label>
            </th>
            <th className="pb-2 font-normal">
              <Label>Input</Label>
            </th>
            <th className="pb-2 font-normal">
              <Label>Output</Label>
            </th>
            <th className="w-28 pb-2 font-normal">
              <Label>Source</Label>
            </th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {rows.map(({ source, observation }, index) => (
            <tr key={observation.input} className="odd:bg-paper">
              <td className="px-2 py-2 text-taupe">
                {String(index + 1).padStart(2, "0")}
              </td>
              <td className="py-2 whitespace-pre-wrap">{observation.input.trimEnd()}</td>
              <td className="py-2 whitespace-pre-wrap text-walnut">
                {observation.output.trimEnd()}
              </td>
              <td className="py-2 font-display">
                <Label>{source}</Label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
