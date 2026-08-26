"use client";

import { YT_CONTAINER_ID } from "../lib/playback/YouTubeProvider";
import type { ProviderId } from "../lib/playback/types";

interface Props {
  activeProvider: ProviderId;
  isPlaying: boolean;
}

/**
 * Mounts the div that the YouTube IFrame API attaches to.
 *
 * ToS compliance: YouTube requires the player to be visible.
 * This widget is always rendered when YouTube is the active provider —
 * it appears as a small, clearly-labelled panel in the UI.
 * The ADHUREKISSE custom controls sit alongside it as the primary experience.
 */
export default function YouTubeWidget({ activeProvider, isPlaying }: Props) {
  const visible = activeProvider === "youtube";

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
        zIndex: -1
      }}
      aria-hidden="true"
    >
      {/* 
        IMPORTANT: The YouTube IFrame API *replaces* the target div with an iframe. 
        It must be wrapped in a parent div so React doesn't lose the root DOM node 
        of this component, which causes "NotFoundError: Failed to execute 'insertBefore'" 
      */}
      <div id={YT_CONTAINER_ID} />
    </div>
  );
}
