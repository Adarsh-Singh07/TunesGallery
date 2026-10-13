"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Music2 } from "lucide-react";
import type { TrackRow } from "../../lib/auth";
import { api, errorMessage, json } from "./api";
import { formatDuration } from "./helpers";
import { ARTWORK_ACCEPT, replaceArtwork, validateArtwork } from "./uploads";
import Modal from "./Modal";
import styles from "./private-library.module.css";

// Private signed artwork must remain a direct browser request; Next Image
// would proxy/cache the capability.
/* eslint-disable @next/next/no-img-element */

export default function TrackDetails({ track, editable, onClose, onChanged }: { track: TrackRow; editable: boolean; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [artwork, setArtwork] = useState<File | null>(null);
  const [preview, setPreview] = useState(track.artworkUrl || "");
  const [progress, setProgress] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!artwork) return;
    const url = URL.createObjectURL(artwork); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [artwork]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const data = new FormData(event.currentTarget);
    controller.current = new AbortController();
    try {
      const title = String(data.get("title")).trim();
      const artist = String(data.get("artist")).trim();
      if (!title || !artist) throw new Error("Title and artist are required.");
      const tags = String(data.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean);
      if (tags.length > 20 || tags.some((tag) => tag.length > 50)) throw new Error("Use up to 20 tags, each 50 characters or fewer.");
      await api(`/api/tracks/${track.id}`, json("PATCH", {
        title, artist, album: data.get("album"), movie: data.get("movie"), year: data.get("year"),
        tags,
        ...(data.get("duration") !== "" ? { duration_seconds: Number(data.get("duration")) } : {}),
      }));
      if (artwork) {
        setNotice("Metadata saved. Uploading artwork…");
        setProgress(0);
        await replaceArtwork(track.id, artwork, controller.current.signal, setProgress);
        setArtwork(null);
      }
      setNotice("Track details saved."); onChanged();
    } catch (err) { setError(controller.current?.signal.aborted ? "Artwork upload cancelled. Your metadata is saved; save again to retry the artwork." : errorMessage(err)); onChanged(); }
    finally { setBusy(false); setProgress(null); }
  }
  return <Modal title={editable ? "Edit track details" : "Track details"} onClose={onClose} busy={busy}>
    <div className={`${styles.actions} ${styles.panel}`}>
       <div className={styles.cover}>{preview ? <>{/* Private signed artwork must remain a direct browser request; Next Image would proxy/cache the capability. */}{/* eslint-disable-next-line @next/next/no-img-element */}<img src={preview} alt="" /></> : <Music2 aria-hidden="true" />}</div>
      <div className={styles.trackBody}><h3 className={styles.trackTitle}>{track.title}</h3><p className={styles.small}>{track.artist} · {formatDuration(track.duration_seconds)}</p></div>
      <span className={styles.badge}>{track.status}</span>
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {editable ? <form onSubmit={(event) => void save(event)} className={styles.form}>
      <fieldset disabled={busy} className={styles.formGrid} style={{ border: 0, padding: 0, minWidth: 0 }}>
        {([['title', 'Title'], ['artist', 'Artist'], ['album', 'Album'], ['movie', 'Film / collection'], ['year', 'Year']] as const).map(([name, label]) => <label key={name} className={styles.label}>{label}<input name={name} defaultValue={track[name] ?? ""} required={name === "title" || name === "artist"} maxLength={name === "year" ? 10 : 300} className={styles.input} /></label>)}
        <label className={styles.label}>Duration in seconds<input className={styles.input} name="duration" type="number" min="0.01" max="86400" step="0.01" defaultValue={track.duration_seconds ?? ""} placeholder="Unknown" /></label>
        <label className={`${styles.label} ${styles.full}`}>Tags, separated by commas<input className={styles.input} name="tags" defaultValue={track.tags.join(", ")} placeholder="late nights, acoustic" /></label>
        <label className={`${styles.label} ${styles.full}`}><span><ImagePlus size={14} aria-hidden="true" /> Replace artwork</span><input type="file" className={styles.fileInput} accept={ARTWORK_ACCEPT} onChange={(event) => {
          const file = event.target.files?.[0]; if (!file) return;
          const invalid = validateArtwork(file); setError(invalid || ""); if (!invalid) setArtwork(file); else event.target.value = "";
        }} /><span className={styles.small}>JPEG, PNG, WebP or AVIF · up to 10 MB</span></label>
      </fieldset>
      {progress !== null && <div className={styles.stack}><progress className={styles.progress} max={100} value={progress} aria-label="Artwork upload progress" /><button type="button" className={styles.secondary} onClick={() => controller.current?.abort()}>Cancel artwork upload</button></div>}
      <div className={styles.dialogFooter}><button type="button" className={styles.secondary} onClick={onClose} disabled={busy}>Close</button><button className={styles.button} disabled={busy}>{busy ? "Saving…" : "Save details"}</button></div>
    </form> : <>
      <dl className={styles.details}>{([['Album', track.album], ['Film / collection', track.movie], ['Year', track.year], ['Duration', formatDuration(track.duration_seconds)], ['Tags', track.tags.join(", ")], ['Added', new Date(track.created_at).toLocaleDateString()]]).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "—"}</dd></div>)}</dl>
      <p className={styles.small}>Metadata is maintained by the library owner.</p>
    </>}
  </Modal>;
}
