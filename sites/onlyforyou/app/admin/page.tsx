"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Disc3, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { TrackRow } from "../../lib/auth";
import { api, collection, errorMessage } from "../../components/private-library/api";
import { filterTracks } from "../../components/private-library/helpers";
import { LibraryShell, SessionBoundary } from "../../components/private-library/LibraryShell";
import { useLibrarySession } from "../../components/private-library/useLibrarySession";
import UploadDashboard from "../../components/private-library/UploadDashboard";
import AccessDashboard from "../../components/private-library/AccessDashboard";
import TrackDetails from "../../components/private-library/TrackDetails";
import TrackList from "../../components/private-library/TrackList";
import Modal from "../../components/private-library/Modal";
import styles from "../../components/private-library/private-library.module.css";

export default function AdminPage() {
  const session = useLibrarySession();
  return <LibraryShell active="admin" profile={session.profile}><SessionBoundary session={session} admin>{session.profile?.is_admin && <Studio key={session.profile.id} ownerId={session.profile.id} />}</SessionBoundary></LibraryShell>;
}

function Studio({ ownerId }: { ownerId: string }) {
  const [tab, setTab] = useState<"uploads" | "tracks" | "access">("uploads");
  const [tracks, setTracks] = useState<TrackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [details, setDetails] = useState<TrackRow | null>(null);
  const [deleting, setDeleting] = useState<TrackRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setError("");
    try { const rows = await collection<TrackRow>("/api/tracks", "tracks", signal); if (!signal?.aborted) setTracks(rows); }
    catch (err) { if (!signal?.aborted) setError(errorMessage(err)); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, [refresh]);
  const filtered = useMemo(() => filterTracks(tracks, query).filter((track) => status === "all" || track.status === status).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)), [tracks, query, status]);
  async function removeTrack() {
    if (!deleting) return; setBusy(true); setError(""); setNotice("");
    try { await api(`/api/tracks/${deleting.id}`, { method: "DELETE" }); setDeleting(null); setNotice("Track deleted from your library."); await refresh(); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice("");
    const form = event.currentTarget; const data = new FormData(form); const password = String(data.get("password") || "");
    if (password !== data.get("confirm")) { setError("The passwords don’t match. Please enter them again."); return; }
    setPasswordBusy(true);
    try { const result = await supabase!.auth.updateUser({ password }); if (result.error) throw result.error; form.reset(); setNotice("Your password has been updated."); }
    catch (err) { setError(errorMessage(err)); }
    finally { setPasswordBusy(false); }
  }
  return <>
    <header className={styles.hero}><div><p className={styles.eyebrow}>The owner’s studio</p><h1 className={styles.title}>Keep the music.<br />Share the feeling.</h1><p className={styles.subtitle}>A quiet workspace for your records, their stories, and the people you let in.</p><div className={styles.stats}><span><strong>{tracks.filter((track) => track.status === "ready").length}</strong> ready to play</span><span><strong>{tracks.filter((track) => track.status !== "ready").length}</strong> unfinished</span><Link className={styles.navLink} href="/library">Open private library →</Link></div></div><div className={styles.record} aria-hidden="true"><ShieldCheck /></div></header>
    <nav className={styles.tabs} aria-label="Studio sections">{([['uploads', 'Uploads'], ['tracks', 'Tracks'], ['access', 'People & access']] as const).map(([value, label]) => <button key={value} className={styles.tab} aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</button>)}</nav>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    {/* Keep the queue mounted while browsing other studio sections. */}
    <div hidden={tab !== "uploads"}><UploadDashboard tracks={tracks} onChanged={() => void refresh()} /></div>
    {tab === "tracks" && <section aria-label="Manage tracks">
      <div className={styles.toolbar}><label className={styles.search}><span className={styles.srOnly}>Search uploaded tracks</span><Search size={17} aria-hidden="true" /><input type="search" className={styles.input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your records…" /></label><div className={styles.actions}><label className={styles.label}><span className={styles.srOnly}>Track status</span><select className={styles.select} value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="ready">Ready</option><option value="pending">Pending</option><option value="failed">Failed</option></select></label><button className={styles.iconButton} aria-label="Refresh tracks" onClick={() => void refresh()}><RefreshCw size={16} /></button></div></div>
      {loading ? <p role="status" className={styles.loading}>Loading records…</p> : !filtered.length ? <div className={styles.empty}><Disc3 aria-hidden="true" /><h2 className={styles.heading}>{tracks.length ? "No matching records." : "An empty shelf. A fresh beginning."}</h2><p>{tracks.length ? "Try a different search or status." : "Add your first audio file to start a private collection."}</p><button className={styles.secondary} onClick={() => tracks.length ? (setQuery(""), setStatus("all")) : setTab("uploads")}>{tracks.length ? "Clear filters" : "Choose your first track"}</button></div> : <div className={styles.panel}><TrackList tracks={filtered} onDetails={setDetails} onDelete={setDeleting} /></div>}
    </section>}
    {tab === "access" && <AccessDashboard tracks={tracks} ownerId={ownerId} />}
    <details className={styles.panel} style={{ marginTop: 32 }}><summary className={styles.small}>Account settings · change password</summary><form className={styles.form} style={{ marginTop: 20, maxWidth: 500 }} onSubmit={(event) => void changePassword(event)}><label className={styles.label}>New password<input className={styles.input} type="password" name="password" autoComplete="new-password" minLength={8} required disabled={passwordBusy} /></label><label className={styles.label}>Confirm new password<input className={styles.input} type="password" name="confirm" autoComplete="new-password" minLength={8} required disabled={passwordBusy} /></label><button className={styles.secondary} disabled={passwordBusy}>{passwordBusy ? "Updating…" : "Update password"}</button></form></details>
    {details && <TrackDetails track={details} editable onClose={() => setDetails(null)} onChanged={() => void refresh()} />}
    {deleting && <Modal title={`Delete “${deleting.title}”?`} busy={busy} onClose={() => setDeleting(null)}><p className={styles.small}>This removes the audio, artwork, and access to this track. Playlists that included it will no longer play it.</p>{error && <p className={styles.error} role="alert">{error}</p>}<div className={styles.dialogFooter}><button className={styles.secondary} disabled={busy} onClick={() => setDeleting(null)}>Keep track</button><button className={styles.danger} disabled={busy} onClick={() => void removeTrack()}>{busy ? "Deleting…" : "Delete track"}</button></div></Modal>}
  </>;
}
