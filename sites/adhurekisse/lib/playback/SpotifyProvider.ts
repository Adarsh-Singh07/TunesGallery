// ─────────────────────────────────────────────────────────────────────────────
// Spotify Web Playback SDK provider
//
// Uses the official Spotify Web Playback SDK. Spotify delivers all audio.
// Requires a Spotify Premium account. No audio is downloaded or stored.
// ─────────────────────────────────────────────────────────────────────────────

import type { PlaybackProvider, ProviderState, StateListener } from "./types";
import { DEFAULT_PROVIDER_STATE } from "./types";
import { getValidAccessToken } from "../spotify/pkce";

// ── Minimal Spotify SDK type declarations ─────────────────────────────────────
declare global {
  interface Window {
    Spotify: {
      Player: new (config: SpotifyPlayerConfig) => SpotifyPlayer;
    };
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}

interface SpotifyPlayerConfig {
  name: string;
  getOAuthToken: (cb: (token: string) => void) => void;
  volume?: number;
}

interface SpotifyPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  addListener(event: string, cb: (data: unknown) => void): void;
  removeListener(event: string, cb?: (data: unknown) => void): void;
  getCurrentState(): Promise<SpotifyPlayerState | null>;
  setVolume(volume: number): Promise<void>; // 0–1
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  previousTrack(): Promise<void>;
  nextTrack(): Promise<void>;
}

interface SpotifyPlayerState {
  paused: boolean;
  position: number;      // ms
  duration: number;      // ms
  track_window: {
    current_track: { id: string; name: string };
  };
}

interface SpotifyErrorEvent {
  message: string;
  type?: string;
}

interface SpotifyReadyEvent {
  device_id: string;
}

// ─────────────────────────────────────────────────────────────────────────────

let sdkScriptLoaded = false;

function loadSpotifySDK(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return;
    if (sdkScriptLoaded && window.Spotify) { resolve(); return; }

    const prev = window.onSpotifyWebPlaybackSDKReady;
    window.onSpotifyWebPlaybackSDKReady = () => {
      if (prev) prev();
      resolve();
    };

    if (!sdkScriptLoaded) {
      sdkScriptLoaded = true;
      const script = document.createElement("script");
      script.src = "https://sdk.scdn.co/spotify-player.js";
      document.head.appendChild(script);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────

export class SpotifyProvider implements PlaybackProvider {
  readonly id = "spotify" as const;

  private player: SpotifyPlayer | null = null;
  private deviceId: string | null = null;
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

    const token = await getValidAccessToken();
    if (!token) throw new Error("Not authenticated with Spotify.");

    await loadSpotifySDK();

    return new Promise((resolve, reject) => {
      this.player = new window.Spotify.Player({
        name: "adhurekisse",
        getOAuthToken: async (cb) => {
          const t = await getValidAccessToken();
          if (t) cb(t);
        },
        volume: this._state.volume,
      });

      this.player.addListener("ready", (data) => {
        const { device_id } = data as SpotifyReadyEvent;
        this.deviceId = device_id;
        this._isReady = true;
        this.startPolling();
        resolve();
      });

      this.player.addListener("not_ready", () => {
        this._isReady = false;
        this.patch({ hasError: true, errorMessage: "Spotify device disconnected." });
      });

      this.player.addListener("player_state_changed", (data) => {
        if (!data) return;
        const s = data as SpotifyPlayerState;
        this.patch({
          isPlaying: !s.paused,
          currentTime: s.position / 1000,
          duration: s.duration / 1000,
          isLoading: false,
        });
        // Detect natural track end: position reset to 0 while paused
        if (s.paused && s.position === 0) {
          this.endedCallbacks.forEach((cb) => cb());
        }
      });

      this.player.addListener("initialization_error", (e) => {
        const err = e as SpotifyErrorEvent;
        reject(new Error(`Spotify init failed: ${err.message}`));
      });

      this.player.addListener("authentication_error", (e) => {
        const err = e as SpotifyErrorEvent;
        this.patch({ hasError: true, errorMessage: `Spotify auth error: ${err.message}` });
      });

      this.player.addListener("account_error", (e) => {
        const err = e as SpotifyErrorEvent;
        this.patch({
          hasError: true,
          errorMessage: "Spotify Premium is required for playback.",
        });
        reject(new Error(`Account error: ${err.message}`));
      });

      this.player.addListener("playback_error", (e) => {
        const err = e as SpotifyErrorEvent;
        this.patch({ hasError: true, errorMessage: `Playback error: ${err.message}` });
      });

      this.player.connect().then((success) => {
        if (!success) reject(new Error("Failed to connect Spotify player."));
      });
    });
  }

  // ── Track loading via Spotify Web API ────────────────────────────────────────

  async loadAndPlay(spotifyTrackId: string): Promise<void> {
    if (!this.deviceId) throw new Error("Spotify device not registered.");
    const token = await getValidAccessToken();
    if (!token) throw new Error("Spotify token expired.");

    this.patch({ isLoading: true, hasError: false, errorMessage: "", currentTime: 0 });

    const response = await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${this.deviceId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uris: [`spotify:track:${spotifyTrackId}`],
        }),
      },
    );

    if (!response.ok && response.status !== 204) {
      const err = await response.text();
      this.patch({ hasError: true, errorMessage: `Spotify API error: ${err}`, isLoading: false });
      throw new Error(err);
    }
  }

  async play(): Promise<void> {
    await this.player?.resume();
  }

  async pause(): Promise<void> {
    await this.player?.pause();
  }

  async seek(seconds: number): Promise<void> {
    await this.player?.seek(Math.round(seconds * 1000));
    this.patch({ currentTime: seconds });
  }

  async setVolume(volume: number): Promise<void> {
    const clamped = Math.max(0, Math.min(1, volume));
    await this.player?.setVolume(clamped);
    const wasMuted = this._state.isMuted;
    this.patch({ volume: clamped, isMuted: wasMuted && clamped === 0 });
  }

  async setMuted(muted: boolean): Promise<void> {
    if (muted) {
      await this.player?.setVolume(0);
    } else {
      await this.player?.setVolume(this._state.volume);
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

  /** Supplement player_state_changed with a poll for currentTime smoothness */
  private startPolling(): void {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(async () => {
      if (!this.player || !this._state.isPlaying) return;
      try {
        const s = await this.player.getCurrentState();
        if (!s) return;
        this.patch({
          currentTime: s.position / 1000,
          duration: s.duration / 1000,
        });
      } catch {
        // ignore transient errors
      }
    }, 1000);
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
    this.player?.disconnect();
    this.player = null;
    this._isReady = false;
    this.deviceId = null;
    this.listeners.clear();
    this.endedCallbacks.clear();
  }
}
