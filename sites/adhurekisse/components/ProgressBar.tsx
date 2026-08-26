"use client";

import { useEffect, useState } from "react";
import { formatTime, clamp } from "../lib/utils";
import type { PlaybackManager } from "../lib/playback/PlaybackManager";

interface Props {
  manager: PlaybackManager | null;
  hasPlaybackRef: boolean;
}

export default function ProgressBar({ manager, hasPlaybackRef }: Props) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!manager) return;
    // Initial state
    const state = manager.getState();
    setCurrentTime(state.currentTime);
    setDuration(state.duration);
    
    // Subscribe to time updates
    const unsub = manager.subscribeTime((time, dur) => {
      setCurrentTime(time);
      setDuration(dur);
    });
    return unsub;
  }, [manager]);

  if (!hasPlaybackRef) return null;

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  function handleProgressClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!manager) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    manager.seek(ratio * duration);
  }

  return (
    <div className="progress-area">
      <span className="progress-time">{formatTime(currentTime)}</span>
      <div
        className="progress-track"
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progressPercent)}
        tabIndex={0}
        onClick={handleProgressClick}
        onKeyDown={(e) => {
          if (!manager) return;
          if (e.key === "ArrowRight") manager.seek(currentTime + 5);
          if (e.key === "ArrowLeft") manager.seek(currentTime - 5);
        }}
      >
        <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
        <div className="progress-thumb" style={{ left: `${progressPercent}%` }} />
      </div>
      <span className="progress-time">{formatTime(duration)}</span>
    </div>
  );
}
