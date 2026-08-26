"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Disc3 } from "lucide-react";
import { songs } from "../data/songs";
import { site } from "../data/site";
import { usePlayback } from "../lib/playback/usePlayback";
import { padTrack } from "../lib/utils";
import AmbientBackground from "./AmbientBackground";
import Record from "./Record";
import SongInfo from "./SongInfo";
import PlayerControls from "./PlayerControls";
import Library from "./Library";
import ProviderSelector from "./ProviderSelector";
import YouTubeWidget from "./YouTubeWidget";
import EntryGate from "./EntryGate";

export default function MusicRoom() {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);

  const { state, controls } = usePlayback(songs);

  const song     = songs[state.currentIndex] ?? null;
  const accent   = song?.accent ?? site.theme.accent;
  const hasRef   = state.activeProvider === "youtube"
    ? state.hasYouTubeId
    : state.activeProvider === "spotify"
    ? state.hasSpotifyId
    : false;

  function handleEnter() {
    setHasEntered(true);
    controls.initializePlayer();
  }

  function chooseSong(index: number) {
    setLibraryOpen(false);
    controls.selectSong(index);
  }

  if (!songs.length) {
    return (
      <main className="room" style={{ display: "grid", placeItems: "center" }}>
        <p style={{ color: "var(--muted)", fontFamily: "monospace", letterSpacing: "0.15em" }}>
          NO SONGS LOADED
        </p>
      </main>
    );
  }

  return (
    <main className="room" aria-label="adhurekisse music room">
      {/* ── Ambient ─────────────────────────────────── */}
      <AmbientBackground accent={accent} />

      {/* ── YouTube player widget (always in DOM when YT is provider) ──── */}
      <YouTubeWidget
        activeProvider={state.activeProvider}
        isPlaying={state.isPlaying}
      />

      {/* ── Entry gate overlay ──────────────────────── */}
      <AnimatePresence>
        {!hasEntered && (
          <EntryGate
            siteName={site.name}
            tagline={site.tagline}
            onEnter={handleEnter}
          />
        )}
      </AnimatePresence>

      {/* ── Top bar ─────────────────────────────────── */}
      <header className="topbar">
        <div className="topbar-brand">
          <span className="brand-dot" aria-hidden="true" />
          <span className="brand-name">{site.name}</span>
        </div>

        <p className="topbar-eyebrow">{site.eyebrow}</p>

        <button
          className="archive-btn"
          onClick={() => setLibraryOpen(true)}
          aria-label="Open archive"
          aria-expanded={libraryOpen}
        >
          <Disc3 size={19} strokeWidth={1.5} />
          <span className="topbar-archive-label">ARCHIVE</span>
        </button>
      </header>

      {/* ── Hero ────────────────────────────────────── */}
      <section className="hero" aria-label="Music player">
        {/* Left: brand copy */}
        <div className="hero-copy">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          >
            <p className="copy-eyebrow">A PRIVATE MUSIC ROOM</p>
            <h1 className="copy-title" lang="hi">{site.name}</h1>
            <p className="copy-tagline">{site.tagline}</p>
          </motion.div>
        </div>

        {/* Center: vinyl record */}
        <motion.div
          className="hero-record"
          initial={{ opacity: 0, scale: 0.88 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={song?.id}
              initial={{ opacity: 0, rotate: -8, scale: 0.92 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 8, scale: 0.94 }}
              transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <Record
                coverSrc={song?.cover}
                songId={song?.id ?? "00"}
                artistLabel={song?.artist ?? ""}
                trackNumber={padTrack(state.currentIndex + 1)}
                isPlaying={state.isPlaying}
              />
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* Right: song info + controls */}
        <div className="hero-player">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: "easeOut", delay: 0.25 }}
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

            {/* Provider selector — subtle, integrated */}
            <ProviderSelector
              activeProvider={state.activeProvider}
              spotifyConnected={state.spotifyConnected}
              spotifyConnecting={state.spotifyConnecting}
              hasYouTubeId={state.hasYouTubeId}
              hasSpotifyId={state.hasSpotifyId}
              onSwitch={controls.switchProvider}
              onConnectSpotify={controls.connectSpotify}
            />
          </motion.div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────── */}
      <footer className="ticker" aria-label="Collection info">
        <span>{site.footer.collectionLabel}</span>
        <span className="ticker-dot" aria-hidden="true">·</span>
        <span>{songs.length} SONGS</span>
        <span className="ticker-dot" aria-hidden="true">·</span>
        <span>{site.footer.mottoLine}</span>
      </footer>

      {/* ── Library overlay ─────────────────────────── */}
      <AnimatePresence>
        {libraryOpen && (
          <>
            <motion.div
              className="library-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
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
    </main>
  );
}
