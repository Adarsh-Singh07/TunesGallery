"use client";

import { memo, useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";

export const BACKGROUNDS = [
  { id: "moonlit_city", url: "/backgrounds/bg_moonlit_city.jpg", label: "Moon City" },
  { id: "twilight_city", url: "/backgrounds/bg_twilight_city.jpg", label: "Twilight" },
  { id: "rainy_window", url: "/backgrounds/bg_rainy_window.jpg", label: "Rainy Night" },
  { id: "coastal_road", url: "/backgrounds/bg_coastal_road.jpg", label: "Coastal Road" },
  { id: "golden_sunset", url: "/backgrounds/bg_golden_sunset.jpg", label: "Golden Sunset" },
  { id: "starry_mountain", url: "/backgrounds/bg_starry_mountain.jpg", label: "Starry Mountain" },
];

export function getAutoBackground(songId: string) {
  let hash = 0;
  for (let i = 0; i < songId.length; i++) {
    hash = songId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % BACKGROUNDS.length;
  return BACKGROUNDS[index];
}

interface Props {
  currentSongId?: string;
  manualBgId?: string | null;
}

const AmbientBackground = memo(function AmbientBackground({ currentSongId, manualBgId }: Props) {
  const [activeBg, setActiveBg] = useState(BACKGROUNDS[0]);
  const [nextBgToPreload, setNextBgToPreload] = useState<string | null>(null);

  useEffect(() => {
    let nextBg;
    if (manualBgId) {
      nextBg = BACKGROUNDS.find(b => b.id === manualBgId) || BACKGROUNDS[0];
    } else if (currentSongId) {
      nextBg = getAutoBackground(currentSongId);
    } else {
      nextBg = BACKGROUNDS[0];
    }
    
    if (nextBg.id !== activeBg.id) {
      setActiveBg(nextBg);
    }
  }, [currentSongId, manualBgId, activeBg.id]);

  // Preload logic (could preload the next sequential song's BG if we wanted, 
  // but next/image priority handles immediate loading. 
  // We'll let Framer Motion handle the crossfade.)
  
  return (
    <>
      <div className="ambient-background" aria-hidden="true">
        <AnimatePresence>
          <motion.div
            key={activeBg.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: "easeInOut" }}
            className="ambient-image-container"
          >
            <Image
              src={activeBg.url}
              alt="Atmospheric Background"
              fill
              priority
              style={{ objectFit: "cover", objectPosition: "center" }}
              quality={100}
            />
          </motion.div>
        </AnimatePresence>
        <div className="ambient-overlay" />
      </div>

      <div aria-hidden="true" className="grain" />
    </>
  );
});

export default AmbientBackground;