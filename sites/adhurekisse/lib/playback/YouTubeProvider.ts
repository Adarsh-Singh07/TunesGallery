// ─────────────────────────────────────────────────────────────────────────────
// YouTube IFrame Player API provider
//
// Uses the official YouTube IFrame Player API. No audio is downloaded.
// YouTube delivers all audio/video through their own infrastructure.
//
// ToS compliance: The YouTube player is embedded visibly in the DOM.
// We render a small but real YouTube player widget — ADHUREKISSE's custom UI
// sits alongside it as the primary experience.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  PlaybackProvider,
  ProviderState,
  StateListener,
} from "./types";
import { DEFAULT_PROVIDER_STATE } from "./types";

// ── Minimal YouTube IFrame API type declarations ──────────────────────────────
declare global {
  interface Window {
    YT: {
      Player: new (elementId: string | HTMLElement, config: YTConfig) => YTPlayer;
      PlayerState: {
        UNSTARTED: -1;
        ENDED: 0;
        PLAYING: 1;
        PAUSED: 2;
        BUFFERING: 3;
        CUED: 5;
      };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YTPlayer {
  loadVideoById(videoId: string | { videoId: string, startSeconds?: number, suggestedQuality?: string }, startSeconds?: number): void;
  cueVideoById(videoId: string): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void; // 0–100
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  getVolume(): number;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
}

interface YTConfig {
  height: number;
  width: number;
  videoId?: string;
  playerVars?: Record<string, string | number | boolean>;
  events?: {
    onReady?: () => void;
    onStateChange?: (e: { data: number }) => void;
    onError?: (e: { data: number }) => void;
  };
}

/** ID of the DOM element the IFrame API attaches to */
const CONTAINER_ID = "yt-player-mount";

/** Ensure the YT IFrame API script is loaded exactly once */
let ytScriptLoaded = false;

function loadYTScript(): Promise<void> {
  return new Promise((resolve) => {
    if (ytScriptLoaded) {
      if (typeof window !== "undefined" && window.YT?.Player) resolve();
      else window.onYouTubeIframeAPIReady = resolve;
      return;
    }
    ytScriptLoaded = true;
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prev) prev();
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
}

// ─────────────────────────────────────────────────────────────────────────────

export class YouTubeProvider implements PlaybackProvider {
  readonly id = "youtube" as const;

  private player: YTPlayer | null = null;
  private _isReady = false;
  private _state: ProviderState = { ...DEFAULT_PROVIDER_STATE };
  private listeners = new Set<StateListener>();
  private endedCallbacks = new Set<() => void>();
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  get isReady() {
    return this._isReady;
  }

  // ── Initialization ──────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this._isReady) return;
    if (typeof window === "undefined") return;

    await loadYTScript();

    return new Promise((resolve, reject) => {
      const container = document.getElementById(CONTAINER_ID);
      if (!container) {
        reject(new Error(`YouTube player mount #${CONTAINER_ID} not found in DOM`));
        return;
      }

      this.player = new window.YT.Player(container, {
        height: 180,
        width: 320,
        playerVars: {
          autoplay: 0,
          controls: 1,       // show YouTube controls for ToS compliance
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            this._isReady = true;
            this.player!.setVolume(Math.round(this._state.volume * 100));
            this.startPolling();
            resolve();
          },
          onStateChange: (e) => {
            this.handleStateChange(e.data);
          },
          onError: () => {
            this.patch({
              hasError: true,
              errorMessage: "YouTube playback error.",
              isLoading: false,
              isPlaying: false,
            });
          },
        },
      });
    });
  }

  // ── Track loading ───────────────────────────────────────────────────────────

  async cue(youtubeId: string): Promise<void> {
    if (!this.player) return;
    if (typeof this.player.cueVideoById === "function") {
      this.player.cueVideoById({
        videoId: youtubeId,
        suggestedQuality: "small"
      });
    }
  }

  async loadAndPlay(youtubeId: string): Promise<void> {
    if (!this.player) throw new Error("YouTube player not initialized");
    this.patch({ isLoading: true, hasError: false, errorMessage: "", currentTime: 0, duration: 0 });
    if (typeof this.player.loadVideoById === "function") {
      this.player.loadVideoById({
        videoId: youtubeId,
        suggestedQuality: "small" // Request lowest video quality since we only need audio (faster buffering)
      });
    }
  }

  async play(): Promise<void> {
    if (this.player && typeof this.player.playVideo === "function") {
      this.player.playVideo();
    }
  }

  async pause(): Promise<void> {
    if (this.player && typeof this.player.pauseVideo === "function") {
      this.player.pauseVideo();
    }
  }

  async seek(seconds: number): Promise<void> {
    if (this.player && typeof this.player.seekTo === "function") {
      this.player.seekTo(seconds, true);
    }
    this.patch({ currentTime: seconds });
  }

  async setVolume(volume: number): Promise<void> {
    const clamped = Math.max(0, Math.min(1, volume));
    if (this.player && typeof this.player.setVolume === "function") {
      this.player.setVolume(Math.round(clamped * 100));
    }
    const wasMuted = this._state.isMuted;
    if (wasMuted && clamped > 0 && this.player && typeof this.player.unMute === "function") {
      this.player.unMute();
    }
    this.patch({ volume: clamped, isMuted: clamped === 0 });
  }

  async setMuted(muted: boolean): Promise<void> {
    if (this.player) {
      if (muted && typeof this.player.mute === "function") {
        this.player.mute();
      } else if (!muted && typeof this.player.unMute === "function") {
        this.player.unMute();
      }
    }
    this.patch({ isMuted: muted });
  }

  // ── State ───────────────────────────────────────────────────────────────────

  getState(): ProviderState {
    return { ...this._state };
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onEnded(callback: () => void): () => void {
    this.endedCallbacks.add(callback);
    return () => this.endedCallbacks.delete(callback);
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private handleStateChange(ytState: number): void {
    const YTState = window.YT?.PlayerState;
    if (!YTState) return;

    switch (ytState) {
      case YTState.PLAYING:
        this.patch({ isPlaying: true, isLoading: false, hasError: false });
        break;
      case YTState.PAUSED:
        this.patch({ isPlaying: false, isLoading: false });
        break;
      case YTState.BUFFERING:
        this.patch({ isLoading: true });
        break;
      case YTState.ENDED:
        this.patch({ isPlaying: false, isLoading: false });
        this.endedCallbacks.forEach((cb) => cb());
        break;
      case YTState.CUED:
        this.patch({ isLoading: false });
        break;
    }
  }

  /** Poll the player for currentTime and duration (YT has no timeupdate event) */
  private startPolling(): void {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(() => {
      if (!this.player || !this._isReady) return;
      try {
        const currentTime = this.player.getCurrentTime() ?? 0;
        const duration = this.player.getDuration() ?? 0;
        if (
          Math.abs(currentTime - this._state.currentTime) > 0.2 ||
          Math.abs(duration - this._state.duration) > 0.2
        ) {
          this.patch({ currentTime, duration });
        }
      } catch {
        // player may not be ready yet — ignore
      }
    }, 250);
  }

  private patch(partial: Partial<ProviderState>): void {
    this._state = { ...this._state, ...partial };
    this.listeners.forEach((l) => l({ ...this._state }));
  }

  destroy(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.player?.destroy();
    this.player = null;
    this._isReady = false;
    this.listeners.clear();
    this.endedCallbacks.clear();
  }
}

export { CONTAINER_ID as YT_CONTAINER_ID };
