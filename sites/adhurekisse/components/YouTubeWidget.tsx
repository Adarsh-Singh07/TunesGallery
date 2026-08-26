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
      className={`yt-widget ${visible ? "yt-widget-visible" : "yt-widget-hidden"}`}
      aria-label="YouTube player"
      aria-hidden={!visible}
    >
      <div className="yt-widget-label">
        <span className="yt-widget-dot" aria-hidden="true" />
        <span>YouTube</span>
        {isPlaying && visible && <span className="yt-widget-playing">● PLAYING</span>}
      </div>
      {/* The IFrame API replaces this div with an <iframe> on initialization */}
      <div id={YT_CONTAINER_ID} className="yt-player-frame" />
    </div>
  );
}
