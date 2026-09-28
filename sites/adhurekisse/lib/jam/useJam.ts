"use client";

// ─────────────────────────────────────────────────────────────────────────────
// useJam — React bridge between JamSession and the PlaybackManager.
//
// MusicRoom keeps using `usePlayback` controls for solo listening; once a jam
// is active this hook routes control commands through the shared timeline and
// lets authoritative state drive local playback.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import type { PlaybackManager } from "../playback/PlaybackManager";
import type { Song } from "../../data/songs";
import { supabase } from "../supabase";
import { getProfile } from "../auth";
import {
  JamSession,
  type JamUiState,
  type PlayerAdapter,
} from "./JamSession";

export type JamPhase =
  | "idle"          // not in a room
  | "joining"       // create/join RPC in flight
  | "active"        // in a room
  | "ended";        // room finished

export interface JamActions {
  createRoom: (collaborative: boolean) => Promise<void>;
  joinRoom: (code: string) => Promise<void>;
  leave: () => Promise<void>;
  end: () => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  seek: (sec: number) => Promise<void>;
  playTrack: (index: number) => Promise<void>;
  addToQueue: (index: number) => Promise<void>;
  removeFromQueue: (queueItemId: string) => Promise<void>;
  playQueueItem: (queueItemId: string) => Promise<void>;
  suggestTrack: (index: number) => Promise<void>;
  setCollaborative: (on: boolean) => Promise<void>;
  sendChat: (text: string) => void;
  sendReaction: (emoji: string) => void;
  startSleepTimer: (ms: number) => void;
  cancelSleepTimer: () => void;
}

