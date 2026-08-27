// ─────────────────────────────────────────────────────────────────────────────
// Shared types for the playback abstraction layer (YouTube-only version)
// ─────────────────────────────────────────────────────────────────────────────

export type ProviderId = "youtube" | "local";
export type RepeatMode = "none" | "all" | "one";

export interface ProviderState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isLoading: boolean;
  hasError: boolean;
  errorMessage: string;
}

export type StateListener = (state: ProviderState) => void;

export interface PlaybackProvider {
  readonly id: ProviderId;
  readonly isReady: boolean;
  initialize(): Promise<void>;
  loadAndPlay(trackRef: string): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  getState(): ProviderState;
  subscribe(listener: StateListener): () => void;
  onEnded(callback: () => void): () => void;
  destroy(): void;
}

export interface PlaybackReference {
  youtubeId?: string;
  localPath?: string;
}

export interface ManagerState {
  currentIndex: number;
  shuffle: boolean;
  repeat: RepeatMode;
  activeProvider: ProviderId;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isLoading: boolean;
  hasError: boolean;
  errorMessage: string;
  hasYouTubeId: boolean;
}

export type ManagerListener = (state: ManagerState) => void;

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
