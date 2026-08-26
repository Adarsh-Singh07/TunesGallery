"use client";

import { memo } from "react";

import Image from "next/image";

const AmbientBackground = memo(function AmbientBackground() {
  return (
    <>
      <div className="ambient-background" aria-hidden="true">
        <Image
          src="/background.png"
          alt="Atmospheric Background"
          fill
          priority
          style={{ objectFit: "cover", objectPosition: "center" }}
          quality={100}
        />
        <div className="ambient-overlay" />
      </div>

      <div aria-hidden="true" className="grain" />
    </>
  );
});

export default AmbientBackground;