export function useJam(
  getManager: () => PlaybackManager | null,
  songs: Song[],
) {
  const [phase, setPhase] = useState<JamPhase>("idle");
  const [jamState, setJamState] = useState<JamUiState | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const sessionRef = useRef<JamSession | null>(null);
  const managerStateRef = useRef<{ isPlaying: boolean; currentTime: number; duration: number; isLoading: boolean }>({
    isPlaying: false, currentTime: 0, duration: 0, isLoading: false,
  });
  const songsRef = useRef(songs);
  songsRef.current = songs;

  // Keep a live mirror of manager state for the PlayerAdapter
  useEffect(() => {
    const mgr = getManager();
    if (!mgr) return;
    return mgr.subscribe((s) => {
      managerStateRef.current = {
        isPlaying: s.isPlaying,
        currentTime: s.currentTime,
        duration: s.duration,
        isLoading: s.isLoading,
      };
    });
  }, [getManager]);

  const resolveTrack = useCallback(
    (trackId: string): number | null => {
      const idx = songsRef.current.findIndex((s) => s.playback?.r2TrackId === trackId);
      return idx !== -1 ? idx : null;
    },
    [],
  );

  // Player adapter drives the manager on behalf of the shared timeline
  const buildAdapter = useCallback((): PlayerAdapter => {
    const mgr = () => getManager();
    return {
      loadTrack: async (index, autoplay) => {
        await mgr()?.selectSong(index, autoplay);
      },
      play: async () => {
        const m = mgr();
        if (!m) return;
        const st = m.getState();
        if (st.currentTime > 0 || st.duration > 0) {
          await m.play();
        } else {
          await m.selectSong(st.currentIndex, true);
        }
      },
      pause: async () => mgr()?.pause(),
      seek: async (sec) => mgr()?.seek(sec),
      setRate: async (rate) => mgr()?.setRate(rate),
      getPosition: () => managerStateRef.current.currentTime,
      isPlaying: () => managerStateRef.current.isPlaying,
      isBuffered: () =>
        !managerStateRef.current.isLoading && managerStateRef.current.duration > 0,
    };
  }, [getManager]);

  const attachSession = useCallback(
    (roomId: string, userId: string, displayName: string) => {
      sessionRef.current?.dispose();
      const session = new JamSession({
        db: supabase!,
        roomId,
        userId,
        displayName,
        player: buildAdapter(),
        resolveTrack,
      });
      void session.subscribe(setJamState);
      void session.start();
      sessionRef.current = session;
      setPhase("active");
    },
    [buildAdapter, resolveTrack],
  );

  // ── Actions ────────────────────────────────────────────────────────────────

  const createRoom = useCallback(
    async (collaborative: boolean) => {
      if (!supabase) return;
      setJoinError(null);
      setPhase("joining");
      try {
        const profile = await getProfile();
        const { roomId } = await JamSession.createRoom(supabase, collaborative);
        attachSession(roomId, profile!.id, profile?.display_name || profile?.email || "Host");
      } catch (err) {
        setPhase("idle");
        setJoinError(err instanceof Error ? err.message : "Could not create the room.");
      }
    },
    [attachSession],
  );

  const joinRoom = useCallback(
    async (code: string) => {
      if (!supabase) return;
      setJoinError(null);
      setPhase("joining");
      try {
        const profile = await getProfile();
        const roomId = await JamSession.joinRoom(supabase, code);
        attachSession(roomId, profile!.id, profile?.display_name || profile?.email || "Guest");
      } catch (err) {
        setPhase("idle");
        setJoinError(err instanceof Error ? err.message : "Could not join the room.");
      }
    },
    [attachSession],
  );

  const leave = useCallback(async () => {
    await sessionRef.current?.leave();
    sessionRef.current = null;
    setJamState(null);
    setPhase("idle");
  }, []);

  const end = useCallback(async () => {
    try {
      await sessionRef.current?.endRoom();
    } catch {
      /* room may already be ended */
    }
    await sessionRef.current?.leave();
    sessionRef.current = null;
    setJamState(null);
    setPhase("idle");
  }, []);

  const jamStateRef = useRef<JamUiState | null>(null);
  jamStateRef.current = jamState;

  const actions = useRef<JamActions | null>(null);
  if (!actions.current) {
    const s = () => sessionRef.current;
    actions.current = {
      createRoom,
      joinRoom,
      leave,
      end,
      play: async () => {
        s()?.wake();
        await s()?.play();
      },
      pause: () => (s() ? s().pause() : Promise.resolve()),
      seek: (sec) => (s() ? s().seek(sec) : Promise.resolve()),
      playTrack: (index) => {
        const trackId = songsRef.current[index]?.playback?.r2TrackId;
        if (!s() || !trackId) return Promise.resolve();
        return s().setTrack(trackId);
      },
      addToQueue: (index) => {
        const trackId = songsRef.current[index]?.playback?.r2TrackId;
        if (!s() || !trackId) return Promise.resolve();
        return s().addToQueue(trackId);
      },
      removeFromQueue: (queueItemId) =>
        s() ? s().removeFromQueue(queueItemId) : Promise.resolve(),
      playQueueItem: (queueItemId) => {
        const item = jamStateRef.current?.queue.find((q) => q.id === queueItemId);
        if (!s() || !item) return Promise.resolve();
        return s().setTrack(item.trackId);
      },
      suggestTrack: (index) => {
        const trackId = songsRef.current[index]?.playback?.r2TrackId;
        if (!s() || !trackId) return Promise.resolve();
        return s().suggestTrack(trackId);
      },
      setCollaborative: (on) => (s() ? s().setCollaborative(on) : Promise.resolve()),
      sendChat: (text) => s()?.sendChat(text),
      sendReaction: (emoji) => s()?.sendReaction(emoji),
      startSleepTimer: (ms) => s()?.startSleepTimer(ms),
      cancelSleepTimer: () => s()?.cancelSleepTimer(),
    };
  }

  // ── Readiness: tell the session when the pending track finished buffering ──
  useEffect(() => {
    const session = sessionRef.current;
    if (!session || !jamState?.state) return;
    const pending = jamState.state.trackId && jamState.state.playbackState === "idle";
    if (pending && !managerStateRef.current.isLoading && managerStateRef.current.duration > 0) {
      session.notifyPlayerReady();
    }
  }, [jamState?.state?.trackId, jamState?.state?.playbackState, managerStateRef.current.isLoading, managerStateRef.current.duration, jamState]);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      sessionRef.current?.dispose();
      sessionRef.current = null;
    };
  }, []);

  // Derive ended phase from session state
  useEffect(() => {
    if (jamState?.connection === "ended" || jamState?.state?.playbackState === "ended") {
      if (phase === "active") setPhase("ended");
    }
  }, [jamState?.connection, jamState?.state?.playbackState, phase]);

  return {
    phase,
    jamState,
    joinError,
    actions: actions.current!,
    session: sessionRef,
  };
}
