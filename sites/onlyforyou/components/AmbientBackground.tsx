"use client";

import { memo, useState, useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { getThemeForSong } from "../data/themes";

interface Props {
  /** Current song's accent color, e.g. "#c4736a" */
  accent: string;
  /** Song artwork cover URL for ambient blur effect */
  coverUrl?: string;
  songId?: string;
}

/**
 * Ambient background for OnlyForYou.
 * Uses the song's accent color as a warm, blurred radial glow.
 * No external image dependencies — purely CSS-driven.
 */
const AmbientBackground = memo(function AmbientBackground({ accent, coverUrl, songId = "01" }: Props) {
  const [mounted, setMounted] = useState(false);
  const theme = getThemeForSong(songId);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mql = window.matchMedia("(max-width: 640px)");
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const currentBg = isMobile && theme.bgUrlMobile ? theme.bgUrlMobile : theme.bgUrl;

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      <AnimatePresence>
        {mounted && (
          <motion.div
            key={`ambient-${songId}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5, ease: "easeInOut" }}
            className="absolute inset-0 transition-opacity duration-1000"
          >
            {/* The actual background image */}
            <Image
              src={currentBg}
              alt="Atmospheric Background"
              fill
              priority
              style={{ objectFit: "cover", objectPosition: "center" }}
              quality={90}
            />

            {/* The darkening overlay from the theme */}
            <div 
              className="absolute inset-0"
              style={{
                background: `linear-gradient(${theme.gradientAngle}, ${theme.overlayTop}, ${theme.overlayBottom})`,
                boxShadow: `inset 0 0 100px ${theme.vignetteColor}`,
              }}
            />

            {/* The song-specific accent glow */}
            <div 
              className="absolute inset-0 opacity-40 blur-[100px] mix-blend-screen transition-all duration-[2s]"
              style={{
                background: `radial-gradient(circle at 50% 30%, ${accent}40 0%, transparent 60%)`
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Film grain texture */}
      <div aria-hidden="true" className="grain" />
    </div>
  );
});

export default AmbientBackground;
