import { useEffect, useState } from "react";
import { fetchLevel, type LevelResponse } from "./api";

export type LevelState =
  | { status: "loading" }
  | ({ status: "ready" } & LevelResponse)
  | { status: "error"; message: string };

/** Fetches a level by its position in play order, with the player's progress on it. */
export function useLevel(number: number): LevelState {
  const [state, setState] = useState<LevelState>({ status: "loading" });

  useEffect(() => {
    // If the number changes before the answer arrives, drop the stale answer.
    let cancelled = false;
    setState({ status: "loading" });
    fetchLevel(number).then(
      (response) => {
        if (!cancelled) setState({ status: "ready", ...response });
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
