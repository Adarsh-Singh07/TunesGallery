"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Disc3, MessageCircle, Users, LogOut, ShieldCheck, LogIn } from "lucide-react";

import { songs as baseSongs } from "../data/songs";
import { site } from "../data/site";
import { getQuoteForSong } from "../data/quotes";
import { getThemeForSong, type CinematicTheme, THEMES, THEME_ORDER, type ThemeId } from "../data/themes";
import type { Song } from "../data/songs";

import { LiveListeners, LiveTimeWeather } from "./TopbarWidgets";
import ChatPanel from "./ChatPanel";
import AuthGate from "./AuthGate";
import JamPanel from "./jam/JamPanel";
import { supabase } from "../lib/supabase";
import { getSession, getProfile, signOut, authedFetch, type Profile, type TrackRow } from "../lib/auth";
import { useJam } from "../lib/jam/useJam";

import { usePlayback, type PlaybackControls } from "../lib/playback/usePlayback";
import type { PlaybackManager } from "../lib/playback/PlaybackManager";
import {
  markSessionEntered,
  hasSessionEntered,
  loadListeningState,
  clearListeningState,
  type ListeningState,
} from "../lib/persistence";

import AmbientBackground from "./AmbientBackground";
import AtmosphereSelector from "./AtmosphereSelector";
import EntryGate from "./EntryGate";
import Library from "./Library";
import PlayerControls from "./PlayerControls";
import ProviderSelector from "./ProviderSelector";
import QuoteDisplay from "./QuoteDisplay";
import Record from "./Record";
import ResumePrompt from "./ResumePrompt";
import SongInfo from "./SongInfo";
import YouTubeWidget from "./YouTubeWidget";

function padTrack(n: number) {
  return String(n).padStart(2, "0");
}

function buildThemeStyle(theme: CinematicTheme): React.CSSProperties {
  return {
    "--tp":        theme.primary,
    "--ts":        theme.secondary,
    "--ta":        theme.accent,
    "--ta-soft":   theme.accentSoft,
    "--tm":        theme.muted,
    "--tq":        theme.quoteColor,
    "--tb":        theme.border,
    "--tsf":       theme.surface,
    "--tsh":       theme.surfaceHover,
    "--tw-shadow": theme.shadow,
    "--ot":        theme.overlayTop,
    "--ob":        theme.overlayBottom,
    "--ov":        theme.vignetteColor,
    "--ga":        theme.gradientAngle,
  } as React.CSSProperties;
}

/** Map a private-library row onto the Song shape the player understands. */
function trackToSong(t: TrackRow): Song {
  return {
    id: `r2-${t.id}`,
    title: t.title,
    artist: t.artist,
    album: t.album ?? undefined,
    movie: t.movie ?? undefined,
    year: t.year ?? undefined,
    tags: t.tags ?? [],
    artwork: { cover: t.artworkUrl ?? "/icon.svg" },
    playback: { r2TrackId: t.id },
    accent: "#c9a560",
  };
}

