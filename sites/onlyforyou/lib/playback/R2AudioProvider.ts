// ─────────────────────────────────────────────────────────────────────────────
// R2AudioProvider — plays privately-hosted audio from Cloudflare R2.
//
// One persistent HTMLAudioElement for the provider's whole lifetime (it is
// never recreated on navigation; MusicRoom mounts once per session). Stream
// URLs are short-lived presigned URLs fetched from /api/tracks/[id]/stream;
// this provider transparently refreshes them on expiry, stall, or media
// error and resumes from the last position — the listener never notices.
//
// HTTP Range requests (seeking) are handled by the browser natively.
// ─────────────────────────────────────────────────────────────────────────────

import type { PlaybackProvider, ProviderState, StateListener } from "./types";
import { DEFAULT_PROVIDER_STATE } from "./types";

const REFRESH_COOLDOWN_MS = 3000;

interface StreamResponse {
  url: string;
  expiresAt: number;
  mimeType?: string;
}

export class R2AudioProvider implements PlaybackProvider {
  readonly id = "r2" as const;

  private audio: HTMLAudioElement | null = null;
  private _isReady = false;
  private _state: ProviderState = { ...DEFAULT_PROVIDER_STATE };
  private listeners = new Set<StateListener>();
  private endedCallbacks = new Set<() => void>();

  private trackId: string | null = null;
  private streamUrl: string | null = null;
  private streamExpiresAt = 0;
  private lastRefreshAt = 0;
  private recovering = false;
  private destroyed = false;

  get isReady() {
    return this._isReady;
  }

