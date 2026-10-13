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
import { R2AudioProvider } from "./R2AudioProvider";
import { YouTubeProvider } from "./YouTubeProvider";
import { SpotifyProvider } from "./SpotifyProvider";
import { LocalAudioProvider } from "./LocalAudioProvider";
import type { JamTransportHandlers } from "../jam/transport";
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
  private transportHandlers: JamTransportHandlers | null = null;

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

    // Register providers — R2 private audio is registered first; selection
    // still only prefers it when the selected song actually has an R2 file.
    this.providers.set("r2", new R2AudioProvider());
    this.providers.set("youtube", new YouTubeProvider());
    this.providers.set("spotify", new SpotifyProvider());
    this.providers.set("local", new LocalAudioProvider());
  }

  // ── Public: dynamic library (R2 tracks arrive after login) ────────────────

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

  // ── Public: playlist ──────────────────────────────────────────────────────

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

    const desiredProvider = this.providerForSong(song);
    if (desiredProvider !== this._activeProviderId) {
      await this.switchProvider(desiredProvider, false);
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

  // ── Public: provider switching ────────────────────────────────────────────

  /**
   * Switch to a different playback provider. The optional resume flag is used
   * internally while cueing a Jam track: changing providers for a preload must
   * never unexpectedly restart the previous song.
   */
  async switchProvider(id: ProviderId, resume = true): Promise<void> {
    if (id === this._activeProviderId) return;

    // Pause current provider
    const wasPlaying = resume && this._providerState.isPlaying;
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

  /**
   * Install a room-owned transport adapter. Media keys and natural track-end
   * events are routed through this adapter while a Jam is active; direct
   * provider operations remain available to JamSession for applying the
   * authoritative timeline. A scoped disposer prevents an old room from
   * clearing a newer room's handlers during asynchronous cleanup.
   */
  setTransportHandlers(handlers: JamTransportHandlers | null): () => void {
    this.transportHandlers = handlers;
    this.refreshMediaSessionActions();
    let released = false;
    return () => {
      if (released || this.transportHandlers !== handlers) return;
      released = true;
      this.transportHandlers = null;
      this.refreshMediaSessionActions();
    };
  }

  // ── Public: initialization (call after React has mounted the player div) ──

  async initializeDefaultProvider(): Promise<void> {
    await this.ensureProviderReady();
    await this.subscribeToProvider();

    // App Router navigation can call the room's entry handler after the
    // private-library player is already loaded or playing. Do not cue the
    // current track again: that would reset the persistent audio element to
    // zero and silently pause it during navigation.
    if (this._providerState.duration > 0 || this._providerState.isPlaying || this._providerState.currentTime > 0) return;
    
    // Cue the first song in advance so buffering starts, reducing the 5-sec wait to 1-sec.
    const song = this.currentSong;
    const provider = this.activeProvider;
    const trackRef = song ? this.getTrackRef(song) : null;
    if (song && provider && typeof provider.cue === "function" && trackRef) {
      await provider.cue(trackRef);
    }
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
    if (this.mediaSessionPositionTimer) {
      clearInterval(this.mediaSessionPositionTimer);
      this.mediaSessionPositionTimer = null;
    }
    this.providerUnsub?.();
    this.providerEndedUnsub?.();
    this.providers.forEach((p) => p.destroy());
    this.providers.clear();
    this.transportHandlers = null;
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
      this.updateMediaSessionPlaybackState(state.isPlaying);
      
      if (isOnlyTimeUpdate && Math.abs(state.currentTime - lastTime) > 0.1) {
        lastTime = state.currentTime;
        this.notifyTime();
      } else if (!isOnlyTimeUpdate) {
        this.notify();
      }
    });

    this.providerEndedUnsub = provider.onEnded(() => {
      // A Jam adapter owns the timeline while installed. In particular, a
      // guest must never advance its private queue when the local element ends.
      void (this.transportHandlers ? this.transportHandlers.ended() : this.next());
    });
  }

  private async loadCurrentSong(play: boolean, startTime = 0): Promise<void> {
    const song = this.currentSong;
    if (!song) return;

    // Prefer private R2 only when this track actually has an authorized R2
    // reference. When moving back to the curated archive, leave R2 rather than
    // trying to load a missing private reference.
    const desiredProvider = this.providerForSong(song);
    if (desiredProvider !== this._activeProviderId) {
      await this.switchProvider(desiredProvider, false);
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
      : `${window.location.origin}/icon.svg`;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artist,
      album: song.movie ?? song.album ?? "Only For You",
      artwork: [{ src: artworkSrc, sizes: "512x512", type: "image/jpeg" }],
    });

    this.refreshMediaSessionActions();

    if (this.mediaSessionPositionTimer) clearInterval(this.mediaSessionPositionTimer);
    this.mediaSessionPositionTimer = setInterval(() => {
      if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
      const { currentTime, duration } = this._providerState;
      if (!duration || !Number.isFinite(duration) || currentTime < 0 || currentTime > duration) return;
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

  private refreshMediaSessionActions(): void {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const transport = this.transportHandlers;
    const run = (operation: () => Promise<void>) => {
      void operation().catch((error) => {
        this._providerState = {
          ...this._providerState,
          hasError: true,
          errorMessage: error instanceof Error ? error.message : "Media control failed.",
        };
        this.notify();
      });
    };
    try {
      navigator.mediaSession.setActionHandler("play", () => run(transport?.play ?? (() => this.play())));
      navigator.mediaSession.setActionHandler("pause", () => run(transport?.pause ?? (() => this.pause())));
      navigator.mediaSession.setActionHandler("previoustrack", () => run(transport?.previous ?? (() => this.previous())));
      navigator.mediaSession.setActionHandler("nexttrack", () => run(transport?.next ?? (() => this.next())));
    navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (details.seekTime != null) run(transport?.seek ? () => transport.seek(details.seekTime!) : () => this.seek(details.seekTime!));
    });
    navigator.mediaSession.setActionHandler("seekbackward", (details) => {
        const target = Math.max(0, this._providerState.currentTime - (details.seekOffset ?? 10));
        run(transport?.seek ? () => transport.seek(target) : () => this.seek(target));
    });
    navigator.mediaSession.setActionHandler("seekforward", (details) => {
        const target = Math.min(this._providerState.duration, this._providerState.currentTime + (details.seekOffset ?? 10));
        run(transport?.seek ? () => transport.seek(target) : () => this.seek(target));
    });
      navigator.mediaSession.setActionHandler("stop", () => run(transport?.pause ?? (() => this.pause())));
    } catch {
      // Some browsers implement only a subset of action names.
    }
  }

  private updateMediaSessionPlaybackState(isPlaying: boolean): void {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }

  private providerForSong(song: Song): ProviderId {
    if (song.playback?.r2TrackId) return "r2";
    if (this._activeProviderId === "spotify" && this._spotifyConnected && song.playback?.spotifyTrackId) return "spotify";
    if (song.playback?.youtubeId) return "youtube";
    if (song.playback?.spotifyTrackId && this._spotifyConnected) return "spotify";
    if (song.playback?.localPath) return "local";
    return this._activeProviderId;
  }

  private getTrackRef(song: Song): string | null {
    switch (this._activeProviderId) {
      case "r2":
        return song.playback?.r2TrackId ?? null;
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
      case "r2":
        return song?.playback?.youtubeId
          ? "No private audio for this track yet. Try YouTube."
          : "No audio file uploaded for this track yet.";
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
      hasR2Track: !!song?.playback?.r2TrackId,
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
