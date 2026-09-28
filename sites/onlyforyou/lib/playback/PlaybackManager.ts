// ─────────────────────────────────────────────────────────────────────────────
// PlaybackManager — single source of truth for all playback state.
// Simplified version for OnlyForYou (YouTube-only, no Spotify/chat).
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ManagerListener,
  ManagerState,
  PlaybackProvider,
  ProviderId,
  RepeatMode,
  ProviderState,
} from "./types";
import { DEFAULT_PROVIDER_STATE } from "./types";
import type { Song } from "../../data/songs";
import { R2AudioProvider } from "./R2AudioProvider";
import { YouTubeProvider } from "./YouTubeProvider";

export class PlaybackManager {
  private songs: Song[];
  private currentIndex = 0;
  private shuffleOrder: number[] = [];

  private _shuffle = false;
  private _repeat: RepeatMode = "none";

  private providers: Map<ProviderId, PlaybackProvider> = new Map();
  private _activeProviderId: ProviderId = "youtube";
  private providerUnsub: (() => void) | null = null;
  private providerEndedUnsub: (() => void) | null = null;

  private _providerState: ProviderState = { ...DEFAULT_PROVIDER_STATE };

  private listeners = new Set<ManagerListener>();
  private timeListeners = new Set<(time: number, duration: number) => void>();

  constructor(songs: Song[]) {
    this.songs = songs;
    this.buildShuffleOrder();
    // R2 private audio — preferred whenever a track has an authorized file
    this.providers.set("r2", new R2AudioProvider());
    this.providers.set("youtube", new YouTubeProvider());
  }

  /** Replace the playlist (e.g. after fetching the private R2 library). */
  setSongs(songs: Song[]): void {
    const previousId = this.currentSong?.id;
    this.songs = songs;
    this.buildShuffleOrder();
    if (previousId) {
      const idx = songs.findIndex((s) => s.id === previousId);
      this.currentIndex = idx !== -1 ? idx : 0;
    } else {
      this.currentIndex = 0;
    }
    this.notify();
  }

  get currentSong(): Song | null {
    return this.songs[this.currentIndex] ?? null;
  }

  async selectSong(index: number, autoPlay = true): Promise<void> {
    if (index < 0 || index >= this.songs.length) return;
    this.currentIndex = index;
    this.notify();
    if (autoPlay) await this.loadCurrentSong(true);
    else await this.cueCurrentSong();
  }

  /**
   * Preload a song without audible playback — used by the jam readiness
   * handshake so both devices buffer before the host starts the clock.
   */
  private async cueCurrentSong(): Promise<void> {
    const song = this.currentSong;
    if (!song) return;

    if (song.playback?.r2TrackId && this._activeProviderId !== "r2") {
      await this.switchProvider("r2");
    }

    try {
      await this.ensureProviderReady();
      await this.subscribeToProvider();
    } catch {
      return;
    }

    const provider = this.activeProvider;
    const trackRef = this.getTrackRef(song);
    if (provider && trackRef && typeof provider.cue === "function") {
      await provider.cue(trackRef).catch(() => {});
    }
  }

  async next(): Promise<void> {
    if (!this.songs.length) return;

    if (this._repeat === "one") {
      await this.loadCurrentSong(true);
      return;
    }

    if (this._shuffle) {
      const pos = this.shuffleOrder.indexOf(this.currentIndex);
      const nextPos = (pos + 1) % this.shuffleOrder.length;
      this.currentIndex = this.shuffleOrder[nextPos];
    } else {
      this.currentIndex = (this.currentIndex + 1) % this.songs.length;
      if (this.currentIndex === 0 && this._repeat === "none") {
        await this.pause();
        this.notify();
        return;
      }
    }

    this.notify();
    await this.loadCurrentSong(true);
  }

  async previous(): Promise<void> {
    if (!this.songs.length) return;
    if (this._providerState.currentTime > 3) {
      await this.seek(0);
      return;
    }

    if (this._shuffle) {
      const pos = this.shuffleOrder.indexOf(this.currentIndex);
      const prevPos = (pos - 1 + this.shuffleOrder.length) % this.shuffleOrder.length;
      this.currentIndex = this.shuffleOrder[prevPos];
    } else {
      this.currentIndex =
        (this.currentIndex - 1 + this.songs.length) % this.songs.length;
    }

    this.notify();
    await this.loadCurrentSong(true);
  }

  async togglePlay(): Promise<void> {
    const provider = this.activeProvider;
    if (!provider) return;
    if (this._providerState.isPlaying) {
      await provider.pause();
    } else {
      if (this._providerState.currentTime > 0) {
        await provider.play();
      } else {
        await this.loadCurrentSong(true);
      }
    }
  }

  async play(): Promise<void> {
    await this.activeProvider?.play();
  }

  async pause(): Promise<void> {
    await this.activeProvider?.pause();
  }

