"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, LogOut, ShieldCheck, LogIn } from "lucide-react";

import { songs as baseSongs } from "../data/songs";
import { site } from "../data/site";
import { usePlayback, type PlaybackControls } from "../lib/playback/usePlayback";
import type { PlaybackManager } from "../lib/playback/PlaybackManager";
import type { Song } from "../data/songs";
import { padTrack } from "../lib/utils";

import LiveClock from "./LiveClock";
import AuthGate from "./AuthGate";
import JamPanel from "./jam/JamPanel";
import { useJam } from "../lib/jam/useJam";
import { supabase } from "../lib/supabase";
import { getSession, getProfile, signOut, authedFetch, type Profile, type TrackRow } from "../lib/auth";

import AmbientBackground from "./AmbientBackground";
import EntryGate from "./EntryGate";
import PlayerControls from "./PlayerControls";
import Record from "./Record";
import SongInfo from "./SongInfo";
import YouTubeWidget from "./YouTubeWidget";
import QuoteDisplay from "./QuoteDisplay";
import { getQuoteForSong } from "../data/quotes";
import { getThemeForSong } from "../data/themes";

// ─────────────────────────────────────────────────────────────────────────────
// Session persistence (simple, no Supabase)
// ─────────────────────────────────────────────────────────────────────────────

function markEntered() {
  try { sessionStorage.setItem("ofy_entered", "1"); } catch { /* noop */ }
}

function hasEntered(): boolean {
  try { return !!sessionStorage.getItem("ofy_entered"); } catch { return false; }
}

