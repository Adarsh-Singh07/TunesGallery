// ─────────────────────────────────────────────────────────────────────────────
// Shared types for the playback abstraction layer
// ─────────────────────────────────────────────────────────────────────────────

export type ProviderId = "youtube" | "spotify" | "local";
export type RepeatMode = "none" | "all" | "one";

/** Low-level state emitted by each provider */
export interface ProviderState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number; // 0–1
  isMuted: boolean;
  isLoading: boolean;
  hasError: boolean;
  errorMessage: string;
}

export type StateListener = (state: ProviderState) => void;

/**
 * Every concrete playback provider (YouTube, Spotify, Local) must satisfy
 * this interface. MusicRoom only talks to PlaybackManager, which delegates
 * here — the UI never imports a concrete provider directly.
 */
export interface PlaybackProvider {
  readonly id: ProviderId;
  readonly isReady: boolean;

  /** Async setup: load SDKs, create players, register devices */
  initialize(): Promise<void>;

  /**
   * Load a track by its provider-specific reference string and begin playback.
   * e.g. YouTube video ID, Spotify track URI, or local file path.
   */
  loadAndPlay(trackRef: string): Promise<void>;

  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  setVolume(volume: number): Promise<void>; // 0–1
  setMuted(muted: boolean): Promise<void>;

  /** Returns a snapshot of current state (no subscription needed for reads) */
  getState(): ProviderState;

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: StateListener): () => void;

  /** Fires once when the current track naturally ends (not on pause/seek) */
  onEnded(callback: () => void): () => void;

  /** Tear down the provider — remove DOM nodes, clear timers, etc. */
  destroy(): void;
}

/** References to locate a song on each provider's platform */
export interface PlaybackReference {
  youtubeId?: string;
  spotifyTrackId?: string;
  /** Optional local file path — only used for dev/testing via LocalAudioProvider */
  localPath?: string;
}

/** Manager-level state — what the React hook exposes to the UI */
export interface ManagerState {
  // Playlist
  currentIndex: number;
  shuffle: boolean;
  repeat: RepeatMode;

  // Provider
  activeProvider: ProviderId;
  spotifyConnected: boolean;
  spotifyConnecting: boolean;

  // Audio (forwarded from the active provider)
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isLoading: boolean;
  hasError: boolean;
  errorMessage: string;

  // Track availability
  hasYouTubeId: boolean;
  hasSpotifyId: boolean;
}

export type ManagerListener = (state: ManagerState) => void;

/** Default provider state — used before a provider is initialized */
export const DEFAULT_PROVIDER_STATE: ProviderState = {
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.85,
  isMuted: false,
  isLoading: false,
  hasError: false,
  errorMessage: "",
};
