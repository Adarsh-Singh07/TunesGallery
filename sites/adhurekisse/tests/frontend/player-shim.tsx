import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Song } from "../../data/songs";

type Player = { manager: { currentSong: Song | null; setSongs: (songs: Song[]) => void; selectSong: (index: number) => Promise<void> }; state: { isPlaying: boolean; hasError: boolean; errorMessage: string }; controls: { togglePlay: () => void } };
const Context = createContext<Player | null>(null);
export function TestPlayerProvider({ children }: { children: ReactNode }) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const value = useMemo<Player>(() => ({
    manager: {
      currentSong: songs[index] ?? null,
      setSongs: (next) => { const target = window as Window & { __queueWrites?: number }; target.__queueWrites = (target.__queueWrites ?? 0) + 1; setSongs(next); },
      selectSong: async (next) => { setIndex(next); setPlaying(true); },
    }, state: { isPlaying: playing, hasError: false, errorMessage: "" }, controls: { togglePlay: () => setPlaying((value) => !value) },
  }), [songs, index, playing]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePlayer() { const player = useContext(Context); if (!player) throw new Error("Missing test player"); return player; }
