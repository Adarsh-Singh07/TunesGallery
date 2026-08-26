"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Disc3, MessageCircle } from "lucide-react";

import { songs } from "../data/songs";
import { site } from "../data/site";
import { getQuoteForSong } from "../data/quotes";
import { getThemeForSong, type CinematicTheme, THEMES, THEME_ORDER, type ThemeId } from "../data/themes";

import { LiveListeners, LiveTimeWeather } from "./TopbarWidgets";
import ChatPanel from "./ChatPanel";

import { usePlayback } from "../lib/playback/usePlayback";
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

export default function MusicRoom() {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [hasEntered, setHasEntered]           = useState(false);
  const [resumeState, setResumeState]         = useState<ListeningState | null>(null);
  const [manualThemeId, setManualThemeId]     = useState<ThemeId | null>(null);
  const [activeTheme, setActiveTheme]         = useState<CinematicTheme>(
    THEMES[THEME_ORDER[0]]
  );

  const { state, controls } = usePlayback(songs);

  // Derive current song
  const song = songs[state.currentIndex] ?? null;

  // On mount: check if session entered previously
  useEffect(() => {
    if (hasSessionEntered()) {
      setHasEntered(true);
      const ls = loadListeningState();
      if (ls) setResumeState(ls);
    }
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

  // Update theme when manual selection changes
  useEffect(() => {
    if (manualThemeId) {
      setActiveTheme(THEMES[manualThemeId]);
    }
  }, [manualThemeId]);

  // Persist listening state while playing
  useEffect(() => {
    if (hasEntered && song && state.isPlaying) {
      import("../lib/persistence").then(({ saveListeningState }) => {
        saveListeningState({
          songId: song.id,
          position: state.currentTime,
          provider: state.activeProvider,
        });
      });
    }
  }, [hasEntered, song?.id, state.currentTime, state.activeProvider, state.isPlaying]);

  // Derived quote
  const quote = song ? getQuoteForSong(song.id, activeTheme.id) : null;

  const hasRef =
    state.activeProvider === "youtube"
      ? state.hasYouTubeId
      : state.activeProvider === "spotify"
      ? state.hasSpotifyId
      : false;

  function handleEnter() {
    markSessionEntered();
    setHasEntered(true);
    controls.initializePlayer();
  }

  async function handleResume(resume: boolean) {
    markSessionEntered();
    setHasEntered(true);

    if (resume && resumeState) {
      const idx = songs.findIndex((s) => s.id === resumeState.songId);
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
    controls.selectSong(index);
  }

  if (!songs.length) {
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

      {/* ── Entry gate & Resume prompt ────────────────────────── */}
      <AnimatePresence>
        {!hasEntered && (
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

      {/* ── Top bar ───────────────────────────────────────────── */}
      <header className="topbar">
        <div className="topbar-brand" aria-label="Live Listeners">
          <LiveListeners />
        </div>

        <div className="topbar-center">
          <LiveTimeWeather />
        </div>

        <div className="topbar-actions">
          <AtmosphereSelector
            currentMode={manualThemeId}
            onSelect={setManualThemeId}
          />
          <button
            className="archive-btn chat-btn"
            onClick={() => setChatOpen(true)}
            aria-label="Open Chat"
            aria-expanded={chatOpen}
          >
            <MessageCircle size={17} strokeWidth={1.5} />
            <span className="topbar-archive-label">CHAT</span>
          </button>
          <button
            className="archive-btn"
            onClick={() => setLibraryOpen(true)}
            aria-label="Open archive"
            aria-expanded={libraryOpen}
          >
            <Disc3 size={17} strokeWidth={1.5} />
            <span className="topbar-archive-label">ARCHIVE</span>
          </button>
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
                totalTracks={songs.length}
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
              hasPlaybackRef={hasRef}
              errorMessage={state.errorMessage}
              controls={controls}
            />

            <ProviderSelector
              activeProvider={state.activeProvider}
              spotifyConnected={state.spotifyConnected}
              spotifyConnecting={state.spotifyConnecting}
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
        <span>{songs.length} SONGS</span>
        <span className="ticker-dot" aria-hidden="true">◆</span>
        <span>{site.footer.mottoLine}</span>
      </footer>

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
              songs={songs}
              currentIndex={state.currentIndex}
              isPlaying={state.isPlaying}
              onSelect={chooseSong}
              onClose={() => setLibraryOpen(false)}
            />
          </>
        )}
      </AnimatePresence>

      <ChatPanel isOpen={chatOpen} onClose={() => setChatOpen(false)} />
    </main>
  );
}
