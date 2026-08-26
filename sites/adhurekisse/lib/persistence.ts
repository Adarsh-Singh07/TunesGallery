import { ProviderId } from "./playback/types";

const LISTENING_MEMORY_KEY = "adhurekisse_listening_memory";
const SESSION_ENTRY_KEY = "adhurekisse_session_entry";
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface ListeningState {
  songId: string;
  position: number;
  provider: ProviderId;
  savedAt: number;
}

export function saveListeningState(state: Omit<ListeningState, "savedAt">) {
  if (typeof window === "undefined") return;
  try {
    const data: ListeningState = { ...state, savedAt: Date.now() };
    window.localStorage.setItem(LISTENING_MEMORY_KEY, JSON.stringify(data));
  } catch (err) {
    console.error("Failed to save listening state", err);
  }
}

export function loadListeningState(): ListeningState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LISTENING_MEMORY_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as ListeningState;
    if (Date.now() - data.savedAt > TTL_MS) {
      window.localStorage.removeItem(LISTENING_MEMORY_KEY);
      return null;
    }
    return data;
  } catch (err) {
    console.error("Failed to load listening state", err);
    return null;
  }
}

export function clearListeningState() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LISTENING_MEMORY_KEY);
}

export function markSessionEntered() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(SESSION_ENTRY_KEY, "1");
}

export function hasSessionEntered(): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(SESSION_ENTRY_KEY) === "1";
}
