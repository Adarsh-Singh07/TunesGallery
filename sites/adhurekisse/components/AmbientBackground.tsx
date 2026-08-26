"use client";

import { memo, useEffect, useRef } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import type { CinematicTheme } from "../data/themes";

interface Props {
  theme: CinematicTheme;
}

const AmbientBackground = memo(function AmbientBackground({ theme }: Props) {
  return (
    <>
      <div className="ambient-background" aria-hidden="true">
        <AnimatePresence>
          <motion.div
            key={theme.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: "easeInOut" }}
            className="ambient-image-container"
          >
            <Image
              src={theme.bgUrl}
              alt="Atmospheric Background"
              fill
              priority
              style={{ objectFit: "cover", objectPosition: "center" }}
              quality={90}
            />
          </motion.div>
        </AnimatePresence>
        <div className="ambient-overlay" />
      </div>

      {/* Vignette is separate so it doesn't animate with the image */}
      <div className="ambient-vignette" aria-hidden="true" />

      <div aria-hidden="true" className="grain" />
    </>
  );
});

export default AmbientBackground;