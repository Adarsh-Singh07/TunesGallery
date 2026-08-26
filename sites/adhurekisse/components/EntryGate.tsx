"use client";

import { motion } from "framer-motion";

interface Props {
  siteName: string;
  tagline: string;
  onEnter: () => void;
}

/**
 * Full-screen gate that:
 * 1. Creates the user gesture required to unlock browser autoplay
 * 2. Initializes the YouTube player after the click
 * 3. Provides a cinematic entry into the music room
 */
export default function EntryGate({ siteName, tagline, onEnter }: Props) {
  return (
    <motion.div
      className="entry-gate"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      role="dialog"
      aria-label="Enter the music room"
      aria-modal="true"
    >
      {/* Ambient gradient */}
      <div className="entry-gate-bg" aria-hidden="true" />

      <motion.div
        className="entry-gate-content"
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
      >
        <p className="entry-eyebrow">TUNES GALLERY · A PRIVATE MUSIC ROOM</p>

        <h1 className="entry-title" lang="hi">
          {siteName}
        </h1>

        <p className="entry-tagline">{tagline}</p>

        <motion.button
          className="entry-btn"
          onClick={onEnter}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          aria-label="Enter the music room"
        >
          <span className="entry-btn-dot" aria-hidden="true" />
          ENTER
        </motion.button>

        <p className="entry-hint">YouTube · no account required</p>
      </motion.div>
    </motion.div>
  );
}
