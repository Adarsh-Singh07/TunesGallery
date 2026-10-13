"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Copy, ListMusic, Play, Plus, Search, Share2, Trash2 } from "lucide-react";
import type { Profile, TrackRow } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { api, collection, errorMessage, json } from "./api";
import { filterTracks } from "./helpers";
import Modal from "./Modal";
import TrackList from "./TrackList";
import styles from "./private-library.module.css";

export interface PlaylistRow {
  id: string; owner_id: string; title: string;
  revision?: number;
  trackIds?: string[];
  playlist_tracks?: { track_id: string; position: number }[];
  playlist_permissions?: { user_id: string; grant_tracks?: boolean }[];
}
export function playlistTrackIds(playlist: PlaylistRow): string[] {
  return playlist.trackIds ?? [...(playlist.playlist_tracks ?? [])].sort((a, b) => a.position - b.position).map((entry) => entry.track_id);
}

export default function Playlists({ tracks, profile, onPlay, onDetails, currentId, isPlaying }: {
  tracks: TrackRow[]; profile: Profile; onPlay: (tracks: TrackRow[], selected?: TrackRow) => void;
  onDetails: (track: TrackRow) => void; currentId?: string; isPlaying: boolean;
}) {
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<PlaylistRow | "new" | null>(null);
  const [sharing, setSharing] = useState<PlaylistRow | null>(null);
  const [deleting, setDeleting] = useState<PlaylistRow | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setError("");
    try { const rows = await collection<PlaylistRow>("/api/playlists", "playlists", signal); if (!signal?.aborted) setPlaylists(rows); }
    catch (err) { if (!signal?.aborted) setError(errorMessage(err)); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, [refresh]);
  useEffect(() => { setSelectedId(new URLSearchParams(window.location.search).get("playlist")); }, []);
  const selected = playlists.find((playlist) => playlist.id === selectedId);
  const selectedTracks = selected ? playlistTrackIds(selected).flatMap((id) => tracks.find((track) => track.id === id) ?? []) : [];
  const canEdit = (playlist: PlaylistRow) => playlist.owner_id === profile.id;
  async function remove() {
    if (!deleting) return; setBusy(true); setError("");
    try { await api("/api/playlists", json("DELETE", { id: deleting.id, expectedRevision: deleting.revision })); setDeleting(null); setSelectedId(null); setNotice("Playlist deleted. Its tracks are still in your library."); await refresh(); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <section aria-label="Your playlists">
    <div className={styles.toolbar}><div><h2 className={styles.heading}>Made for a moment</h2><p className={styles.small}>A few songs, in just the right order.</p></div><div className={styles.actions}><button className={styles.secondary} onClick={() => void refresh()}>Refresh playlists</button><button className={styles.button} onClick={() => setEditor("new")}><Plus size={16} aria-hidden="true" />New playlist</button></div></div>
    {error && <div className={styles.error} role="alert">{error} <button className={styles.secondary} onClick={() => void refresh()}>Try again</button></div>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {selectedId && !selected && !loading && !error && <p className={styles.notice} role="status">That playlist isn’t available. It may have been removed or not shared with you.</p>}
    {loading ? <p className={styles.loading} role="status">Finding your playlists…</p> : playlists.length === 0 ? <div className={styles.empty}><ListMusic aria-hidden="true" /><h3 className={styles.heading}>Every mood deserves a mixtape.</h3><p>Start with a name. Add the tracks you love, arrange them, and share with someone in your room.</p><button className={styles.secondary} onClick={() => setEditor("new")}>Create your first playlist</button></div> : <div className={styles.grid}>
      {playlists.map((playlist) => {
        const ids = playlistTrackIds(playlist);
        const playable = ids.flatMap((id) => tracks.find((track) => track.id === id && track.status === "ready") ?? []);
        return <article className={styles.panel} key={playlist.id}>
          <div className={styles.playlistArt} aria-hidden="true"><ListMusic /></div>
          <button className={styles.heading} style={{ textAlign: "left", overflowWrap: "anywhere" }} onClick={() => setSelectedId(playlist.id)}>{playlist.title}</button>
          <p className={styles.small}>{ids.length} {ids.length === 1 ? "track" : "tracks"} · {canEdit(playlist) ? "Made by you" : "Shared with you"}</p>
          <div className={styles.actions} style={{ marginTop: 18 }}><button className={styles.button} disabled={!playable.length} onClick={() => onPlay(playable)} aria-label={`Play ${playlist.title}`}><Play size={16} />Play</button><button className={styles.secondary} onClick={() => setSelectedId(playlist.id)}>Open</button>
            {canEdit(playlist) && <button className={styles.iconButton} onClick={() => setSharing(playlist)} aria-label={`Share ${playlist.title}`}><Share2 size={16} /></button>}
          </div>
        </article>;
      })}
    </div>}
    {selected && <div className={styles.panel}>
      <div className={styles.between}><div><p className={styles.eyebrow}>The tracklist</p><h3 className={styles.heading}>{selected.title}</h3></div><div className={styles.actions}>
        {canEdit(selected) && <><button className={styles.secondary} onClick={() => setEditor(selected)}>Edit playlist</button><button className={styles.secondary} onClick={() => setSharing(selected)}><Share2 size={15} aria-hidden="true" />Share</button><button className={styles.iconButton} onClick={() => setDeleting(selected)} aria-label={`Delete ${selected.title}`}><Trash2 size={16} /></button></>}
        <button className={styles.secondary} onClick={() => setSelectedId(null)}>Close tracklist</button>
      </div></div>
      {selectedTracks.length ? <TrackList tracks={selectedTracks} onDetails={onDetails} onPlay={(track) => onPlay(selectedTracks.filter((item) => item.status === "ready"), track)} currentId={currentId} isPlaying={isPlaying} /> : <p className={styles.small}>No playable tracks here yet.{canEdit(selected) ? " Edit this playlist to add songs." : " The owner can grant access to its tracks."}</p>}
    </div>}
    {editor && <PlaylistEditor playlist={editor === "new" ? null : editor} tracks={tracks} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); setNotice("Playlist saved."); void refresh(); }} />}
    {sharing && <PlaylistSharing playlist={playlists.find((item) => item.id === sharing.id) ?? sharing} profile={profile} onClose={() => setSharing(null)} onChanged={() => void refresh()} />}
    {deleting && <Modal title={`Delete “${deleting.title}”?`} busy={busy} onClose={() => setDeleting(null)}><p className={styles.small}>This removes the playlist and its sharing settings. The tracks stay in your library.</p>{error && <p className={styles.error} role="alert">{error}</p>}<div className={styles.dialogFooter}><button className={styles.secondary} disabled={busy} onClick={() => setDeleting(null)}>Keep playlist</button><button className={styles.danger} disabled={busy} onClick={() => void remove()}>{busy ? "Deleting…" : "Delete playlist"}</button></div></Modal>}
  </section>;
}

