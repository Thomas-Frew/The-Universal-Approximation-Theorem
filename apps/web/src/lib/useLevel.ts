import { fetchLevel, fetchLevels, type LevelListResponse, type LevelResponse } from "./api";
import { type RemoteState, useRemote } from "./useRemote";

export type LevelState = RemoteState<LevelResponse>;

/**
 * Fetches a level by its position in play order, with the player's progress
 * on it, unless it was fetched already (`initial`).
 */
export function useLevel(number: number, initial?: LevelResponse): LevelState {
  return useRemote(() => fetchLevel(number), number, initial);
}

/**
 * Every level with the player's standing on each, fetched when the calling
 * component mounts (unless fetched just before, `initial`), so the level
 * select is fresh each time it is shown.
 */
export function useLevelList(initial?: LevelListResponse): RemoteState<LevelListResponse> {
  return useRemote(fetchLevels, "levels", initial);
}