  async seek(seconds: number): Promise<void> {
    await this.activeProvider?.seek(seconds);
    this.notifyTime();
  }

  async setVolume(volume: number): Promise<void> {
    await this.activeProvider?.setVolume(volume);
  }

  async setMuted(muted: boolean): Promise<void> {
    await this.activeProvider?.setMuted(muted);
  }

  /** Switch to a different playback provider. Pauses current playback first. */
  async switchProvider(id: ProviderId): Promise<void> {
    if (id === this._activeProviderId) return;

    const wasPlaying = this._providerState.isPlaying;
    const currentTime = this._providerState.currentTime;
    await this.activeProvider?.pause();

    this.providerUnsub?.();
    this.providerEndedUnsub?.();
    this.providerUnsub = null;
    this.providerEndedUnsub = null;

    this._activeProviderId = id;
    this._providerState = { ...DEFAULT_PROVIDER_STATE, volume: this._providerState.volume };
    this.notify();

    if (wasPlaying) {
      try {
        await this.ensureProviderReady();
        await this.subscribeToProvider();
        await this.loadCurrentSong(true, currentTime);
      } catch (err) {
        this._providerState = {
          ...this._providerState,
          hasError: true,
          errorMessage: err instanceof Error ? err.message : "Provider switch failed.",
        };
        this.notify();
      }
    } else {
      await this.ensureProviderReady().catch(() => {});
      await this.subscribeToProvider();
    }
  }

  async setRate(rate: number): Promise<void> {
    await this.activeProvider?.setRate?.(rate);
  }

  toggleShuffle(): void {
    this._shuffle = !this._shuffle;
    this.buildShuffleOrder();
    this.notify();
  }

  cycleRepeat(): void {
    const modes: RepeatMode[] = ["none", "all", "one"];
    const idx = modes.indexOf(this._repeat);
    this._repeat = modes[(idx + 1) % modes.length];
    this.notify();
  }

  async initializeDefaultProvider(): Promise<void> {
    await this.ensureProviderReady();
    await this.subscribeToProvider();

    const song = this.currentSong;
    const provider = this.activeProvider;
    const providerWithCue = provider as unknown as { cue?: (id: string) => Promise<void> };
    if (song && provider && typeof providerWithCue.cue === "function" && song.playback?.youtubeId) {
      await providerWithCue.cue(song.playback.youtubeId);
    }
  }

  subscribe(listener: ManagerListener): () => void {
    this.listeners.add(listener);
    listener(this.buildState());
    return () => this.listeners.delete(listener);
  }

  subscribeTime(listener: (time: number, duration: number) => void): () => void {
    this.timeListeners.add(listener);
    listener(this._providerState.currentTime, this._providerState.duration);
    return () => this.timeListeners.delete(listener);
  }

  getState(): ManagerState {
    return this.buildState();
  }

  destroy(): void {
    if (this.mediaSessionPositionTimer) {
      clearInterval(this.mediaSessionPositionTimer);
      this.mediaSessionPositionTimer = null;
    }
    this.providerUnsub?.();
    this.providerEndedUnsub?.();
    this.providers.forEach((p) => p.destroy());
    this.providers.clear();
    this.listeners.clear();
  }

  private get activeProvider(): PlaybackProvider | undefined {
    return this.providers.get(this._activeProviderId);
  }

  private async ensureProviderReady(): Promise<void> {
    const provider = this.activeProvider;
    if (!provider) return;
    if (!provider.isReady) {
      await provider.initialize();
    }
  }

  private async subscribeToProvider(): Promise<void> {
    const provider = this.activeProvider;
    if (!provider) return;

    this.providerUnsub?.();
    this.providerEndedUnsub?.();

    let lastTime = this._providerState.currentTime;

    this.providerUnsub = provider.subscribe((state) => {
      const isOnlyTimeUpdate =
        this._providerState.isPlaying === state.isPlaying &&
        this._providerState.isLoading === state.isLoading &&
        this._providerState.hasError === state.hasError &&
        this._providerState.volume === state.volume &&
        this._providerState.isMuted === state.isMuted &&
        this._providerState.duration === state.duration;

      this._providerState = state;

      if (isOnlyTimeUpdate && Math.abs(state.currentTime - lastTime) > 0.1) {
        lastTime = state.currentTime;
        this.notifyTime();
      } else if (!isOnlyTimeUpdate) {
        this.notify();
      }
    });

    this.providerEndedUnsub = provider.onEnded(() => {
      void this.next();
    });
  }

