"use client";

import { motion } from "framer-motion";
import { ListeningState } from "../lib/persistence";
import { songs } from "../data/songs";
import { formatTime } from "../lib/utils";

interface Props {
  resumeState: ListeningState;
  onDecide: (resume: boolean) => void;
}

export default function ResumePrompt({ resumeState, onDecide }: Props) {
  const song = songs.find((s) => s.id === resumeState.songId);
  if (!song) return null;

  return (
    <motion.div
      className="resume-prompt-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      aria-live="polite"
    >
      <motion.div 
        className="resume-prompt-box"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
      >
        <p className="resume-eyebrow">CONTINUE LISTENING</p>
        <h2 className="resume-title">{song.title}</h2>
        <p className="resume-subtitle">{song.artist} &middot; {formatTime(resumeState.position)}</p>

        <div className="resume-actions">
          <button className="resume-btn resume-btn-primary" onClick={() => onDecide(true)}>
            Continue
          </button>
          <button className="resume-btn resume-btn-secondary" onClick={() => onDecide(false)}>
            Start Fresh
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
