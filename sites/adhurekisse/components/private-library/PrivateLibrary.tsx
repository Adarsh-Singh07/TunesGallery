"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Copy, Disc3, Headphones, RefreshCw, Search, UploadCloud } from "lucide-react";
import type { TrackRow } from "../../lib/auth";
import { usePlayer } from "../PlaybackContext";
import { collection, errorMessage } from "./api";
import { filterTracks, safeReturnPath, trackToSong } from "./helpers";
import { useLibrarySession } from "./useLibrarySession";
import { LibraryShell, SessionBoundary } from "./LibraryShell";
import TrackDetails from "./TrackDetails";
import TrackList from "./TrackList";
import Playlists from "./Playlists";
import styles from "./private-library.module.css";

export default function PrivateLibrary() {
  const session = useLibrarySession();
  const [returnTo, setReturnTo] = useState("/library");
  useEffect(() => { setReturnTo(safeReturnPath(`/library${window.location.search}`)); }, []);
  return <LibraryShell active="library" profile={session.profile}><SessionBoundary session={session} returnTo={returnTo}>{session.profile && <Collection key={session.profile.id} profile={session.profile} />}</SessionBoundary></LibraryShell>;
}

function Collection({ profile }: { profile: NonNullable<ReturnType<typeof useLibrarySession>["profile"]> }) {
  const { manager, state, controls } = usePlayer();
  const [tracks, setTracks] = useState<TrackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [tab, setTab] = useState<"tracks" | "playlists">("tracks");
  const [details, setDetails] = useState<TrackRow | null>(null);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try { const rows = await collection<TrackRow>("/api/tracks", "tracks", signal); if (!signal?.aborted) setTracks(rows.filter((track) => track.status === "ready")); }
    catch (err) { if (!signal?.aborted) setError(errorMessage(err)); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); if (new URLSearchParams(window.location.search).has("playlist")) setTab("playlists"); return () => controller.abort(); }, [refresh]);
  const visible = useMemo(() => filterTracks(tracks, query).sort((a, b) => sort === "title" ? a.title.localeCompare(b.title) : sort === "artist" ? a.artist.localeCompare(b.artist) : Date.parse(b.created_at) - Date.parse(a.created_at)), [tracks, query, sort]);
  const currentId = manager?.currentSong?.playback.r2TrackId;
  async function play(queue: TrackRow[], requested?: TrackRow) {
    const selected = requested ?? queue[0];
    if (!manager || !selected) return;
    setError("");
    try {
      if (requested && manager.currentSong?.playback.r2TrackId === selected.id) { controls.togglePlay(); return; }
      // An explicit play action owns the queue. Never replace it during render/fetch.
      manager.setSongs(queue.map(trackToSong));
      await manager.selectSong(queue.findIndex((track) => track.id === selected.id));
    } catch (err) { setError(errorMessage(err)); }
  }
  return <>
    <header className={styles.hero}><div><p className={styles.eyebrow}>Your private collection</p><h1 className={styles.title}>Some songs feel<br />like coming home.</h1><p className={styles.subtitle}>Your records. Your people. A little space for the music you want to keep close.</p><div className={styles.stats}><span><strong>{tracks.length}</strong> tracks</span><span><strong>{new Set(tracks.map((track) => track.artist)).size}</strong> artists</span><span>Only shared with the people you choose</span></div></div><div className={styles.record} aria-hidden="true"><Headphones /></div></header>
    <div className={styles.between}><nav className={styles.tabs} aria-label="Collection sections"><button className={styles.tab} aria-pressed={tab === "tracks"} onClick={() => setTab("tracks")}>My tracks</button><button className={styles.tab} aria-pressed={tab === "playlists"} onClick={() => setTab("playlists")}>Playlists</button></nav>{profile.is_admin && <Link className={styles.secondary} href="/admin"><UploadCloud size={16} aria-hidden="true" />Upload music</Link>}</div>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {error && <div className={styles.error} role="alert">{error} <button className={styles.secondary} onClick={() => void refresh()}>Try again</button></div>}
    {state.hasError && currentId && <p className={styles.error} role="alert">{state.errorMessage || "This track could not play. Try again or ask the owner to check its audio."}</p>}
    {tab === "tracks" ? <section aria-label="Private tracks">
      <div className={styles.toolbar}><label className={styles.search}><span className={styles.srOnly}>Search your tracks</span><Search size={17} aria-hidden="true" /><input type="search" className={styles.input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a song, artist, or feeling…" /></label><div className={styles.actions}><label className={styles.label}><span className={styles.srOnly}>Sort tracks</span><select value={sort} onChange={(event) => setSort(event.target.value)} className={styles.select}><option value="newest">Recently added</option><option value="title">Title A–Z</option><option value="artist">Artist A–Z</option></select></label><button className={styles.iconButton} aria-label="Refresh library" disabled={loading} onClick={() => void refresh()}><RefreshCw size={16} /></button></div></div>
      {loading ? <p className={styles.loading} role="status">Finding your records…</p> : !tracks.length && !error ? <div className={styles.empty}><Disc3 aria-hidden="true" /><h2 className={styles.heading}>{profile.is_admin ? "Your first record starts here." : "Your collection is still unfolding."}</h2><p>{profile.is_admin ? "Upload a favorite track, add its cover, and make this room your own. Build a playlist when the mood finds you." : "The owner can share tracks or a playlist with you. While you wait, the curated archive has a few stories to tell."}</p><div className={styles.actions}>{profile.is_admin && <Link className={styles.button} href="/admin">Upload your first track</Link>}<Link className={styles.secondary} href="/">Listen to the archive</Link></div></div> : !visible.length && !error ? <div className={styles.empty}><Search aria-hidden="true" /><h2 className={styles.heading}>No records found.</h2><p>Try an artist, album, year or another mood.</p><button className={styles.secondary} onClick={() => setQuery("")}>Clear search</button></div> : <div className={styles.panel}><TrackList tracks={visible} onDetails={setDetails} onPlay={(track) => void play(visible, track)} currentId={currentId} isPlaying={state.isPlaying} playbackReady={!!manager} /></div>}
    </section> : <Playlists tracks={tracks} profile={profile} onPlay={(queue, selected) => void play(queue, selected)} onDetails={setDetails} currentId={currentId} isPlaying={state.isPlaying} />}
    <footer className={styles.between} style={{ marginTop: 36 }}><p className={styles.small}>Signed in as {profile.display_name || profile.email}</p><button className={styles.secondary} onClick={async () => { try { await navigator.clipboard.writeText(profile.id); setNotice("Your account ID is copied. Share it with a playlist owner."); } catch { setNotice(`Your account ID: ${profile.id}`); } }}><Copy size={14} aria-hidden="true" />Copy my account ID</button></footer>
    {details && <TrackDetails track={details} editable={profile.is_admin && details.owner_id === profile.id} onClose={() => setDetails(null)} onChanged={() => void refresh()} />}
  </>;
}
