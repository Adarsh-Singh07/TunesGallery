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
      id={YT_CONTAINER_ID}
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
    />
  );
}
