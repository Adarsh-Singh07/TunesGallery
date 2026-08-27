"use client";

import type { Song } from "../data/songs";
import { AnimatePresence, motion } from "framer-motion";

interface Props {
  song: Song;
  trackNumber: string;
  totalTracks: number;
}

export default function SongInfo({ song, trackNumber, totalTracks }: Props) {
  return (
    <div className="song-info" aria-live="polite" aria-atomic="true">
      <AnimatePresence mode="wait">
        <motion.div
          key={song.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <p className="song-info-eyebrow">
            {trackNumber} / {String(totalTracks).padStart(2, "0")} — NOW PLAYING
          </p>
          <h2 className="song-info-title">{song.title}</h2>
          <p className="song-info-artist">
            <span>{song.artist}</span>
            {song.album && (
              <>
                <span className="song-info-separator"> · </span>
                <span className="song-info-album">{song.album}</span>
              </>
            )}
          </p>
          {song.year && (
            <p className="song-info-year">{song.year}</p>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
