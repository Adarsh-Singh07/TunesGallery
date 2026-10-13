"use client";

import { createContext, useContext, type ReactNode } from "react";
import { songs as curatedSongs } from "../data/songs";
import { usePlayback, type PlaybackControls } from "../lib/playback/usePlayback";
import type { ManagerState } from "../lib/playback/types";
import type { PlaybackManager } from "../lib/playback/PlaybackManager";

export interface PlayerContextValue {
  manager: PlaybackManager | null;
  state: ManagerState;
  controls: PlaybackControls;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

/**
 * The provider deliberately lives in the app layout.  App Router navigation
 * can replace a page component, but it must not replace the manager (or its
 * HTMLAudioElement) while a listener moves between the room and the library.
 */
export function PlaybackProvider({ children }: { children: ReactNode }) {
  const player = usePlayback(curatedSongs);
  return <PlayerContext.Provider value={player}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const value = useContext(PlayerContext);
  if (!value) {
    throw new Error("usePlayer must be used inside PlaybackProvider");
  }
  return value;
}
