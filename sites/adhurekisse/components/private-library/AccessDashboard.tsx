"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, MailPlus, RefreshCw, ShieldCheck, Users } from "lucide-react";
import type { Profile, TrackRow } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { api, errorMessage, json } from "./api";
import styles from "./private-library.module.css";

interface Invitation { id: string; email: string; code: string; expires_at: string; accepted_at: string | null; accepted_user_id?: string | null; revoked_at?: string | null }
interface Permission { track_id: string; user_id: string; created_at: string }

export default function AccessDashboard({ tracks, ownerId }: { tracks: TrackRow[]; ownerId: string }) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [days, setDays] = useState("14");
  const [trackId, setTrackId] = useState("");
  const [userId, setUserId] = useState("");
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setError("");
    try {
      const [inv, grants, people] = await Promise.all([
        api<{ invitations: Invitation[] }>("/api/invitations", { signal }),
        api<{ permissions: Permission[] }>("/api/permissions", { signal }),
        supabase!.from("profiles").select("id,email,display_name,is_admin,is_active").order("created_at"),
      ]);
      if (people.error) throw people.error;
      if (!signal?.aborted) { setInvitations(inv.invitations); setPermissions(grants.permissions); setUsers((people.data ?? []) as Profile[]); }
    } catch (err) { if (!signal?.aborted) setError(errorMessage(err)); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, [refresh]);

  async function perform(action: () => Promise<unknown>, message: string) {
    if (busy) return; setBusy(true); setError(""); setNotice("");
    try { const result = await action(); setNotice(typeof result === "string" ? result : message); await refresh(); }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  const personName = (id: string) => { const person = users.find((user) => user.id === id); return person?.email || person?.display_name || id; };
  return <section aria-label="Invitations and permissions">
    <div className={styles.toolbar}><div><h2 className={styles.heading}>Good music. Good company.</h2><p className={styles.small}>Everyone can register for solo listening. Choose the private tracks each listener can hear.</p></div><button className={styles.iconButton} aria-label="Refresh access" disabled={busy} onClick={() => void refresh()}><RefreshCw size={16} /></button></div>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    {loading && <p className={styles.small} role="status">Loading invitations and grants…</p>}
    <div className={styles.grid}>
      <div className={styles.panel}><p className={styles.eyebrow}><MailPlus size={15} aria-hidden="true" /> Optional invite</p><h3 className={styles.heading}>Send a sign-in link</h3>
        <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void perform(async () => {
          const result = await api<{ delivery?: string }>("/api/invitations", json("POST", { email: email.trim(), expiresInDays: Number(days) })); setEmail("");
          return result.delivery === "sent" ? "Invitation created and email sent. Your listener can follow its sign-in link." : result.delivery === "existing_account" ? "Invitation created for an existing account. They can sign in with their email." : "Invitation saved; email delivery is pending. Share the sign-in details or try creating a fresh invitation later.";
        }, "Invitation created."); }}>
          <label className={styles.label}>Email address<input className={styles.input} type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="friend@example.com" disabled={busy} /></label>
          <label className={styles.label}>Invitation expires in<select className={styles.select} value={days} onChange={(event) => setDays(event.target.value)} disabled={busy}><option value="1">1 day</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option></select></label>
          <button className={styles.button} disabled={busy || loading}>{busy ? "Updating…" : "Create invitation"}</button>
          <p className={styles.small}>An optional email invitation. Check its delivery status after sending. It does not share your library; track access is managed separately below.</p>
        </form>
      </div>
      <div className={styles.panel}><p className={styles.eyebrow}><ShieldCheck size={15} aria-hidden="true" /> A personal selection</p><h3 className={styles.heading}>Share a track</h3>
        <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void perform(() => api("/api/permissions", json("POST", { trackId, userId })), "Track access granted."); }}>
          <label className={styles.label}>Track<select className={styles.select} required value={trackId} onChange={(event) => setTrackId(event.target.value)} disabled={busy}><option value="">Choose a ready track</option>{tracks.filter((track) => track.status === "ready").map((track) => <option key={track.id} value={track.id}>{track.title} — {track.artist}</option>)}</select></label>
          <label className={styles.label}>Listener<select className={styles.select} required value={userId} onChange={(event) => setUserId(event.target.value)} disabled={busy}><option value="">Choose a listener</option>{users.filter((user) => !user.is_admin && user.is_active).map((user) => <option key={user.id} value={user.id}>{user.display_name || user.email} · {user.email}</option>)}</select></label>
          <button className={styles.button} disabled={busy || !trackId || !userId}>Grant access</button>
          <p className={styles.small}>A listener appears after they confirm their account and sign in. You can also share a whole selection from Playlists in your library.</p>
        </form>
      </div>
    </div>
    <div className={styles.panel}><h3 className={styles.heading}>Sign-in links</h3>{!invitations.length && !loading && <p className={styles.small}>No direct sign-in links yet. Listeners can register themselves at /login.</p>}
      <ul className={styles.list}>{invitations.map((invitation) => {
        const expired = Date.parse(invitation.expires_at) <= Date.now();
        const status = invitation.revoked_at ? "Revoked" : invitation.accepted_at ? "Accepted" : expired ? "Expired" : "Pending";
        const timestamp = invitation.revoked_at || invitation.accepted_at || invitation.expires_at;
        const dateLabel = invitation.revoked_at ? "Revoked" : invitation.accepted_at ? "Accepted" : expired ? "Expired" : "Expires";
        const acceptedUser = users.find((user) => user.id === invitation.accepted_user_id);
        return <li className={styles.track} key={invitation.id}><div className={styles.trackBody}><p className={styles.trackTitle}>{invitation.email}</p><p className={styles.small}>{status} · {dateLabel} {new Date(timestamp).toLocaleDateString()}</p>{status === "Pending" && <p className={styles.small}>Invitation code: <strong>{invitation.code}</strong></p>}</div><div className={styles.actions}>
          {status === "Pending" && <button className={styles.iconButton} aria-label={`Copy invitation for ${invitation.email}`} onClick={async () => { try { await navigator.clipboard.writeText(`You’re invited to adhurekisse. Sign in with ${invitation.email} at ${window.location.origin}/login. Invitation reference: ${invitation.code}`); setNotice("Invitation details copied."); } catch { setError("Could not copy. You can select the invitation details and copy them manually."); } }}><Copy size={15} /></button>}
          {!invitation.revoked_at && invitation.accepted_user_id !== ownerId && !acceptedUser?.is_admin && <button className={styles.secondary} disabled={busy} onClick={() => void perform(() => api(`/api/invitations?id=${encodeURIComponent(invitation.id)}`, { method: "DELETE" }), invitation.accepted_at ? "Invitation revoked. Room access tied to this invitation has been removed." : "Invitation revoked.")}>{invitation.accepted_at ? "Revoke room access" : "Revoke invitation"}</button>}
        </div></li>;
      })}</ul>
    </div>
    <div className={styles.panel}><h3 className={styles.heading}>Track access</h3><p className={styles.small}>Remove a direct grant when you no longer want to share a track.</p>{!permissions.length && !loading && <p className={styles.small}>No individual track grants yet.</p>}
      <ul className={styles.list}>{permissions.map((permission) => <li className={styles.track} key={`${permission.track_id}-${permission.user_id}`}><div className={styles.trackBody}><p className={styles.trackTitle}>{tracks.find((track) => track.id === permission.track_id)?.title ?? "Unavailable track"}</p><p className={styles.small}>{personName(permission.user_id)}</p></div><button className={styles.secondary} disabled={busy} onClick={() => void perform(() => api(`/api/permissions?trackId=${encodeURIComponent(permission.track_id)}&userId=${encodeURIComponent(permission.user_id)}`, { method: "DELETE" }), "Track access revoked.")}>Remove access</button></li>)}</ul>
    </div>
    <details className={styles.panel}><summary className={styles.small}><Users size={14} aria-hidden="true" /> People in this room · {users.length}</summary><ul className={styles.list}>{users.map((user) => <li key={user.id} className={styles.track}><div className={styles.trackBody}><p className={styles.trackTitle}>{user.display_name || user.email}</p><p className={styles.small}>{user.email}</p></div><span className={styles.badge}>{!user.is_active ? "Inactive" : user.is_admin ? "Owner" : "Listener"}</span></li>)}</ul></details>
  </section>;
}
