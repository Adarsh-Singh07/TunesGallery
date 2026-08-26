"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import Image from "next/image";
import type { Song } from "../data/songs";
import SearchBox from "./SearchBox";

interface Props {
  songs: Song[];
  currentIndex: number;
  isPlaying: boolean;
  onSelect: (index: number) => void;
  onClose: () => void;
}

export default function Library({
  songs,
  currentIndex,
  isPlaying,
  onSelect,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter((s) =>
      [s.title, s.artist, s.album, s.movie, s.year, ...(s.tags ?? [])]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q)),
    );
  }, [query, songs]);

  return (
    <motion.aside
      className="library-panel"
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ duration: 0.40, ease: [0.32, 0.72, 0, 1] }}
      aria-label="Song archive"
      role="dialog"
      aria-modal="true"
    >
      {/* Header */}
      <div className="library-header">
        <div>
          <p className="library-eyebrow">THE ARCHIVE</p>
          <h2 className="library-title">All Songs</h2>
        </div>
        <button
          className="ctrl-btn ctrl-sm"
          onClick={onClose}
          aria-label="Close archive"
        >
          <X size={18} />
        </button>
      </div>

      {/* Search */}
      <SearchBox value={query} onChange={setQuery} />

      {/* Song list */}
      <div className="library-list" role="listbox" aria-label="Songs">
        {filtered.length === 0 ? (
          <p className="library-empty">No songs match &ldquo;{query}&rdquo;</p>
        ) : (
          filtered.map((song) => {
            const realIndex = songs.findIndex((s) => s.id === song.id);
            const isActive = realIndex === currentIndex;
            return (
              <button
                key={song.id}
                role="option"
                aria-selected={isActive}
                className={`library-row ${isActive ? "library-row-active" : ""}`}
                onClick={() => {
                  onSelect(realIndex);
                  onClose();
                }}
              >
                {/* Artwork thumbnail */}
                {song.artwork?.cover && (
                  <div className="library-row-art">
                    <Image
                      src={song.artwork.cover}
                      alt=""
                      fill
                      sizes="40px"
                      style={{ objectFit: "cover" }}
                    />
                  </div>
                )}

                <span className="library-row-num">
                  {String(realIndex + 1).padStart(2, "0")}
                </span>

                <span className="library-row-body">
                  <span className="library-row-title">{song.title}</span>
                  <span className="library-row-sub">
                    {song.artist}
                    {(song.movie ?? song.album) && (
                      <> · {song.movie ?? song.album}</>
                    )}
                    {song.year && <> · {song.year}</>}
                  </span>
                </span>

                {isActive && (
                  <span className="library-row-indicator" aria-label={isPlaying ? "Playing" : "Paused"}>
                    {isPlaying ? "●" : "Ⅱ"}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </motion.aside>
  );
}
