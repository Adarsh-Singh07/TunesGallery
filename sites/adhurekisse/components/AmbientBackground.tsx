"use client";

import { motion, AnimatePresence } from "framer-motion";

interface Props {
  accent: string;
}

export default function AmbientBackground({ accent }: Props) {
  return (
    <>
      {/* Film-grain overlay */}
      <div
        aria-hidden="true"
        className="grain"
      />

      {/* Ambient accent orb — reacts to song accent color */}
      <AnimatePresence mode="wait">
        <motion.div
          key={accent}
          aria-hidden="true"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 2.4, ease: "easeInOut" }}
          style={{
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            zIndex: 0,
          }}
        >
          {/* Primary warm orb */}
          <div
            style={{
              position: "absolute",
              width: "55vw",
              height: "55vw",
              borderRadius: "50%",
              background: accent,
              filter: "blur(120px)",
              opacity: 0.07,
              top: "10%",
              left: "30%",
              transform: "translate(-50%, -50%)",
            }}
          />
          {/* Secondary cool orb */}
          <div
            style={{
              position: "absolute",
              width: "38vw",
              height: "38vw",
              borderRadius: "50%",
              background: "#4a3b68",
              filter: "blur(100px)",
              opacity: 0.06,
              bottom: "0%",
              right: "0%",
            }}
          />
          {/* Warm bottom-left accent */}
          <div
            style={{
              position: "absolute",
              width: "30vw",
              height: "30vw",
              borderRadius: "50%",
              background: "#8b4513",
              filter: "blur(90px)",
              opacity: 0.05,
              bottom: "10%",
              left: "5%",
            }}
          />
        </motion.div>
      </AnimatePresence>
    </>
  );
}