/** Map a private-library row onto the Song shape this player understands. */
function trackToSong(t: TrackRow): Song {
  return {
    id: `r2-${t.id}`,
    title: t.title,
    artist: t.artist,
    album: t.album ?? undefined,
    year: t.year ?? undefined,
    artwork: { cover: t.artworkUrl ?? "/favicon.svg" },
    playback: { r2TrackId: t.id },
    accent: site.theme.accent,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

export default function MusicRoom() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [entered, setEntered] = useState(false);
  const [jamOpen, setJamOpen] = useState(false);

  // ── Auth (active only when Supabase is configured) ──────────────────────────
  const authEnabled = !!supabase;
  const [authChecked, setAuthChecked] = useState(!authEnabled);
  const [signedIn, setSignedIn] = useState(!authEnabled);
  const [profile, setProfile] = useState<Profile | null>(null);

  // ── Private R2 library (empty until signed in and tracks exist) ─────────────
  const [r2Songs, setR2Songs] = useState<Song[]>([]);
  const allSongs = useMemo(() => [...baseSongs, ...r2Songs], [r2Songs]);

  const { state, controls, manager } = usePlayback(baseSongs);
  const managerRef = useRef<PlaybackManager | null>(null);
  managerRef.current = manager;
  const getManager = useCallback(() => managerRef.current, []);

  const jam = useJam(getManager, allSongs);
  const jamActive = jam.phase === "active" && !!jam.jamState;
  const jamCanControl = jam.jamState?.canControl ?? false;
  const jamPlaying = jam.jamState?.state?.playbackState === "playing";

  const song = allSongs[state.currentIndex] ?? null;

  // On mount: if already entered this session, skip gate
  useEffect(() => {
    if (hasEntered()) {
      setEntered(true);
    }
  }, []);

  // On mount: resolve auth state
  useEffect(() => {
    if (!authEnabled) return;
    let cancelled = false;
    (async () => {
      const session = await getSession();
      if (cancelled) return;
      if (!session) {
        setSignedIn(false);
        setAuthChecked(true);
        return;
      }
      const p = await getProfile();
      if (cancelled) return;
      setProfile(p);
      setSignedIn(!!p);
      setAuthChecked(true);
    })();
    const { data } = supabase!.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setSignedIn(false);
        setProfile(null);
      }
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [authEnabled]);

  // Fetch the private library when signed in
  useEffect(() => {
    if (!authEnabled || !signedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch("/api/tracks");
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { tracks: TrackRow[] };
        const mapped = (body.tracks ?? [])
          .filter((t) => t.status === "ready")
          .map(trackToSong);
        if (!cancelled) setR2Songs(mapped);
      } catch {
        /* library stays empty — YouTube songs still play */
      }
    })();
    return () => { cancelled = true; };
  }, [authEnabled, signedIn]);

  // Push the merged library into the manager once fetched
  useEffect(() => {
    if (r2Songs.length > 0) controls.setSongs(allSongs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r2Songs.length]);

  // Auto-join a jam from an invite link (?jam=CODE)
  const autoJoinTried = useRef(false);
  useEffect(() => {
    if (autoJoinTried.current) return;
    if (!signedIn || !entered || jam.phase !== "idle") return;
    const code = new URLSearchParams(window.location.search).get("jam");
    if (code) {
      autoJoinTried.current = true;
      void jam.actions.joinRoom(code);
    }
  }, [signedIn, entered, jam.phase, jam.actions]);

  // PWA service worker
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  // Keep silence.wav audio element in sync with playing state (OS media session hack)
  useEffect(() => {
    if (state.isPlaying && audioRef.current) {
      audioRef.current.play().catch(() => {});
    } else if (!state.isPlaying && audioRef.current) {
      audioRef.current.pause();
    }
  }, [state.isPlaying]);

  // ── Controls routing: solo → direct; jam → shared-timeline commands ────────
  const jamControls: PlaybackControls = useMemo(
    () => ({
      togglePlay: () => {
        if (!jamCanControl) return;
        void (jamPlaying ? jam.actions.pause() : jam.actions.play());
      },
      previous: () => {
        if (!jamCanControl) return;
        void jam.actions.seek(0);
      },
      next: () => {
        if (!jamCanControl) return;
        const q = jam.jamState?.queue ?? [];
        const currentRoomTrackId = jam.jamState?.state?.trackId;
        const pos = q.findIndex((item) => item.trackId === currentRoomTrackId);
        const nextItem = pos >= 0 ? q[pos + 1] : q[0];
        if (nextItem) void jam.actions.playQueueItem(nextItem.id);
      },
      seek: (s) => {
        if (!jamCanControl) return;
        void jam.actions.seek(s);
      },
      setVolume: controls.setVolume,
      toggleMute: controls.toggleMute,
      toggleShuffle: () => {},
      cycleRepeat: () => {},
      selectSong: (index) => {
        if (!jamCanControl) return;
        void jam.actions.playTrack(index);
      },
      switchProvider: controls.switchProvider,
      initializePlayer: controls.initializePlayer,
      setSongs: controls.setSongs,
      setRate: controls.setRate,
    }),
    [jamCanControl, jamPlaying, jam.actions, jam.jamState?.queue, jam.jamState?.state?.trackId, controls],
  );
  const effectiveControls = jamActive ? jamControls : controls;
  const effectiveHasRef = jamActive
    ? (jamCanControl ? state.hasR2Track || state.hasYouTubeId : false)
    : state.hasYouTubeId;

  function handleEnter() {
    markEntered();
    setEntered(true);
    controls.initializePlayer();
  }

  async function handleSignOut() {
    await signOut();
    window.location.href = "/login";
  }

  if (!allSongs.length) {
    return (
      <main className="room" style={{ display: "grid", placeItems: "center" }}>
        <p style={{ fontFamily: "var(--font-mono)", color: "var(--muted)", letterSpacing: "0.15em" }}>
          NO SONGS LOADED
        </p>
      </main>
    );
  }

  const accentColor = song?.accent ?? site.theme.accent;

  return (
    <main
      className="room"
      aria-label="OnlyForYou — private music room"
      style={{
        "--ta": accentColor,
        "--ta-soft": `${accentColor}22`,
      } as React.CSSProperties}
    >
      {/* ── Cinematic ambient background ───────────────────────────── */}
      <AmbientBackground
        accent={accentColor}
        coverUrl={song?.artwork?.cover}
        songId={song?.id}
      />

      {/* ── YouTube player (off-screen, required by YT ToS) ─────────── */}
      <YouTubeWidget />

      {/* ── Auth gate (before the entry gate) ───────────────────────── */}
      <AnimatePresence>
        {authEnabled && authChecked && !signedIn && (
          <AuthGate key="auth" siteName="OnlyForYou" />
        )}
      </AnimatePresence>

      {/* ── Entry gate ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {!entered && (!authEnabled || signedIn) && (
          <EntryGate key="entry" onEnter={handleEnter} />
        )}
      </AnimatePresence>

      {/* ── DESKTOP LAYOUT ─────────────────────────────────────────── */}
      <div className="desktop-only-layout">
        {/* Top bar */}
        <header className="topbar">
          <div className="topbar-brand">
            <span className="brand-pip" aria-hidden="true" />
            <span className="brand-name">ONLYFORYOU</span>
            <LiveClock />
          </div>
          <div className="topbar-actions">
            {authEnabled && signedIn && profile?.is_admin && (
              <a
                className="archive-btn"
                href="/admin"
                aria-label="Owner dashboard"
                title="Owner dashboard"
              >
                <ShieldCheck size={17} strokeWidth={1.5} />
                <span className="topbar-archive-label">ADMIN</span>
              </a>
            )}
            <button
              className="archive-btn"
              onClick={() => setJamOpen(true)}
              aria-label="Jam together"
              aria-expanded={jamOpen}
              title="Jam together"
            >
              <Users size={17} strokeWidth={1.5} />
              <span className="topbar-archive-label">JAM</span>
            </button>
            {authEnabled && (signedIn ? (
              <button
                className="archive-btn"
                onClick={() => void handleSignOut()}
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={17} strokeWidth={1.5} />
              </button>
            ) : (
              <a className="archive-btn" href="/login" aria-label="Sign in" title="Sign in">
                <LogIn size={17} strokeWidth={1.5} />
              </a>
            ))}
            <span className="topbar-collection">
              {site.footer.collectionLabel} · {allSongs.length} SONGS
            </span>
          </div>
        </header>

        {/* Hero — 3-column editorial grid */}
        <section className="hero" aria-label="Music player">
          {/* LEFT: vinyl record */}
          <div className="hero-left">
            <motion.div
              initial={{ opacity: 0, scale: 0.90 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.10 }}
            >
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={song?.id}
                  initial={{ opacity: 0, scale: 0.94, rotateY: -6 }}
                  animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                  exit={{ opacity: 0, scale: 0.96, rotateY: 6 }}
                  transition={{ duration: 0.65, ease: [0.25, 0.46, 0.45, 0.94] }}
                >
                  <Record
                    coverSrc={song?.artwork?.cover}
                    songId={song?.id ?? "00"}
                    artistLabel={song?.artist ?? ""}
                    trackNumber={padTrack(state.currentIndex + 1)}
                    isPlaying={state.isPlaying}
                  />
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </div>

          {/* CENTER: brand mark */}
          <div className="hero-center">
            <motion.div
              className="brand-mark"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.9, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <span className="brand-line-1">Only</span>
              <span className="brand-line-2">ForYou</span>
              <p className="brand-tagline">{site.tagline}</p>
            </motion.div>

            {/* Decorative heart */}
            <motion.div
              className="center-heart"
              animate={{ scale: [1, 1.06, 1], opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              aria-hidden="true"
            >
               ♥
            </motion.div>

            <QuoteDisplay quote={getQuoteForSong(song?.id ?? "01")} songId={song?.id ?? "01"} />
          </div>

          {/* RIGHT: song info + controls */}
          <div className="hero-right">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.9, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.15 }}
            >
              {song && (
                <SongInfo
                  song={song}
                  trackNumber={padTrack(state.currentIndex + 1)}
                  totalTracks={allSongs.length}
                />
              )}

              <PlayerControls
                isPlaying={state.isPlaying}
                currentTime={state.currentTime}
                duration={state.duration}
                volume={state.volume}
                isMuted={state.isMuted}
                isLoading={state.isLoading}
                shuffle={state.shuffle}
                repeat={state.repeat}
                hasSong={!!song}
                hasPlaybackRef={effectiveHasRef}
                errorMessage={state.errorMessage}
                controls={effectiveControls}
                onPlayAction={() => {
                  if (audioRef.current && !state.isPlaying) {
                    audioRef.current.play().catch(() => {});
                  }
                }}
              />
            </motion.div>
          </div>
        </section>

        {/* Footer */}
        <footer className="ticker" aria-label="Collection info">
          <span>{site.footer.collectionLabel}</span>
          <span className="ticker-dot" aria-hidden="true">◆</span>
          <span>{allSongs.length} SONGS</span>
          <span className="ticker-dot" aria-hidden="true">◆</span>
          <span>{site.footer.mottoLine}</span>
        </footer>
      </div>

      {/* ── MOBILE LAYOUT ──────────────────────────────────────────── */}
      <div className="mobile-only-layout">
        <header className="mobile-header">
          <div className="mobile-brand-badge">
            <span className="brand-pip" aria-hidden="true" />
            <span className="brand-name">ONLYFORYOU</span>
            <LiveClock />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {authEnabled && signedIn && profile?.is_admin && (
              <a href="/admin" aria-label="Owner dashboard" title="Owner dashboard">
                <ShieldCheck size={18} strokeWidth={1.5} />
              </a>
            )}
            <button onClick={() => setJamOpen(true)} aria-label="Jam together" title="Jam together">
              <Users size={18} strokeWidth={1.5} />
            </button>
            <span className="mobile-track-counter">
              {padTrack(state.currentIndex + 1)} / {padTrack(allSongs.length)}
            </span>
          </div>
        </header>

        <div className="mobile-main">
          {/* Brand title */}
          <div className="mobile-brand-section">
            <div className="mobile-brand-title">
              <span className="mobile-brand-1">Only</span>
              <span className="mobile-brand-2">ForYou</span>
            </div>
          </div>

          {/* Disc */}
          <div className="mobile-disc-wrap">
            <Record
              coverSrc={song?.artwork?.cover}
              songId={song?.id ?? "00"}
              artistLabel={song?.artist ?? ""}
              trackNumber={padTrack(state.currentIndex + 1)}
              isPlaying={state.isPlaying}
            />
          </div>

          <div style={{ marginTop: "1rem", marginBottom: "1rem" }}>
            <QuoteDisplay quote={getQuoteForSong(song?.id ?? "01")} songId={song?.id ?? "01"} />
          </div>

          {/* Song info (mobile) */}
          <div className="mobile-player-section">
            {song && (
              <div className="mobile-song-meta">
                <span className="mobile-song-title">{song.title}</span>
                <span className="mobile-song-artist">
                  {song.artist}{song.year ? ` · ${song.year}` : ""}
                </span>
              </div>
            )}

            <PlayerControls
              isPlaying={state.isPlaying}
              currentTime={state.currentTime}
              duration={state.duration}
              volume={state.volume}
              isMuted={state.isMuted}
              isLoading={state.isLoading}
              shuffle={state.shuffle}
              repeat={state.repeat}
              hasSong={!!song}
              hasPlaybackRef={effectiveHasRef}
              errorMessage={state.errorMessage}
              controls={effectiveControls}
              onPlayAction={() => {
                if (audioRef.current && !state.isPlaying) {
                  audioRef.current.play().catch(() => {});
                }
              }}
            />
          </div>
        </div>

        <footer className="mobile-footer">
          <span>{site.footer.mottoLine}</span>
        </footer>
      </div>

      <AnimatePresence>
        {jamOpen && (
          <JamPanel
            open={jamOpen}
            onClose={() => setJamOpen(false)}
            phase={jam.phase}
            jamState={jam.jamState}
            joinError={jam.joinError}
            actions={jam.actions}
            currentTrackTitle={song?.title}
            libraryTracks={allSongs
              .map((s, index) => ({ index, s }))
              .filter(({ s }) => !!s.playback?.r2TrackId)
              .map(({ index, s }) => ({
                index,
                trackId: s.playback.r2TrackId!,
                title: s.title,
                artist: s.artist,
              }))}
          />
        )}
      </AnimatePresence>

      {/* Silence audio for OS media session */}
      <audio ref={audioRef} src="/silence.wav" loop playsInline muted={false} style={{ display: "none" }} />
    </main>
  );
}