  private async loadCurrentSong(play: boolean, startTime = 0): Promise<void> {
    const song = this.currentSong;
    if (!song) return;

    // Prefer the private R2 file when one exists and is authorized
    if (song.playback?.r2TrackId && this._activeProviderId !== "r2") {
      await this.switchProvider("r2");
    }

    this.updateMediaSession(song);

    try {
      await this.ensureProviderReady();
      await this.subscribeToProvider();
    } catch (err) {
      this._providerState = {
        ...this._providerState,
        hasError: true,
        errorMessage: err instanceof Error ? err.message : "Provider initialization failed.",
        isLoading: false,
      };
      this.notify();
      return;
    }

    const provider = this.activeProvider;
    if (!provider) return;

    const trackRef = this.getTrackRef(song);
    if (!trackRef) {
      this._providerState = {
        ...this._providerState,
        hasError: true,
        errorMessage: this.getMissingRefMessage(),
        isLoading: false,
      };
      this.notify();
      return;
    }

    this._providerState = { ...this._providerState, hasError: false, errorMessage: "" };
    this.notify();

    if (play) {
      await provider.loadAndPlay(trackRef).catch((err: unknown) => {
        this._providerState = {
          ...this._providerState,
          hasError: true,
          errorMessage: err instanceof Error ? err.message : "Playback failed.",
          isLoading: false,
        };
        this.notify();
      });
      if (startTime > 0) {
        await provider.seek(startTime).catch(() => {});
      }
    }
  }

  private getTrackRef(song: Song): string | null {
    switch (this._activeProviderId) {
      case "r2":
        return song.playback?.r2TrackId ?? null;
      case "youtube":
        return song.playback?.youtubeId ?? null;
      case "local":
        return song.playback?.localPath ?? null;
      default:
        return null;
    }
  }

  private getMissingRefMessage(): string {
    const song = this.currentSong;
    switch (this._activeProviderId) {
      case "r2":
        return song?.playback?.youtubeId
          ? "No private audio for this track yet. Try YouTube."
          : "No audio file uploaded for this track yet.";
      case "youtube":
        return "This track has no YouTube ID yet.";
      case "local":
        return "No local audio file for this track.";
      default:
        return "No playback reference available.";
    }
  }

  /**
   * Full Media Session integration for Android: metadata, transport controls,
   * seek handlers and continuous position-state updates.
   */
  private mediaSessionPositionTimer: ReturnType<typeof setInterval> | null = null;

  private updateMediaSession(song: Song): void {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    const artworkSrc = song.artwork?.cover
      ? song.artwork.cover.startsWith("http")
        ? song.artwork.cover
        : `${window.location.origin}${song.artwork.cover}`
      : `${window.location.origin}/favicon.svg`;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artist,
      album: song.album ?? "OnlyForYou",
      artwork: [{ src: artworkSrc, sizes: "512x512", type: "image/jpeg" }],
    });

    navigator.mediaSession.setActionHandler("play", () => void this.play());
    navigator.mediaSession.setActionHandler("pause", () => void this.pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => void this.previous());
    navigator.mediaSession.setActionHandler("nexttrack", () => void this.next());
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime != null) void this.seek(details.seekTime);
    });
    navigator.mediaSession.setActionHandler("seekbackward", (details) => {
      void this.seek(Math.max(0, this._providerState.currentTime - (details.seekOffset ?? 10)));
    });
    navigator.mediaSession.setActionHandler("seekforward", (details) => {
      void this.seek(
        Math.min(this._providerState.duration, this._providerState.currentTime + (details.seekOffset ?? 10)),
      );
    });
    navigator.mediaSession.setActionHandler("stop", () => void this.pause());

    if (this.mediaSessionPositionTimer) clearInterval(this.mediaSessionPositionTimer);
    this.mediaSessionPositionTimer = setInterval(() => {
      if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
      const { isPlaying, currentTime, duration } = this._providerState;
      if (!duration || !Number.isFinite(duration) || currentTime > duration) return;
      try {
        navigator.mediaSession.setPositionState({
          duration,
          position: Math.min(currentTime, duration),
          playbackRate: 1.0,
        });
      } catch {
        /* position state is best-effort */
      }
    }, 1000);
  }

  private buildShuffleOrder(): void {
    this.shuffleOrder = this.songs
      .map((_, i) => i)
      .sort(() => Math.random() - 0.5);
  }

  private buildState(): ManagerState {
    const song = this.currentSong;
    return {
      currentIndex: this.currentIndex,
      shuffle: this._shuffle,
      repeat: this._repeat,
      activeProvider: this._activeProviderId,
      isPlaying: this._providerState.isPlaying,
      currentTime: this._providerState.currentTime,
      duration: this._providerState.duration,
      volume: this._providerState.volume,
      isMuted: this._providerState.isMuted,
      isLoading: this._providerState.isLoading,
      hasError: this._providerState.hasError,
      errorMessage: this._providerState.errorMessage,
      hasYouTubeId: !!song?.playback?.youtubeId,
      hasR2Track: !!song?.playback?.r2TrackId,
    };
  }

  private notify(): void {
    const state = this.buildState();
    this.listeners.forEach((l) => l(state));
  }

  private notifyTime(): void {
    this.timeListeners.forEach((l) =>
      l(this._providerState.currentTime, this._providerState.duration)
    );
  }
}