export default function MusicRoom() {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [chatOpen, setChatOpen] = useState(false);
  const [jamOpen, setJamOpen] = useState(false);
  const [hasEntered, setHasEntered]           = useState(false);
  const [resumeState, setResumeState]         = useState<ListeningState | null>(null);
  const [manualThemeId, setManualThemeId]     = useState<ThemeId | null>(null);
  const [activeTheme, setActiveTheme]         = useState<CinematicTheme>(
    THEMES[THEME_ORDER[0]]
  );

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

  // Derive current song
  const song = allSongs[state.currentIndex] ?? null;

  const [listeners, setListeners] = useState(1);

  // On mount: check if session entered previously
  useEffect(() => {
    if (hasSessionEntered()) {
      setHasEntered(true);
      const ls = loadListeningState();
      if (ls) setResumeState(ls);
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
    if (!signedIn || !hasEntered || jam.phase !== "idle") return;
    const code = new URLSearchParams(window.location.search).get("jam");
    if (code) {
      autoJoinTried.current = true;
      void jam.actions.joinRoom(code);
    }
  }, [signedIn, hasEntered, jam.phase, jam.actions]);

  // Supabase Presence for live listening count
  useEffect(() => {
    if (!supabase) return;

    let userId = sessionStorage.getItem("adhure_user_id");
    if (!userId) {
      userId = Math.random().toString(36).substring(2);
      sessionStorage.setItem("adhure_user_id", userId);
    }

    const room = supabase.channel('online-users');

    room
      .on('presence', { event: 'sync' }, () => {
        const newState = room.presenceState();
        let count = 0;
        for (const key in newState) {
          count += newState[key].length;
        }
        setListeners(Math.max(1, count));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await room.track({ user: userId, online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase?.removeChannel(room);
    };
  }, []);

  // Update auto theme when song changes (only if not manual)
  useEffect(() => {
    if (!manualThemeId && song) {
      setActiveTheme(getThemeForSong(song.id));
    }
  }, [song?.id, manualThemeId]);

  useEffect(() => {
    // Service Worker for PWA
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  // Background play hack to keep OS from freezing iframe audio
  useEffect(() => {
    if (state.isPlaying && audioRef.current) {
      audioRef.current.play().catch(() => {});
    } else if (!state.isPlaying && audioRef.current) {
      audioRef.current.pause();
    }
  }, [state.isPlaying]);

  // Update theme when manual selection changes
  useEffect(() => {
    if (manualThemeId) {
      setActiveTheme(THEMES[manualThemeId]);
    }
  }, [manualThemeId]);

  // Persist listening state while playing (solo listening only)
  useEffect(() => {
    if (!jamActive && hasEntered && song && state.isPlaying) {
      import("../lib/persistence").then(({ saveListeningState }) => {
        saveListeningState({
          songId: song.id,
          position: state.currentTime,
          provider: state.activeProvider,
        });
      });
    }
  }, [jamActive, hasEntered, song?.id, state.currentTime, state.activeProvider, state.isPlaying]);

  // Derived quote
  const quote = song ? getQuoteForSong(song.id, activeTheme.id) : null;

  const hasRef =
    state.activeProvider === "r2"
      ? state.hasR2Track
      : state.activeProvider === "youtube"
      ? state.hasYouTubeId
      : state.activeProvider === "spotify"
      ? state.hasSpotifyId
      : false;

  // ── Controls routing: solo → direct; jam → shared-timeline commands ────────
  const soloControls = controls;
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
      setVolume: soloControls.setVolume,
      toggleMute: soloControls.toggleMute,
      toggleShuffle: () => {},
      cycleRepeat: () => {},
      selectSong: (index) => {
        if (!jamCanControl) return;
        void jam.actions.playTrack(index);
      },
      switchProvider: soloControls.switchProvider,
      connectSpotify: soloControls.connectSpotify,
      disconnectSpotify: soloControls.disconnectSpotify,
      initializePlayer: soloControls.initializePlayer,
      setSongs: soloControls.setSongs,
      setRate: soloControls.setRate,
    }),
    [jamCanControl, jamPlaying, jam.actions, jam.jamState?.queue, jam.jamState?.state?.trackId, soloControls],
  );
  const effectiveControls = jamActive ? jamControls : soloControls;
  const effectiveHasRef = jamActive ? (jamCanControl ? state.hasR2Track || hasRef : false) : hasRef;

  function handleEnter() {
    markSessionEntered();
    setHasEntered(true);
    controls.initializePlayer();
  }

  async function handleResume(resume: boolean) {
    markSessionEntered();
    setHasEntered(true);

    if (resume && resumeState) {
      const idx = allSongs.findIndex((s) => s.id === resumeState.songId);
      if (idx !== -1) {
        if (state.activeProvider !== resumeState.provider) {
          await controls.switchProvider(resumeState.provider);
        }
        await controls.selectSong(idx);
        setTimeout(() => controls.seek(resumeState.position), 500);
      }
    } else {
      clearListeningState();
      controls.initializePlayer();
    }
  }

  function chooseSong(index: number) {
    setLibraryOpen(false);
    if (jamActive && jamCanControl) {
      void jam.actions.playTrack(index);
    } else if (!jamActive) {
      controls.selectSong(index);
    }
  }

  async function handleSignOut() {
    await signOut();
    window.location.href = "/login";
  }

  if (!allSongs.length) {
    return (
      <main className="room" style={{ display: "grid", placeItems: "center" }}>
        <p style={{ color: "var(--tm)", fontFamily: "var(--font-mono)", letterSpacing: "0.15em" }}>
          NO SONGS LOADED
        </p>
      </main>
    );
  }

  const themeStyle = buildThemeStyle(activeTheme);

  return (
    <main
      className="room"
      aria-label="adhurekisse music room"
      style={themeStyle}
    >
      {/* ── Cinematic Background ──────────────────────────────── */}
      <AmbientBackground theme={activeTheme} />

      {/* ── YouTube player widget ─────────────────────────────── */}
      <YouTubeWidget
        activeProvider={state.activeProvider}
        isPlaying={state.isPlaying}
      />

      {/* ── Auth gate (before the entry gate) ──────────────────── */}
      <AnimatePresence>
        {authEnabled && authChecked && !signedIn && (
          <AuthGate key="auth" siteName="ADHURE kisse" />
        )}
      </AnimatePresence>

      {/* ── Entry gate & Resume prompt ────────────────────────── */}
      <AnimatePresence>
        {!hasEntered && (!authEnabled || signedIn) && (
          resumeState ? (
            <ResumePrompt key="resume" resumeState={resumeState} onDecide={handleResume} />
          ) : (
            <EntryGate
              key="entry"
              siteName={site.name}
              tagline={site.tagline}
              onEnter={handleEnter}
            />
          )
        )}
      </AnimatePresence>

      {/* ── DESKTOP LAYOUT (Hidden on mobile) ────────────────────────── */}
      <div className="desktop-only-layout">
        {/* ── Top bar ───────────────────────────────────────────── */}
        <header className="topbar">
          <div className="topbar-brand" style={{ display: 'flex', gap: '24px' }}>
            <LiveTimeWeather />
            <LiveListeners count={listeners} />
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
            <button
              className="archive-btn chat-btn"
              onClick={() => setChatOpen(true)}
              aria-label="Open Chat"
              aria-expanded={chatOpen}
              title="Chat"
            >
              <MessageCircle size={17} strokeWidth={1.5} />
              <span className="topbar-archive-label">CHAT</span>
            </button>
            <button
              className="archive-btn"
              onClick={() => setLibraryOpen(true)}
              aria-label="Open Archive"
              aria-expanded={libraryOpen}
              title="Archive"
            >
              <Disc3 size={17} strokeWidth={1.5} className="spin-slow" />
              <span className="topbar-archive-label">ARCHIVE</span>
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
          </div>
        </header>

        {/* ── Hero — 3-column editorial grid ───────────────────── */}
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

          {/* CENTER: brand mark + quote */}
          <div className="hero-center">
            <motion.div
              className="brand-mark"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.9, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <span className="brand-line-1">ADHURE</span>
              <span className="brand-line-2">kisse</span>
              <p className="brand-tagline">{site.tagline}</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.2, delay: 0.4 }}
            >
              <QuoteDisplay quote={quote} songId={song?.id ?? "00"} />
            </motion.div>
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

              <ProviderSelector
                activeProvider={state.activeProvider}
                spotifyConnected={state.spotifyConnected}
                spotifyConnecting={state.spotifyConnecting}
                hasR2Track={state.hasR2Track}
                hasYouTubeId={state.hasYouTubeId}
                hasSpotifyId={state.hasSpotifyId}
                onSwitch={controls.switchProvider}
                onConnectSpotify={controls.connectSpotify}
                onDisconnectSpotify={controls.disconnectSpotify}
              />
            </motion.div>
          </div>
        </section>

        {/* ── Footer ───────────────────────────────────────────── */}
        <footer className="ticker" aria-label="Collection info">
          <span>{site.footer.collectionLabel}</span>
          <span className="ticker-dot" aria-hidden="true">◆</span>
          <span>{allSongs.length} SONGS</span>
          <span className="ticker-dot" aria-hidden="true">◆</span>
          <span>{site.footer.mottoLine}</span>
        </footer>
      </div>

      {/* ── MOBILE-ONLY LAYOUT ────────────────────────────────────── */}
      <div className="mobile-only-layout">
        {/* Topbar compact */}
        <header className="mobile-header">
          <div className="mobile-header-left">
            <LiveTimeWeather />
          </div>
          <div className="mobile-header-right">
            {authEnabled && signedIn && profile?.is_admin && (
              <a className="mobile-btn" href="/admin" title="Owner dashboard">
                <ShieldCheck size={18} strokeWidth={1.5} />
              </a>
            )}
            <button className="mobile-btn" onClick={() => setJamOpen(true)} title="Jam together">
              <Users size={18} strokeWidth={1.5} />
            </button>
            <button
              className="mobile-btn chat-btn"
              onClick={() => setChatOpen(true)}
              title="Chat"
            >
              <MessageCircle size={18} strokeWidth={1.5} />
            </button>
            <button
              className="mobile-btn"
              onClick={() => setLibraryOpen(true)}
              title="Archive"
            >
              <Disc3 size={18} strokeWidth={1.5} className="spin-slow" />
            </button>
          </div>
        </header>

        {/* Main Content Area: Flex container with auto-fit items */}
        <div className="mobile-main">
          {/* Live Listeners & Brand Mark */}
          <div className="mobile-brand-section">
            <div className="mobile-listeners">
              <LiveListeners count={listeners} />
            </div>
            <div className="mobile-brand-title">
              <span className="mobile-brand-1">ADHURE</span>
              <span className="mobile-brand-2">kisse</span>
            </div>
          </div>

          {/* Disc Wrap */}
          <div className="mobile-disc-wrap">
            <Record
              coverSrc={song?.artwork?.cover}
              songId={song?.id ?? "00"}
              artistLabel={song?.artist ?? ""}
              trackNumber={padTrack(state.currentIndex + 1)}
              isPlaying={state.isPlaying}
            />
          </div>

          {/* Player controls */}
          <div className="mobile-player-section">
            {song && (
              <div className="mobile-song-meta">
                <span className="mobile-song-title">{song.title}</span>
                <span className="mobile-song-artist">{song.artist} • {song.year}</span>
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

          {/* Quote display */}
          <div className="mobile-quote-section">
            <QuoteDisplay quote={quote} songId={song?.id ?? "00"} />
          </div>

          {/* Provider selector above footer */}
          <div className="mobile-providers-section">
            <ProviderSelector
              activeProvider={state.activeProvider}
              spotifyConnected={state.spotifyConnected}
              spotifyConnecting={state.spotifyConnecting}
              hasR2Track={state.hasR2Track}
              hasYouTubeId={state.hasYouTubeId}
              hasSpotifyId={state.hasSpotifyId}
              onSwitch={controls.switchProvider}
              onConnectSpotify={controls.connectSpotify}
              onDisconnectSpotify={controls.disconnectSpotify}
            />
          </div>
        </div>

        {/* Footer */}
        <footer className="mobile-footer">
          <span>{site.footer.collectionLabel} • {allSongs.length} SONGS</span>
        </footer>
      </div>

      {/* ── Library overlay ──────────────────────────────────── */}
      <AnimatePresence>
        {libraryOpen && (
          <>
            <motion.div
              className="library-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setLibraryOpen(false)}
              aria-hidden="true"
            />
            <Library
              songs={allSongs}
              currentIndex={state.currentIndex}
              isPlaying={state.isPlaying}
              onSelect={chooseSong}
              onClose={() => setLibraryOpen(false)}
            />
          </>
        )}
      </AnimatePresence>

      <ChatPanel isOpen={chatOpen} onClose={() => setChatOpen(false)} />

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
          />
        )}
      </AnimatePresence>

      <audio ref={audioRef} src="/silence.wav" loop playsInline muted={false} style={{ display: 'none' }} />
    </main>
  );
}
