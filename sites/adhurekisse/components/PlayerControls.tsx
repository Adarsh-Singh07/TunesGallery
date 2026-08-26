"use client";

import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { RepeatMode } from "../lib/playback/types";
import type { PlaybackControls } from "../lib/playback/usePlayback";
import { clamp, formatTime } from "../lib/utils";

interface Props {
  // State
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isLoading: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  hasSong: boolean;
  hasPlaybackRef: boolean; // true if active provider has an ID for this track
  errorMessage: string;
  // Controls
  controls: PlaybackControls;
}

function RepeatIcon({ mode }: { mode: RepeatMode }) {
  if (mode === "one") return <Repeat1 size={17} />;
  return <Repeat size={17} />;
}

function VolumeIcon({ muted, volume }: { muted: boolean; volume: number }) {
  if (muted || volume === 0) return <VolumeX size={17} />;
  if (volume < 0.5) return <Volume1 size={17} />;
  return <Volume2 size={17} />;
}

export default function PlayerControls({
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  isLoading,
  shuffle,
  repeat,
  hasSong,
  hasPlaybackRef,
  errorMessage,
  controls,
}: Props) {
  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  function handleProgressClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    controls.seek(ratio * duration);
  }

  return (
    <div className="player-controls">
      {/* Progress bar — only shown when a playback reference is available */}
      {hasPlaybackRef && (
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
              if (e.key === "ArrowRight") controls.seek(currentTime + 5);
              if (e.key === "ArrowLeft") controls.seek(currentTime - 5);
            }}
          >
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            <div className="progress-thumb" style={{ left: `${progressPercent}%` }} />
          </div>
          <span className="progress-time">{formatTime(duration)}</span>
        </div>
      )}

      {/* Main controls row */}
      <div className="controls-row">
        <button
          className={`ctrl-btn ctrl-sm ${shuffle ? "ctrl-active" : ""}`}
          onClick={controls.toggleShuffle}
          aria-label="Shuffle"
          aria-pressed={shuffle}
        >
          <Shuffle size={17} />
        </button>

        <button
          className="ctrl-btn ctrl-sm"
          onClick={controls.previous}
          aria-label="Previous track"
          disabled={!hasSong}
        >
          <ChevronLeft size={22} />
        </button>

        <button
          className="ctrl-btn ctrl-play"
          onClick={controls.togglePlay}
          aria-label={isPlaying ? "Pause" : "Play"}
          disabled={!hasSong || (!hasPlaybackRef && !isPlaying)}
        >
          {isLoading ? (
            <Loader2 size={20} className="spin-icon" />
          ) : isPlaying ? (
            <Pause fill="currentColor" size={22} />
          ) : (
            <Play fill="currentColor" size={22} />
          )}
        </button>

        <button
          className="ctrl-btn ctrl-sm"
          onClick={controls.next}
          aria-label="Next track"
          disabled={!hasSong}
        >
          <ChevronRight size={22} />
        </button>

        <button
          className={`ctrl-btn ctrl-sm ${repeat !== "none" ? "ctrl-active" : ""}`}
          onClick={controls.cycleRepeat}
          aria-label={`Repeat: ${repeat}`}
        >
          <RepeatIcon mode={repeat} />
        </button>
      </div>

      {/* Volume row */}
      <div className="volume-row">
        <button
          className="ctrl-btn ctrl-xs"
          onClick={controls.toggleMute}
          aria-label={isMuted ? "Unmute" : "Mute"}
        >
          <VolumeIcon muted={isMuted} volume={volume} />
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={isMuted ? 0 : volume}
          onChange={(e) => controls.setVolume(Number(e.target.value))}
          className="volume-slider"
          aria-label="Volume"
        />
      </div>

      {/* Status messages */}
      {!hasPlaybackRef && hasSong && !errorMessage && (
        <p className="no-audio-hint">Playback IDs not yet assigned — coming soon</p>
      )}
      {errorMessage && (
        <p className="playback-error" role="alert">{errorMessage}</p>
      )}
    </div>
  );
}
