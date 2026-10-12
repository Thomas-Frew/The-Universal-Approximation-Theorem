import type { Level } from "@uat/shared";
import { useEffect, useState } from "react";
import { fetchLevel } from "./api";

export type LevelState =
  | { status: "loading" }
  | { status: "ready"; level: Level }
  | { status: "error"; message: string };

/** Fetches a level by its position in play order. */
export function useLevel(number: number): LevelState {
  const [state, setState] = useState<LevelState>({ status: "loading" });

  useEffect(() => {
    // If the number changes before the answer arrives, drop the stale answer.
    let cancelled = false;
    setState({ status: "loading" });
    fetchLevel(number).then(
      (level) => {
        if (!cancelled) setState({ status: "ready", level });
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [number]);

  return state;
}
