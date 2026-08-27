"use client";

import { motion } from "framer-motion";
import { Heart } from "lucide-react";

interface Props {
  onEnter: () => void;
}

/**
 * Entry gate for OnlyForYou — intimate, warm, personal.
 * Unlocks browser autoplay and initializes the YouTube player.
 */
export default function EntryGate({ onEnter }: Props) {
  return (
    <motion.div
      className="entry-gate"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.7 }}
      role="dialog"
      aria-label="Enter your private music room"
      aria-modal="true"
    >
      <div className="entry-gate-bg" aria-hidden="true" />

      <motion.div
        className="entry-gate-content"
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
      >
        {/* Heart icon */}
        <motion.div
          className="entry-heart"
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          aria-hidden="true"
        >
          <Heart size={32} strokeWidth={1.5} fill="rgba(196,115,106,0.4)" stroke="rgba(196,115,106,0.85)" />
        </motion.div>

        <p className="entry-eyebrow">A PRIVATE MUSIC ROOM · MADE WITH LOVE</p>

        <h1 className="entry-title">
          <span className="entry-title-only">Only</span>
          <span className="entry-title-for">For</span>
          <span className="entry-title-you">You</span>
        </h1>

        <p className="entry-tagline">Every song here was chosen for you.</p>

        <motion.button
          className="entry-btn"
          onClick={onEnter}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          aria-label="Enter your private music room"
        >
          <span className="entry-btn-dot" aria-hidden="true" />
          ENTER
        </motion.button>

        <p className="entry-hint">plays on YouTube · no account required</p>
      </motion.div>
    </motion.div>
  );
}
