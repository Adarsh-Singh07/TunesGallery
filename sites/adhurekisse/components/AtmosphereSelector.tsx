"use client";

import { useState, useRef, useEffect } from "react";
import { BACKGROUNDS } from "./AmbientBackground";
import { Image as ImageIcon, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  currentMode: string | null;
  onSelect: (mode: string | null) => void;
}

export default function AtmosphereSelector({ currentMode, onSelect }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="atmosphere-selector" ref={containerRef} style={{ position: "relative" }}>
      <button 
        className="archive-btn" 
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Change Atmosphere"
        aria-expanded={isOpen}
      >
        <ImageIcon size={19} strokeWidth={1.5} />
        <span className="topbar-archive-label">SCENE</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="atmosphere-dropdown"
          >
            <div className="atmosphere-header">ATMOSPHERE</div>
            
            <button 
              className={`atmosphere-option ${currentMode === null ? "active" : ""}`}
              onClick={() => { onSelect(null); setIsOpen(false); }}
            >
              <div className="atmosphere-option-info">
                <span>Auto (Follows Song)</span>
              </div>
              {currentMode === null && <Check size={14} />}
            </button>

            <div className="atmosphere-divider" />

            {BACKGROUNDS.map((bg) => (
              <button 
                key={bg.id}
                className={`atmosphere-option ${currentMode === bg.id ? "active" : ""}`}
                onClick={() => { onSelect(bg.id); setIsOpen(false); }}
              >
                <div className="atmosphere-option-info">
                  <span>{bg.label}</span>
                </div>
                {currentMode === bg.id && <Check size={14} />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
