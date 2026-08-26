"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { Song } from "../data/songs";

interface Props {
  song: Song;
  trackNumber: string;
  totalTracks: number;
}

const variants = {
  enter: { opacity: 0, y: 12 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export default function SongInfo({ song, trackNumber, totalTracks }: Props) {
  return (
    <div className="song-info">
      <p className="song-info-eyebrow">NOW PLAYING</p>

      <AnimatePresence mode="wait">
        <motion.div
          key={song.id}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <h2 className="song-info-title">{song.title}</h2>
          <p className="song-info-artist">
            {song.artist}
            {(song.movie || song.album) && (
              <span className="song-info-separator">
                {" "}·{" "}
                <span className="song-info-album">
                  {song.movie ?? song.album}
                </span>
              </span>
            )}
          </p>
          {song.year && (
            <p className="song-info-year">{song.year}</p>
          )}
        </motion.div>
      </AnimatePresence>

      <p className="song-info-counter">
        {trackNumber} / {String(totalTracks).padStart(2, "0")}
      </p>
    </div>
  );
}
