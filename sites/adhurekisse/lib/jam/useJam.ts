"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlaybackManager } from "../playback/PlaybackManager";
import type { Song } from "../../data/songs";
import { supabase } from "../supabase";
import { getProfile } from "../auth";
import { JamSession, type JamUiState, type PlayerAdapter } from "./JamSession";
import { attachJamTransport, type JamTransportHandlers } from "./transport";
export type { JamTransportHandlers } from "./transport";

export type JamPhase = "idle" | "joining" | "active" | "ended";

export interface JamActions {
  createRoom: (collaborative: boolean) => Promise<void>;
  joinRoom: (code: string) => Promise<void>;
  leave: () => Promise<void>;
  end: () => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  seek: (seconds: number) => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  onEnded: () => Promise<void>;
  resumeLocal: () => Promise<void>;
  playTrack: (index: number) => Promise<void>;
  addToQueue: (index: number) => Promise<void>;
  removeFromQueue: (queueItemId: string) => Promise<void>;
  reorderQueue: (orderedIds: string[]) => Promise<void>;
  playQueueItem: (queueItemId: string) => Promise<void>;
  suggestTrack: (index: number) => Promise<void>;
  setCollaborative: (on: boolean) => Promise<void>;
  sendChat: (text: string) => void;
  sendReaction: (emoji: string) => void;
  startSleepTimer: (ms: number) => void;
  cancelSleepTimer: () => void;
}

