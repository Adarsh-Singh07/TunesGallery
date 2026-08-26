"use client";

import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";

interface Props {
  coverSrc: string | undefined;
  songId: string;
  artistLabel: string;
  trackNumber: string;
  isPlaying: boolean;
}

const Record = memo(function Record({
  coverSrc,
  songId,
  artistLabel,
  trackNumber,
  isPlaying,
}: Props) {
  return (
    <div className="record-scene" aria-label="Vinyl record">
      {/* Drop shadow */}
      <div className="record-shadow" />

      {/* The vinyl disc */}
      <motion.div
        className="record-disc"
        animate={{ rotate: isPlaying ? 360 : 0 }}
        transition={
          isPlaying
            ? { duration: 20, ease: "linear", repeat: Infinity, repeatType: "loop" }
            : { duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94] }
        }
      >
        {/* Grooves */}
        <div className="record-grooves" aria-hidden="true" />

        {/* Sheen / specular reflection */}
        <div className="record-sheen" aria-hidden="true" />

        {/* Center label */}
        <div className="record-label">
          <AnimatePresence mode="wait">
            <motion.div
              key={songId}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
              style={{ position: "absolute", inset: 0, borderRadius: "50%" }}
            >
              {coverSrc ? (
                <Image
                  src={coverSrc}
                  alt=""
                  fill
                  sizes="20vw"
                  className="record-label-image"
                  priority
                />
              ) : (
                <div className="record-label-fallback">
                  <span className="record-label-artist">{artistLabel}</span>
                  <span className="record-label-track">{trackNumber}</span>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
          {/* Center spindle hole */}
          <div className="record-spindle" aria-hidden="true" />
        </div>
      </motion.div>

      {/* Tonearm needle */}
      <motion.div
        className="record-needle"
        aria-hidden="true"
        animate={{ rotate: isPlaying ? 26 : 16 }}
        transition={{ duration: 1.0, ease: [0.25, 0.46, 0.45, 0.94] }}
      />
    </div>
  );
});

export default Record;