  async initialize(): Promise<void> {
    if (typeof window === "undefined" || this.audio) return;

    this.audio = new Audio();
    this.audio.preload = "metadata";
    this.audio.crossOrigin = "anonymous";

    this.audio.addEventListener("timeupdate", () => {
      this.patch({ currentTime: this.audio!.currentTime });
    });
    this.audio.addEventListener("durationchange", () => {
      const d = this.audio!.duration;
      if (Number.isFinite(d)) this.patch({ duration: d });
    });
    this.audio.addEventListener("loadedmetadata", () => {
      const d = this.audio!.duration;
      this.patch({ duration: Number.isFinite(d) ? d : 0, isLoading: false });
    });
    this.audio.addEventListener("play", () => {
      this.patch({ isPlaying: true, isLoading: false });
    });
    this.audio.addEventListener("playing", () => {
      this.patch({ isPlaying: true, isLoading: false, hasError: false });
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
    this.audio.addEventListener("ended", () => {
      this.patch({ isPlaying: false });
      this.endedCallbacks.forEach((cb) => cb());
    });
    this.audio.addEventListener("error", () => {
      void this.handleMediaError();
    });
    this.audio.addEventListener("stalled", () => {
      // Network hiccup mid-stream — proactively refresh if the URL is old
      void this.maybeRefreshStream(false);
    });

    this._isReady = true;
  }

  /** Load a track by its UUID (the PlaybackManager passes song.r2TrackId). */
  async loadAndPlay(trackRef: string): Promise<void> {
    if (!this.audio) throw new Error("R2AudioProvider not initialized.");
    this.destroyed = false;
    this.patch({
      isLoading: true,
      hasError: false,
      errorMessage: "",
      currentTime: 0,
      duration: 0,
      isPlaying: false,
    });

    const previousTrack = this.trackId;
    this.trackId = trackRef;

    const stream = await this.fetchStreamUrl(trackRef);
    this.streamUrl = stream.url;
    this.streamExpiresAt = stream.expiresAt;
    this.lastRefreshAt = Date.now();

    // Swap src without reloading the element when only refreshing the URL
    this.audio.src = stream.url;
    this.audio.load();
    await this.audio.play().catch((err: unknown) => {
      if (previousTrack === trackRef && this.audio && this.audio.currentTime > 0) return;
      this.patch({
        hasError: true,
        isLoading: false,
        isPlaying: false,
        errorMessage:
          err instanceof Error && err.name === "NotAllowedError"
            ? "Tap play to start audio (browser blocked autoplay)."
            : "Could not start streaming.",
      });
    });
  }

  async play(): Promise<void> {
    if (!this.audio) return;
    if (this.needsRefresh()) {
      const ok = await this.maybeRefreshStream(true);
      if (!ok) return;
    }
    await this.audio.play().catch(() => {});
  }

  async pause(): Promise<void> {
    this.audio?.pause();
  }

  async seek(seconds: number): Promise<void> {
    if (!this.audio) return;
    if (this.needsRefresh()) await this.maybeRefreshStream(true);
    try {
      this.audio.currentTime = seconds;
      this.patch({ currentTime: seconds });
    } catch {
      // Seek before metadata loaded — retry after it loads
      const target = seconds;
      const onMeta = () => {
        this.audio!.currentTime = target;
        this.audio!.removeEventListener("loadedmetadata", onMeta);
      };
      this.audio.addEventListener("loadedmetadata", onMeta);
    }
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

  async setRate(rate: number): Promise<void> {
    if (this.audio) {
      // clamp to ±3% territory used by drift correction
      this.audio.playbackRate = Math.min(1.05, Math.max(0.95, rate));
    }
  }

  /** Preload the stream (fetch URL + buffer) without audible playback. */
  async cue(trackRef: string): Promise<void> {
    if (!this.audio) return;
    try {
      const stream = await this.fetchStreamUrl(trackRef);
      this.streamUrl = stream.url;
      this.streamExpiresAt = stream.expiresAt;
      this.lastRefreshAt = Date.now();
      this.trackId = trackRef;
      this.audio.src = stream.url;
      this.audio.load();
      this.patch({ isLoading: false, hasError: false, errorMessage: "", currentTime: 0 });
    } catch (err) {
      this.patch({
        hasError: true,
        errorMessage: err instanceof Error ? err.message : "Preload failed.",
      });
    }
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

  destroy(): void {
    this.destroyed = true;
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
    }
    this.audio = null;
    this._isReady = false;
    this.trackId = null;
    this.streamUrl = null;
    this.listeners.clear();
    this.endedCallbacks.clear();
  }

  // ── Stream URL lifecycle ──────────────────────────────────────────────────

  private needsRefresh(): boolean {
    // Refresh 2 minutes before expiry to survive long buffered stretches
    return !this.streamUrl || Date.now() > this.streamExpiresAt - 2 * 60 * 1000;
  }

  private async fetchStreamUrl(trackId: string): Promise<StreamResponse> {
    const session = await import("../auth").then((m) => m.getSession());
    const headers: Record<string, string> = {};
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

    const res = await fetch(`/api/tracks/${trackId}/stream`, { headers, cache: "no-store" });
    if (!res.ok) {
      let message = "Streaming authorization failed.";
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) message = body.error;
      } catch {
        /* keep default */
      }
      throw new Error(message);
    }
    return (await res.json()) as StreamResponse;
  }

  private async maybeRefreshStream(resume: boolean): Promise<boolean> {
    if (!this.trackId || this.recovering || this.destroyed) return false;
    const now = Date.now();
    if (now - this.lastRefreshAt < REFRESH_COOLDOWN_MS) return false;
    this.recovering = true;

    const wasPlaying = this._state.isPlaying;
    const position = this.audio?.currentTime ?? 0;

    try {
      const stream = await this.fetchStreamUrl(this.trackId);
      this.streamUrl = stream.url;
      this.streamExpiresAt = stream.expiresAt;
      this.lastRefreshAt = Date.now();

      if (this.audio) {
        this.audio.src = stream.url;
        this.audio.load();
        if (resume && (wasPlaying || position > 0)) {
          this.audio.currentTime = position;
          await this.audio.play().catch(() => {});
        }
      }
      this.patch({ isLoading: false, hasError: false, errorMessage: "" });
      return true;
    } catch (err) {
      this.patch({
        hasError: true,
        isLoading: false,
        isPlaying: false,
        errorMessage: err instanceof Error ? err.message : "Stream refresh failed.",
      });
      return false;
    } finally {
      this.recovering = false;
    }
  }

  private async handleMediaError(): Promise<void> {
    if (!this.audio || this.destroyed) return;
    const err = this.audio.error;
    const code = err?.code;
    // 1 = aborted (expected when we swap src ourselves), 2 = network, 4 = decode
    if (code === 1) {
      this.patch({ isLoading: false });
      return;
    }
    const position = this.audio.currentTime;
    const wasPlaying = this._state.isPlaying;

    const refreshed = await this.maybeRefreshStream(true);
    if (refreshed) return;

    this.patch({
      hasError: true,
      isLoading: false,
      isPlaying: false,
      currentTime: position,
      errorMessage: wasPlaying
        ? "Playback was interrupted and could not recover. Check your connection."
        : "This audio file could not be loaded.",
    });
  }

  private patch(partial: Partial<ProviderState>): void {
    this._state = { ...this._state, ...partial };
    this.listeners.forEach((l) => l({ ...this._state }));
  }
}
