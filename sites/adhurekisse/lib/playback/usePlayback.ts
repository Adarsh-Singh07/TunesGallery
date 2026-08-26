"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ManagerState, ProviderId, RepeatMode } from "./types";
import { DEFAULT_PROVIDER_STATE } from "./types";
import { PlaybackManager } from "./PlaybackManager";
import type { Song } from "../../data/songs";
import { isSpotifyConnected } from "../spotify/pkce";

// ── Stable initial state to prevent hydration mismatch ───────────────────────
const INITIAL_STATE: ManagerState = {
  currentIndex: 0,
  shuffle: false,
  repeat: "none" as RepeatMode,
  activeProvider: "youtube" as ProviderId,
  spotifyConnected: false,
  spotifyConnecting: false,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: DEFAULT_PROVIDER_STATE.volume,
  isMuted: false,
  isLoading: false,
  hasError: false,
  errorMessage: "",
  hasYouTubeId: false,
  hasSpotifyId: false,
};

// ─────────────────────────────────────────────────────────────────────────────

export interface PlaybackControls {
  togglePlay: () => void;
  previous: () => void;
  next: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  selectSong: (index: number) => void;
  switchProvider: (id: ProviderId) => void;
  connectSpotify: () => void;
  disconnectSpotify: () => void;
  initializePlayer: () => void;
}

export function usePlayback(songs: Song[]): {
  state: ManagerState;
  controls: PlaybackControls;
  manager: PlaybackManager | null;
} {
  const managerRef = useRef<PlaybackManager | null>(null);
  const [state, setState] = useState<ManagerState>(INITIAL_STATE);

  // Create the manager once (client-side only)
  useEffect(() => {
    const mgr = new PlaybackManager(songs);
    managerRef.current = mgr;

    // Sync Spotify connected state from localStorage
    mgr.markSpotifyConnected(isSpotifyConnected());

    const unsub = mgr.subscribe((s) => setState(s));

    return () => {
      unsub();
      mgr.destroy();
      managerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // songs array is stable — PlaybackManager owns it

  // ── Controls ──────────────────────────────────────────────────────────────

  const controls: PlaybackControls = useMemo(
    () => ({
      togglePlay: () => void managerRef.current?.togglePlay(),
      previous: () => void managerRef.current?.previous(),
      next: () => void managerRef.current?.next(),
      seek: (s) => void managerRef.current?.seek(s),
      setVolume: (v) => void managerRef.current?.setVolume(v),
      toggleMute: () => {
        const mgr = managerRef.current;
        if (!mgr) return;
        const { isMuted } = mgr.getState();
        void mgr.setMuted(!isMuted);
      },
      toggleShuffle: () => managerRef.current?.toggleShuffle(),
      cycleRepeat: () => managerRef.current?.cycleRepeat(),
      selectSong: (index) => void managerRef.current?.selectSong(index),
      switchProvider: (id) => void managerRef.current?.switchProvider(id),
      connectSpotify: () => void managerRef.current?.connectSpotify(),
      disconnectSpotify: () => managerRef.current?.disconnectSpotify(),
      initializePlayer: () => void managerRef.current?.initializeDefaultProvider(),
    }),
    [],
  );

  return { state, controls, manager: managerRef.current };
}
