"use client";

import { memo } from "react";
import { motion } from "framer-motion";
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
            ? { duration: 8, ease: "linear", repeat: Infinity, repeatType: "loop" }
            : { duration: 0.6, ease: "easeOut" }
        }
      >
        {/* Grooves — rendered via CSS, multiple rings */}
        <div className="record-grooves" aria-hidden="true" />

        {/* Sheen / specular reflection */}
        <div className="record-sheen" aria-hidden="true" />

        {/* Center label */}
        <div className="record-label">
          {coverSrc ? (
            <Image
              src={coverSrc}
              alt=""
              fill
              sizes="31vw"
              className="record-label-image"
              priority
            />
          ) : (
            <div className="record-label-fallback">
              <span className="record-label-artist">{artistLabel}</span>
              <span className="record-label-track">{trackNumber}</span>
            </div>
          )}
          {/* Center spindle hole */}
          <div className="record-spindle" aria-hidden="true" />
        </div>
      </motion.div>

      {/* Tonearm needle */}
      <motion.div
        className="record-needle"
        aria-hidden="true"
        animate={{ rotate: isPlaying ? 28 : 18 }}
        transition={{ duration: 0.8, ease: "easeInOut" }}
      />
    </div>
  );
});

export default Record;