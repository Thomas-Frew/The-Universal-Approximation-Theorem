import { useEffect, useState } from "react";

export type RemoteState<T> =
  | { status: "loading" }
  | ({ status: "ready" } & T)
  | { status: "error"; message: string };

/**
 * Runs `load` when the component mounts and whenever `key` changes, and
 * tracks its answer. If `key` changes before the answer arrives, the stale
 * answer is dropped.
 */
export function useRemote<T extends object>(load: () => Promise<T>, key: unknown): RemoteState<T> {
  const [state, setState] = useState<RemoteState<T>>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    load().then(
      (value) => {
        if (!cancelled) setState({ status: "ready", ...value });
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
    // `load` is a fresh function on every render, so it is not a dependency:
    // `key` is what says the request has changed.
  }, [key]);

  return state;
}
