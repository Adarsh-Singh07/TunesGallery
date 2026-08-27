"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { songs } from "../data/songs";
import { site } from "../data/site";
import { usePlayback } from "../lib/playback/usePlayback";
import { padTrack } from "../lib/utils";

import AmbientBackground from "./AmbientBackground";
import EntryGate from "./EntryGate";
import PlayerControls from "./PlayerControls";
import Record from "./Record";
import SongInfo from "./SongInfo";
import YouTubeWidget from "./YouTubeWidget";
import QuoteDisplay from "./QuoteDisplay";
import LiveClock from "./LiveClock";
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

// ─────────────────────────────────────────────────────────────────────────────

export default function MusicRoom() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [entered, setEntered] = useState(false);

  const { state, controls } = usePlayback(songs);
  const song = songs[state.currentIndex] ?? null;

  // On mount: if already entered this session, skip gate
  useEffect(() => {
    if (hasEntered()) {
      setEntered(true);
    }
  }, []);

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

  function handleEnter() {
    markEntered();
    setEntered(true);
    controls.initializePlayer();
  }

  if (!songs.length) {
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

      {/* ── Entry gate ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {!entered && (
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
            <span className="topbar-collection">
              {site.footer.collectionLabel} · {songs.length} SONGS
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
                hasPlaybackRef={state.hasYouTubeId}
                errorMessage={state.errorMessage}
                controls={controls}
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
          <span>{songs.length} SONGS</span>
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
          <span className="mobile-track-counter">
            {padTrack(state.currentIndex + 1)} / {padTrack(songs.length)}
          </span>
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
              hasPlaybackRef={state.hasYouTubeId}
              errorMessage={state.errorMessage}
              controls={controls}
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

      {/* Silence audio for OS media session */}
      <audio ref={audioRef} src="/silence.wav" loop playsInline muted={false} style={{ display: "none" }} />
    </main>
  );
}
