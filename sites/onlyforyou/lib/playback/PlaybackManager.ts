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
    this.providers.set("youtube", new YouTubeProvider());
  }

  get currentSong(): Song | null {
    return this.songs[this.currentIndex] ?? null;
  }

  async selectSong(index: number, autoPlay = true): Promise<void> {
    if (index < 0 || index >= this.songs.length) return;
    this.currentIndex = index;
    this.notify();
    if (autoPlay) await this.loadCurrentSong(true);
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

    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: song.artist,
        album: song.album,
        artwork: [
          {
            src: song.artwork?.cover ?? "/favicon.ico",
            sizes: "512x512",
            type: "image/jpeg",
          },
        ],
      });

      navigator.mediaSession.setActionHandler("play", () => this.play());
      navigator.mediaSession.setActionHandler("pause", () => this.pause());
      navigator.mediaSession.setActionHandler("previoustrack", () => this.previous());
      navigator.mediaSession.setActionHandler("nexttrack", () => this.next());
    }

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

    const trackRef = song.playback?.youtubeId ?? null;
    if (!trackRef) {
      this._providerState = {
        ...this._providerState,
        hasError: true,
        errorMessage: "This track has no YouTube ID yet.",
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