function PlaylistEditor({ playlist, tracks, onClose, onSaved }: { playlist: PlaylistRow | null; tracks: TrackRow[]; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(playlist?.title ?? "");
  const [ids, setIds] = useState(playlist ? playlistTrackIds(playlist) : [] as string[]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const available = useMemo(() => filterTracks(tracks.filter((track) => track.status === "ready"), query), [tracks, query]);
  function move(index: number, offset: number) { const next = [...ids]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; setIds(next); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!title.trim()) { setError("Give your playlist a name."); return; } setBusy(true); setError("");
    try { await api("/api/playlists", json(playlist ? "PATCH" : "POST", { ...(playlist ? { id: playlist.id, expectedRevision: playlist.revision } : {}), title: title.trim(), trackIds: ids })); onSaved(); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <Modal title={playlist ? "Edit your mixtape" : "A new mixtape"} busy={busy} onClose={onClose}>
    <form className={styles.form} onSubmit={(event) => void save(event)}>
      <label className={styles.label}>Playlist name<input className={styles.input} autoFocus value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} placeholder="For the long way home" disabled={busy} /></label>
      <label className={styles.label}>Find tracks<div className={styles.search}><Search size={17} aria-hidden="true" /><input className={styles.input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, artist or mood" /></div></label>
      <fieldset className={styles.checkList} disabled={busy}><legend className={styles.small}>Add tracks · {ids.length} selected</legend>{available.map((track) => <label className={styles.check} key={track.id}><input type="checkbox" checked={ids.includes(track.id)} onChange={(event) => setIds(event.target.checked ? [...ids, track.id] : ids.filter((id) => id !== track.id))} /><span>{track.title}<span className={styles.small}> · {track.artist}</span></span></label>)}{!available.length && <p className={styles.small}>{query ? "No tracks match this search." : "You can save an empty playlist and add shared tracks later."}</p>}</fieldset>
      {!!ids.length && <div><p className={styles.eyebrow}>Set the order</p><ol className={styles.list}>{ids.map((id, index) => <li key={id} className={styles.between}><span className={styles.small}>{index + 1}. {tracks.find((track) => track.id === id)?.title ?? "Unavailable track"}</span><div className={styles.actions}><button type="button" className={styles.iconButton} disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label={`Move track ${index + 1} up`}><ArrowUp size={14} /></button><button type="button" className={styles.iconButton} disabled={busy || index === ids.length - 1} onClick={() => move(index, 1)} aria-label={`Move track ${index + 1} down`}><ArrowDown size={14} /></button><button type="button" className={styles.iconButton} disabled={busy} onClick={() => setIds(ids.filter((item) => item !== id))} aria-label={`Remove track ${index + 1}`}><Trash2 size={14} /></button></div></li>)}</ol></div>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.dialogFooter}><button type="button" className={styles.secondary} disabled={busy} onClick={onClose}>Cancel</button><button className={styles.button} disabled={busy}>{busy ? "Saving…" : "Save playlist"}</button></div>
    </form>
  </Modal>;
}

function PlaylistSharing({ playlist, profile, onClose, onChanged }: { playlist: PlaylistRow; profile: Profile; onClose: () => void; onChanged: () => void }) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [userId, setUserId] = useState("");
  const [grantTracks, setGrantTracks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!profile.is_admin || !supabase) return;
    let alive = true;
    void supabase.from("profiles").select("id,email,display_name,is_admin,is_active").then(({ data, error: requestError }) => { if (!alive) return; if (requestError) setError(requestError.message); else setUsers((data ?? []) as Profile[]); });
    return () => { alive = false; };
  }, [profile.is_admin]);
  async function share(recipient: string, revoke = false) {
    setBusy(true); setError(""); setNotice("");
    try {
      await api("/api/playlists", json("PATCH", { id: playlist.id, userId: recipient, action: revoke ? "unshare" : "share", grantTracks, expectedRevision: playlist.revision }));
      setNotice(revoke ? "Playlist access removed." : "Playlist shared with this listener."); setUserId(""); onChanged();
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <Modal title={`Share “${playlist.title}”`} busy={busy} onClose={onClose}>
    <p className={styles.small}>Share privately with an invited listener. A link alone never grants access.</p>
    <form className={styles.form} style={{ marginTop: 20 }} onSubmit={(event) => { event.preventDefault(); void share(userId.trim()); }}>
      <label className={styles.label}>{users.length ? "Listener" : "Listener’s account ID"}{users.length ? <select aria-label="Listener" className={styles.select} required value={userId} onChange={(event) => setUserId(event.target.value)} disabled={busy}><option value="">Choose a listener</option>{users.filter((user) => user.id !== profile.id && user.is_active).map((user) => <option key={user.id} value={user.id}>{user.display_name || user.email}</option>)}</select> : <input className={styles.input} value={userId} onChange={(event) => setUserId(event.target.value)} required pattern="[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}" placeholder="Their UUID from My library" disabled={busy} />}</label>
      {profile.is_admin && <label className={styles.check}><input type="checkbox" checked={grantTracks} onChange={(event) => setGrantTracks(event.target.checked)} disabled={busy} />Also grant access to tracks in this playlist</label>}
      <p className={styles.small}>Without track access, a listener may see an empty or partial tracklist.</p>
      <button className={styles.button} disabled={busy || !userId}>{busy ? "Updating…" : "Share playlist"}</button>
    </form>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    {!!playlist.playlist_permissions?.length && <div className={styles.stack} style={{ marginTop: 24 }}><p className={styles.eyebrow}>People with access</p>{playlist.playlist_permissions.map((permission) => <div className={styles.between} key={permission.user_id}><span className={styles.small}>{users.find((user) => user.id === permission.user_id)?.email ?? permission.user_id}</span><button className={styles.secondary} disabled={busy} onClick={() => void share(permission.user_id, true)}>Remove access</button></div>)}</div>}
    <div className={styles.dialogFooter}><button className={styles.secondary} onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/library?playlist=${encodeURIComponent(playlist.id)}`); setNotice("Link copied. Only listeners with access can open it."); } catch { setError("Couldn’t copy the link. Check your browser’s clipboard permission."); } }}><Copy size={15} aria-hidden="true" />Copy library link</button></div>
  </Modal>;
}
