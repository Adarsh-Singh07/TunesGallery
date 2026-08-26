// ─────────────────────────────────────────────────────────────────────────────
// Local audio fallback provider (development / testing only)
//
// Uses HTMLAudioElement to play files from public/audio/.
// NOT intended for production. The site works without any local audio files.
// ─────────────────────────────────────────────────────────────────────────────

import type { PlaybackProvider, ProviderState, StateListener } from "./types";
import { DEFAULT_PROVIDER_STATE } from "./types";

export class LocalAudioProvider implements PlaybackProvider {
  readonly id = "local" as const;

  private audio: HTMLAudioElement | null = null;
  private _isReady = false;
  private _state: ProviderState = { ...DEFAULT_PROVIDER_STATE };
  private listeners = new Set<StateListener>();
  private endedCallbacks = new Set<() => void>();

  get isReady() {
    return this._isReady;
  }

  async initialize(): Promise<void> {
    if (typeof window === "undefined") return;
    if (this.audio) return;

    this.audio = new Audio();
    this.audio.volume = this._state.volume;
    this.audio.preload = "metadata";

    this.audio.addEventListener("timeupdate", () => {
      this.patch({ currentTime: this.audio!.currentTime });
    });
    this.audio.addEventListener("loadedmetadata", () => {
      this.patch({ duration: this.audio!.duration, isLoading: false });
    });
    this.audio.addEventListener("play", () => {
      this.patch({ isPlaying: true, isLoading: false });
    });
    this.audio.addEventListener("pause", () => {
      this.patch({ isPlaying: false });
    });
    this.audio.addEventListener("waiting", () => {
      this.patch({ isLoading: true });
    });
    this.audio.addEventListener("canplay", () => {
      this.patch({ isLoading: false });
    });
    this.audio.addEventListener("error", () => {
      this.patch({
        hasError: true,
        errorMessage: "Local audio file could not be loaded.",
        isLoading: false,
        isPlaying: false,
      });
    });
    this.audio.addEventListener("ended", () => {
      this.patch({ isPlaying: false });
      this.endedCallbacks.forEach((cb) => cb());
    });

    this._isReady = true;
  }

  async loadAndPlay(localPath: string): Promise<void> {
    if (!this.audio) throw new Error("LocalAudioProvider not initialized.");
    this.patch({ isLoading: true, hasError: false, errorMessage: "", currentTime: 0, duration: 0 });
    this.audio.src = localPath;
    this.audio.load();
    await this.audio.play().catch(() => {
      this.patch({ hasError: true, isLoading: false, errorMessage: "Playback blocked by browser." });
    });
  }

  async play(): Promise<void> {
    await this.audio?.play().catch(() => {});
  }

  async pause(): Promise<void> {
    this.audio?.pause();
  }

  async seek(seconds: number): Promise<void> {
    if (!this.audio) return;
    this.audio.currentTime = seconds;
  }

  async setVolume(volume: number): Promise<void> {
    const v = Math.max(0, Math.min(1, volume));
    if (this.audio) {
      this.audio.volume = v;
      this.audio.muted = false;
    }
    this.patch({ volume: v, isMuted: false });
  }

  async setMuted(muted: boolean): Promise<void> {
    if (this.audio) this.audio.muted = muted;
    this.patch({ isMuted: muted });
  }

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

  private patch(partial: Partial<ProviderState>): void {
    this._state = { ...this._state, ...partial };
    this.listeners.forEach((l) => l({ ...this._state }));
  }

  destroy(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
    }
    this.audio = null;
    this._isReady = false;
    this.listeners.clear();
    this.endedCallbacks.clear();
  }
}
