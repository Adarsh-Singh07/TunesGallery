"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, RefreshCw, UploadCloud, X } from "lucide-react";
import type { TrackRow } from "../../lib/auth";
import { ApiError, errorMessage } from "./api";
import { AUDIO_ACCEPT, ARTWORK_ACCEPT, isActiveUpload, runUpload, sameFile, validateArtwork, validateAudio, type UploadJob } from "./uploads";
import { formatDuration } from "./helpers";
import styles from "./private-library.module.css";

export default function UploadDashboard({ tracks, onChanged }: { tracks: TrackRow[]; onChanged: () => void }) {
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const jobsRef = useRef<UploadJob[]>([]);
  const active = useRef<{ id: string; controller: AbortController } | null>(null);
  const processing = useRef(false);
  const mounted = useRef(true);
  const patchJob = useCallback((id: string, patch: Partial<UploadJob>) => {
    jobsRef.current = jobsRef.current.map((job) => job.id === id ? { ...job, ...patch } : job);
    if (mounted.current) setJobs([...jobsRef.current]);
  }, []);
  useEffect(() => {
    mounted.current = true;
    const warn = (event: BeforeUnloadEvent) => { if (processing.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => { mounted.current = false; active.current?.controller.abort(); window.removeEventListener("beforeunload", warn); };
  }, []);

  function addFiles(files: File[]) {
    const messages: string[] = [];
    const added: UploadJob[] = [];
    for (const file of files) {
      const invalid = validateAudio(file);
      if (invalid) { messages.push(`${file.name}: ${invalid}`); continue; }
      if ([...jobsRef.current, ...added].some((job) => sameFile(job.file, file))) { messages.push(`${file.name} is already in your upload queue.`); continue; }
      added.push({ id: crypto.randomUUID(), file, title: file.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim().slice(0, 300), artist: "", album: "", movie: "", year: "", artwork: null, progress: 0, status: "queued", message: "Review the details, then start your upload." });
    }
    jobsRef.current = [...jobsRef.current, ...added]; setJobs([...jobsRef.current]); setError(messages.join(" "));
  }

  async function startQueue() {
    if (processing.current) return;
    processing.current = true; setRunning(true);
    try {
      while (mounted.current) {
        const next = jobsRef.current.find((job) => job.status === "queued");
        if (!next) break;
        const duplicate = !next.trackId && tracks.find((track) => track.title.toLocaleLowerCase() === next.title.trim().toLocaleLowerCase() && track.artist.toLocaleLowerCase() === (next.artist.trim() || "Unknown artist").toLocaleLowerCase());
        if (duplicate) { patchJob(next.id, { status: "duplicate", message: `Already in your library: “${duplicate.title}”. Edit the title or artist if this is a different recording.` }); continue; }
        const controller = new AbortController(); active.current = { id: next.id, controller };
        try {
          await runUpload({ ...next }, controller.signal, (patch) => patchJob(next.id, patch));
        } catch (err) {
          if (controller.signal.aborted) patchJob(next.id, { status: "cancelled", message: "Upload stopped. Retry here to continue with this file." });
          else if (err instanceof ApiError && err.status === 409 && (err.body.duplicateOf || err.body.error === "DUPLICATE")) patchJob(next.id, { status: "duplicate", message: "This recording or its title and artist already exists. Check the library before retrying." });
          else patchJob(next.id, { status: "error", message: errorMessage(err), ...(err instanceof ApiError && [410, 412, 422].includes(err.status) && !jobsRef.current.find((item) => item.id === next.id)?.audioVerified ? { audioUploaded: false, audioUploadId: undefined } : {}) });
        } finally { active.current = null; if (mounted.current) onChanged(); }
      }
    } finally { processing.current = false; if (mounted.current) setRunning(false); }
  }
  function cancel(job: UploadJob) {
    if (active.current?.id === job.id) active.current.controller.abort();
    else patchJob(job.id, { status: "cancelled", message: "Removed from the active queue. Retry when you’re ready." });
  }
  function retry(job: UploadJob) {
    patchJob(job.id, { status: "queued", message: "Ready to retry.", progress: 0 });
    void startQueue();
  }
  const queued = jobs.filter((job) => job.status === "queued").length;
  const finished = jobs.filter((job) => job.status === "ready").length;

  return <section aria-label="Upload audio files" className={styles.stack}>
    <div className={`${styles.drop} ${dragging ? styles.dropActive : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(Array.from(event.dataTransfer.files)); }}>
      <UploadCloud aria-hidden="true" /><h2 className={styles.heading}>Give your songs a home.</h2>
      <p className={styles.small}>Drop audio files here, or choose them from your device.<br />MP3 · M4A/AAC · OGG · WAV · FLAC · up to 200 MB each</p>
      <label className={styles.label}><span className={styles.srOnly}>Choose audio files</span><input type="file" className={styles.fileInput} accept={AUDIO_ACCEPT} multiple onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} /></label>
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {jobs.length === 0 ? <div className={styles.panel}><p className={styles.eyebrow}>A little care before the first play</p><h3 className={styles.heading}>Choose. Make it yours. Upload.</h3><p className={styles.small}>Add several files, review their names and artwork, then upload at your pace. Audio goes directly to private storage. Keep this page open until the queue finishes.</p></div> : <>
      <div className={styles.between}><p className={styles.small} role="status">{jobs.length} files · {finished} ready · {queued} queued</p><div className={styles.actions}>
        <button className={styles.secondary} disabled={!finished || running} onClick={() => { jobsRef.current = jobsRef.current.filter((job) => job.status !== "ready"); setJobs([...jobsRef.current]); }}>Clear completed</button>
        <button className={styles.button} disabled={!queued || running} onClick={() => void startQueue()}><UploadCloud size={16} aria-hidden="true" />{running ? "Uploading…" : `Upload ${queued || "queued"} ${queued === 1 ? "track" : "tracks"}`}</button>
      </div></div>
      <ul className={`${styles.list} ${styles.stack}`}>{jobs.map((job) => {
        const busy = isActiveUpload(job.status);
        const locked = busy || job.status === "ready" || !!job.trackId;
        return <li className={styles.job} key={job.id}>
          <div className={styles.between}><p className={styles.small}>{job.file.name} · {(job.file.size / 1024 / 1024).toFixed(1)} MB{job.durationSeconds != null && ` · ${formatDuration(job.durationSeconds)}`}</p><span className={styles.badge}>{job.status === "ready" && <Check size={12} aria-hidden="true" />}{job.status}</span></div>
          <fieldset disabled={locked} className={styles.formGrid} style={{ border: 0, padding: "16px 0", minWidth: 0 }}>
            {([['title', 'Title'], ['artist', 'Artist'], ['album', 'Album'], ['movie', 'Film / collection'], ['year', 'Year']] as const).map(([field, label]) => <label key={field} className={styles.label}>{label}<input className={styles.input} value={job[field]} maxLength={field === "year" ? 10 : 300} onChange={(event) => patchJob(job.id, { [field]: event.target.value })} placeholder={field === "artist" ? "Unknown artist" : undefined} /></label>)}
            <label className={styles.label}>Cover artwork (optional)<input type="file" className={styles.fileInput} accept={ARTWORK_ACCEPT} onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const invalid = validateArtwork(file); if (invalid) { setError(invalid); event.target.value = ""; } else { setError(""); patchJob(job.id, { artwork: file }); } }} /><span className={styles.small}>Up to 10 MB{job.artwork && ` · ${job.artwork.name}`}</span></label>
          </fieldset>
          {busy && <progress className={styles.progress} max={100} value={job.progress} aria-label={`${job.title} upload progress`} />}
          <div className={styles.between}><p className={job.status === "error" ? styles.error : styles.small} role={job.status === "error" ? "alert" : undefined}>{job.message}{job.audioVerified && job.status !== "ready" ? " Audio is ready; retry to finish artwork." : ""}</p><div className={styles.actions}>
            {(busy || job.status === "queued") && <button className={styles.secondary} onClick={() => cancel(job)}><X size={14} aria-hidden="true" />Cancel</button>}
            {["error", "cancelled", "duplicate"].includes(job.status) && <button className={styles.secondary} onClick={() => retry(job)}><RefreshCw size={14} aria-hidden="true" />Retry</button>}
            {!busy && <button className={styles.iconButton} aria-label={`Dismiss ${job.file.name} from queue`} onClick={() => { jobsRef.current = jobsRef.current.filter((item) => item.id !== job.id); setJobs([...jobsRef.current]); }}><X size={15} /></button>}
          </div></div>
          {job.trackId && job.status !== "ready" && <p className={styles.small}>The existing track is kept for retry. You can edit or delete it in the Tracks section.</p>}
        </li>;
      })}</ul>
    </>}
  </section>;
}