export function useJam(getManager: () => PlaybackManager | null, songs: Song[]) {
  const [phase, setPhase] = useState<JamPhase>("idle");
  const [jamState, setJamState] = useState<JamUiState | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const sessionRef = useRef<JamSession | null>(null);
  const detachRef = useRef<(() => void) | null>(null);
  const generation = useRef(0);
  const joining = useRef(false);
  const mounted = useRef(true);
  const songsRef = useRef(songs);
  songsRef.current = songs;

  const detach = useCallback(() => {
    detachRef.current?.();
    detachRef.current = null;
    sessionRef.current?.dispose();
    sessionRef.current = null;
  }, []);

  const attachSession = useCallback(async (roomId: string, userId: string, displayName: string) => {
    detach();
    const manager = getManager() as (PlaybackManager & {
      setTransportHandlers?: (handlers: JamTransportHandlers | null) => void | (() => void);
    }) | null;
    if (!manager?.setTransportHandlers) throw new Error("The player is not ready for Jam yet. Try again in a moment.");
    // Query getState directly: manager.subscribe intentionally omits time-only updates.
    const assertPlayer = () => {
      const state = manager.getState();
      if (state.hasError) throw new Error(state.errorMessage || "Audio could not be loaded.");
    };
    const player: PlayerAdapter = {
      loadTrack: async (index, autoplay) => { await manager.selectSong(index, autoplay); assertPlayer(); },
      play: async () => {
        await manager.play();
        assertPlayer();
        if (!manager.getState().isPlaying) throw new Error("Tap Enable audio to allow playback on this device.");
      },
      pause: () => manager.pause(),
      seek: (seconds) => manager.seek(seconds),
      setRate: (rate) => manager.setRate(rate),
      getPosition: () => manager.getState().currentTime,
      getDuration: () => manager.getState().duration,
      isPlaying: () => manager.getState().isPlaying,
      isBuffered: () => { const s = manager.getState(); return !s.isLoading && !s.hasError && s.duration > 0; },
    };
    const session = new JamSession({
      db: supabase!, roomId, userId, displayName, player,
      resolveTrack: (id) => {
        const index = songsRef.current.findIndex((song) => song.playback?.r2TrackId === id);
        return index < 0 ? null : index;
      },
    });
    sessionRef.current = session;
    const releaseTransport = attachJamTransport({
      setTransportHandlers: (handlers) => manager.setTransportHandlers!(handlers),
      subscribe: (listener) => manager.subscribe(listener),
    }, session, (error) => {
      if (mounted.current && sessionRef.current === session) setJoinError(error instanceof Error ? error.message : "Jam control failed.");
    });
    let unsubscribeSession = () => {};
    let detached = false;
    const cleanup = () => {
      if (detached) return;
      detached = true;
      releaseTransport();
      unsubscribeSession();
    };
    detachRef.current = cleanup;
    unsubscribeSession = session.subscribe((state) => {
      if (!mounted.current || sessionRef.current !== session) return;
      setJamState(state);
      if (state.connection === "ended") {
        cleanup();
        sessionRef.current = null;
        setPhase("ended");
      }
    });
    try {
      await session.start();
      if (mounted.current && sessionRef.current === session) setPhase("active");
    } catch (error) {
      cleanup();
      session.dispose();
      if (sessionRef.current === session) sessionRef.current = null;
      throw error;
    }
  }, [detach, getManager]);

  const enter = useCallback(async (kind: "create" | "join", value: boolean | string) => {
    if (joining.current || sessionRef.current) return;
    const token = ++generation.current;
    joining.current = true;
    setJoinError(null);
    setPhase("joining");
    try {
      if (!supabase) throw new Error("Sign in to start a Jam.");
      const manager = getManager() as (PlaybackManager & { setTransportHandlers?: unknown }) | null;
      if (typeof manager?.setTransportHandlers !== "function") throw new Error("The player is not ready for Jam yet. Try again in a moment.");
      const profile = await getProfile();
      if (!profile) throw new Error("Sign in to start a Jam.");
      if (!mounted.current || token !== generation.current) return;
      const roomId = kind === "create"
        ? (await JamSession.createRoom(supabase, Boolean(value))).roomId
        : await JamSession.joinRoom(supabase, String(value));
      if (!mounted.current || token !== generation.current) return;
      await attachSession(roomId, profile.id, profile.display_name || "Listener");
    } catch (error) {
      if (mounted.current && token === generation.current) {
        setPhase("idle");
        setJamState(null);
        setJoinError(error instanceof Error ? error.message : "Could not open the room.");
      }
    } finally { if (token === generation.current) joining.current = false; }
  }, [attachSession, getManager]);

  const actions = useMemo<JamActions>(() => {
    const session = () => {
      if (!sessionRef.current) throw new Error("Join a Jam first.");
      return sessionRef.current;
    };
    const track = (index: number) => {
      const id = songsRef.current[index]?.playback?.r2TrackId;
      if (!id) throw new Error("Only private audio tracks can be shared in Jam.");
      return id;
    };
    const reset = () => { detach(); setJamState(null); setPhase("idle"); };
    return {
      createRoom: (collaborative) => enter("create", collaborative),
      joinRoom: (code) => enter("join", code),
      leave: async () => { await sessionRef.current?.leave(); reset(); },
      end: async () => { await session().endRoom(); reset(); },
      play: () => session().play(), pause: () => session().pause(), seek: (sec) => session().seek(sec),
      next: () => session().skipNext(), previous: () => session().seek(0),
      onEnded: async () => { await sessionRef.current?.onEnded(); },
      resumeLocal: () => session().resumeLocal(),
      playTrack: (index) => session().setTrack(track(index)),
      addToQueue: (index) => session().addToQueue(track(index)),
      removeFromQueue: (id) => session().removeFromQueue(id),
      reorderQueue: (ids) => session().reorderQueue(ids),
      playQueueItem: async (id) => {
        await session().playQueueItem(id);
      },
      suggestTrack: (index) => session().suggestTrack(track(index)),
      setCollaborative: (on) => session().setCollaborative(on),
      sendChat: (text) => sessionRef.current?.sendChat(text),
      sendReaction: (emoji) => sessionRef.current?.sendReaction(emoji),
      startSleepTimer: (ms) => sessionRef.current?.startSleepTimer(ms),
      cancelSleepTimer: () => sessionRef.current?.cancelSleepTimer(),
    };
  }, [detach, enter]);

  // Retry resolution when the private library arrives after the room timeline.
  useEffect(() => { sessionRef.current?.refreshLibrary(); }, [songs]);
  useEffect(() => {
    mounted.current = true;
    const generationAtMount = generation.current;
    return () => { mounted.current = false; generation.current = generationAtMount + 1; joining.current = false; detach(); };
  }, [detach]);

  return { phase, jamState, joinError, actions, session: sessionRef };
}
