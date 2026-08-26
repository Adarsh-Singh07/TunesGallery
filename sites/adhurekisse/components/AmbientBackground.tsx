"use client";

import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  accent: string;
  coverSrc?: string;
}

const AmbientBackground = memo(function AmbientBackground({ accent, coverSrc }: Props) {
  return (
    <>
      <div className="ambient-background" aria-hidden="true">
        <AnimatePresence mode="wait">
          {coverSrc && (
            <motion.div
              key={coverSrc}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5, ease: "easeInOut" }}
              className="ambient-image-layer"
              style={{ backgroundImage: `url(${coverSrc})` }}
            />
          )}
        </AnimatePresence>
        <div className="ambient-overlay" />
      </div>

      <div aria-hidden="true" className="grain" />
    </>
  );
});

export default AmbientBackground;