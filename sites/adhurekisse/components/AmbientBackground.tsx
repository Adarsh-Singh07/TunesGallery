"use client";

import { memo } from "react";

const AmbientBackground = memo(function AmbientBackground() {
  return (
    <>
      <div className="ambient-background" aria-hidden="true">
        <div
          className="ambient-image-layer fixed-bg"
          style={{ backgroundImage: `url('/background.png')`, opacity: 0.8 }}
        />
        <div className="ambient-overlay" />
      </div>

      <div aria-hidden="true" className="grain" />
    </>
  );
});

export default AmbientBackground;