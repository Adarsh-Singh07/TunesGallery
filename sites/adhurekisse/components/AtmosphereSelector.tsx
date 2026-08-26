"use client";

import { useState, useRef, useEffect } from "react";
import { THEMES, THEME_ORDER, type ThemeId } from "./ThemeContext";
import { Layers, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  currentMode: ThemeId | null;
  onSelect: (mode: ThemeId | null) => void;
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

  const activeLabel = currentMode ? THEMES[currentMode]?.label : null;

  return (
    <div className="atmosphere-selector" ref={containerRef}>
      <button
        className="archive-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Change atmosphere"
        aria-expanded={isOpen}
      >
        <Layers size={16} strokeWidth={1.5} />
        <span className="topbar-archive-label">
          {activeLabel ?? "SCENE"}
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="atmosphere-dropdown"
          >
            <div className="atmosphere-header">ATMOSPHERE</div>

            <button
              className={`atmosphere-option ${currentMode === null ? "active" : ""}`}
              onClick={() => { onSelect(null); setIsOpen(false); }}
            >
              <span>Auto (Follows Song)</span>
              {currentMode === null && <Check size={13} />}
            </button>

            <div className="atmosphere-divider" />

            {THEME_ORDER.map((id) => (
              <button
                key={id}
                className={`atmosphere-option ${currentMode === id ? "active" : ""}`}
                onClick={() => { onSelect(id); setIsOpen(false); }}
              >
                <span>{THEMES[id].label}</span>
                {currentMode === id && <Check size={13} />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
