"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ManagerState, RepeatMode } from "./types";
import { DEFAULT_PROVIDER_STATE } from "./types";
import { PlaybackManager } from "./PlaybackManager";
import type { Song } from "../../data/songs";

const INITIAL_STATE: ManagerState = {
  currentIndex: 0,
  shuffle: false,
  repeat: "none" as RepeatMode,
  activeProvider: "youtube",
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: DEFAULT_PROVIDER_STATE.volume,
  isMuted: false,
  isLoading: false,
  hasError: false,
  errorMessage: "",
  hasYouTubeId: false,
};

export interface PlaybackControls {
  togglePlay: () => void;
  previous: () => void;
  next: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  initializePlayer: () => void;
}

export function usePlayback(songs: Song[]): {
  state: ManagerState;
  controls: PlaybackControls;
  manager: PlaybackManager | null;
} {
  const managerRef = useRef<PlaybackManager | null>(null);
  const [state, setState] = useState<ManagerState>(INITIAL_STATE);

  useEffect(() => {
    const mgr = new PlaybackManager(songs);
    managerRef.current = mgr;

    const unsub = mgr.subscribe((s) => setState(s));
    const unsubTime = mgr.subscribeTime((currentTime, duration) => {
      setState((prev) => ({ ...prev, currentTime, duration }));
    });

    return () => {
      unsub();
      unsubTime();
      mgr.destroy();
      managerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      initializePlayer: () => void managerRef.current?.initializeDefaultProvider(),
    }),
    [],
  );

  return { state, controls, manager: managerRef.current };
}
