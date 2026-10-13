"use client";

import { Info, Music2, Pause, Play, Trash2 } from "lucide-react";
import type { TrackRow } from "../../lib/auth";
import { formatDuration } from "./helpers";
import styles from "./private-library.module.css";

// Private signed artwork must remain a direct browser request; Next Image
// would proxy/cache the capability.
/* eslint-disable @next/next/no-img-element */

export default function TrackList({ tracks, currentId, isPlaying, onPlay, onDetails, onDelete, playbackReady = true }: {
  tracks: TrackRow[]; currentId?: string; isPlaying?: boolean; onPlay?: (track: TrackRow) => void;
  onDetails: (track: TrackRow) => void; onDelete?: (track: TrackRow) => void; playbackReady?: boolean;
}) {
  return <ul className={styles.list} aria-label="Tracks">{tracks.map((track) => <li key={track.id} className={`${styles.track} ${currentId === track.id ? styles.trackActive : ""}`}>
     <div className={styles.cover}>{track.artworkUrl ? <>{/* Private signed artwork must remain a direct browser request; Next Image would proxy/cache the capability. */}{/* eslint-disable-next-line @next/next/no-img-element */}<img src={track.artworkUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} /></> : <Music2 size={22} aria-hidden="true" />}</div>
    <div className={styles.trackBody}><button className={styles.trackTitle} onClick={() => onDetails(track)}>{track.title}</button><p className={styles.small}>{track.artist}{track.album && ` · ${track.album}`}</p>{track.status !== "ready" && <span className={styles.badge}>{track.status}</span>}</div>
    <span className={styles.duration}>{formatDuration(track.duration_seconds)}</span>
    <div className={styles.actions}>
      {onPlay && <button className={styles.iconButton} disabled={track.status !== "ready" || !playbackReady} onClick={() => onPlay(track)} aria-label={`${currentId === track.id && isPlaying ? "Pause" : "Play"} ${track.title}`}>{currentId === track.id && isPlaying ? <Pause size={17} /> : <Play size={17} />}</button>}
      <button className={styles.iconButton} onClick={() => onDetails(track)} aria-label={`Details for ${track.title}`}><Info size={17} /></button>
      {onDelete && <button className={styles.iconButton} onClick={() => onDelete(track)} aria-label={`Delete ${track.title}`}><Trash2 size={16} /></button>}
    </div>
  </li>)}</ul>;
}
