// ─────────────────────────────────────────────────────────────────────────────
// PlaybackManager — the single source of truth for all playback state.
//
// Owns:
//   • The curated song playlist + ordering (shuffle / repeat)
//   • Which provider is active (YouTube / Spotify / Local)
//   • Provider lifecycle (initialize on first use, swap on switch)
//   • Forwarding UI commands → active provider
//   • Forwarding provider events → React subscribers
//
// MusicRoom uses this class via the `usePlayback` React hook.
// No component ever imports a concrete provider directly.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ManagerListener,
  ManagerState,
  PlaybackProvider,
  ProviderId,
  ProviderState,
  RepeatMode,
} from "./types";
import { DEFAULT_PROVIDER_STATE } from "./types";
import type { Song } from "../../data/songs";
import { YouTubeProvider } from "./YouTubeProvider";
import { SpotifyProvider } from "./SpotifyProvider";
import { LocalAudioProvider } from "./LocalAudioProvider";
import {
  isSpotifyConnected,
  buildSpotifyAuthUrl,
  clearTokens,
} from "../spotify/pkce";

// ─────────────────────────────────────────────────────────────────────────────

export class PlaybackManager {
  // ── Playlist ──────────────────────────────────────────────────────────────
  private songs: Song[];
  private currentIndex = 0;
  private shuffleOrder: number[] = [];

  // ── Playback modes ────────────────────────────────────────────────────────
  private _shuffle = false;
  private _repeat: RepeatMode = "none";

  // ── Providers ─────────────────────────────────────────────────────────────
  private providers: Map<ProviderId, PlaybackProvider> = new Map();
  private _activeProviderId: ProviderId = "youtube";
  private providerUnsub: (() => void) | null = null;
  private providerEndedUnsub: (() => void) | null = null;

  // ── Spotify auth state ────────────────────────────────────────────────────
  private _spotifyConnected = false;
  private _spotifyConnecting = false;

  // ── Provider audio state (forwarded from active provider) ─────────────────
  private _providerState: ProviderState = { ...DEFAULT_PROVIDER_STATE };

  // ── Subscribers ───────────────────────────────────────────────────────────
  private listeners = new Set<ManagerListener>();
  private timeListeners = new Set<(time: number, duration: number) => void>();

  // ─────────────────────────────────────────────────────────────────────────

  constructor(songs: Song[]) {
    this.songs = songs;
    this._spotifyConnected = isSpotifyConnected();
    this.buildShuffleOrder();

    // Register providers
    this.providers.set("youtube", new YouTubeProvider());
    this.providers.set("spotify", new SpotifyProvider());
    this.providers.set("local", new LocalAudioProvider());
  }

  // ── Public: playlist ──────────────────────────────────────────────────────

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
        // Reached end of list — stop
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
    // Restart track if more than 3 s in
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

  // ── Public: playback controls ─────────────────────────────────────────────

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

  // ── Public: provider switching ────────────────────────────────────────────

  /** Switch to a different playback provider. Pauses current playback first. */
  async switchProvider(id: ProviderId): Promise<void> {
    if (id === this._activeProviderId) return;

    // Pause current provider
    const wasPlaying = this._providerState.isPlaying;
    const currentTime = this._providerState.currentTime;
    await this.activeProvider?.pause();

    // Unsubscribe from old provider
    this.providerUnsub?.();
    this.providerEndedUnsub?.();
    this.providerUnsub = null;
    this.providerEndedUnsub = null;

    this._activeProviderId = id;
    this._providerState = { ...DEFAULT_PROVIDER_STATE, volume: this._providerState.volume };
    this.notify();

    // Initialize new provider if needed and resume
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

  // ── Public: Spotify auth ──────────────────────────────────────────────────

  async connectSpotify(): Promise<void> {
    if (this._spotifyConnecting) return;
    this._spotifyConnecting = true;
    this.notify();
    try {
      const url = await buildSpotifyAuthUrl();
      window.location.href = url;
    } catch (err) {
      this._spotifyConnecting = false;
      this._providerState = {
        ...this._providerState,
        hasError: true,
        errorMessage: err instanceof Error ? err.message : "Spotify not configured.",
      };
      this.notify();
    }
  }

  markSpotifyConnected(connected: boolean): void {
    this._spotifyConnected = connected;
    this.notify();
  }

  disconnectSpotify(): void {
    clearTokens();
    this._spotifyConnected = false;
    if (this._activeProviderId === "spotify") {
      void this.switchProvider("youtube");
    }
    this.notify();
  }

  // ── Public: initialization (call after React has mounted the player div) ──

  async initializeDefaultProvider(): Promise<void> {
    await this.ensureProviderReady();
    await this.subscribeToProvider();
  }

  // ── Public: subscribe ─────────────────────────────────────────────────────
  
  subscribe(listener: ManagerListener): () => void {
    this.listeners.add(listener);
    listener(this.buildState()); // immediate snapshot
    return () => this.listeners.delete(listener);
  }

  subscribeTime(listener: (time: number, duration: number) => void): () => void {
    this.timeListeners.add(listener);
    listener(this._providerState.currentTime, this._providerState.duration);
    return () => this.timeListeners.delete(listener);
  }

  // ── Public: getState ──────────────────────────────────────────────────────

  getState(): ManagerState {
    return this.buildState();
  }

  // ── Public: teardown ──────────────────────────────────────────────────────

  destroy(): void {
    this.providerUnsub?.();
    this.providerEndedUnsub?.();
    this.providers.forEach((p) => p.destroy());
    this.providers.clear();
    this.listeners.clear();
  }

  // ── Private ───────────────────────────────────────────────────────────────

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

    this._providerState = {
      ...this._providerState,
      hasError: false,
      errorMessage: "",
    };
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
      case "youtube":
        return song.playback?.youtubeId ?? null;
      case "spotify":
        return song.playback?.spotifyTrackId ?? null;
      case "local":
        return song.playback?.localPath ?? null;
      default:
        return null;
    }
  }

  private getMissingRefMessage(): string {
    const song = this.currentSong;
    switch (this._activeProviderId) {
      case "youtube":
        return song?.playback?.spotifyTrackId
          ? "YouTube ID missing for this track. Try Spotify."
          : "This track has no playback reference yet.";
      case "spotify":
        return song?.playback?.youtubeId
          ? "Spotify ID missing for this track. Play on YouTube instead."
          : "This track has no playback reference yet.";
      case "local":
        return "No local audio file for this track.";
      default:
        return "No playback reference available.";
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
      spotifyConnected: this._spotifyConnected,
      spotifyConnecting: this._spotifyConnecting,
      isPlaying: this._providerState.isPlaying,
      currentTime: this._providerState.currentTime,
      duration: this._providerState.duration,
      volume: this._providerState.volume,
      isMuted: this._providerState.isMuted,
      isLoading: this._providerState.isLoading,
      hasError: this._providerState.hasError,
      errorMessage: this._providerState.errorMessage,
      hasYouTubeId: !!song?.playback?.youtubeId,
      hasSpotifyId: !!song?.playback?.spotifyTrackId,
    };
  }

  private notify(): void {
    const state = this.buildState();
    this.listeners.forEach((l) => l(state));
  }

  private notifyTime(): void {
    this.timeListeners.forEach((l) => l(this._providerState.currentTime, this._providerState.duration));
  }
}
