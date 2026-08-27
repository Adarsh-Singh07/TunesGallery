"use client";

import { YT_CONTAINER_ID } from "../lib/playback/YouTubeProvider";

/**
 * Mounts the div that the YouTube IFrame API attaches to.
 * Positioned off-screen — YouTube ToS requires the player to exist in DOM.
 */
export default function YouTubeWidget() {
  return (
    <div
      style={{
        position: "absolute",
        width: "1px",
        height: "1px",
        top: "-9999px",
        left: "-9999px",
        opacity: 0,
        pointerEvents: "none",
        zIndex: -1,
      }}
      aria-hidden="true"
    >
      <div id={YT_CONTAINER_ID} />
    </div>
  );
}
