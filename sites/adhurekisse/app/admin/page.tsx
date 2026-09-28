"use client";

// ─────────────────────────────────────────────────────────────────────────────
// /admin — library owner dashboard.
//  • Uploads: multi-file, drag-and-drop, XHR progress, cancel + retry,
//    client-side duration extraction, duplicate detection, artwork.
//  • Library: every track with status; edit metadata; delete (removes R2
//    objects through the API).
//  • Access: invitations + per-user track grants.
// Everything privileged goes through /api/* with the caller's bearer token;
// this page holds no credentials itself.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { UploadCloud, Trash2, RefreshCw, X, Check } from "lucide-react";

import { supabase } from "../../lib/supabase";
import { authedFetch, type Profile, type TrackRow } from "../../lib/auth";

// ── types ────────────────────────────────────────────────────────────────────

type UploadStatus = "queued" | "creating" | "uploading" | "finalizing" | "ready" | "error" | "cancelled" | "duplicate";

interface UploadJob {
  id: string;
  file: File;
  title: string;
  artist: string;
  album: string;
  movie: string;
  year: string;
  durationSeconds: number | null;
  progress: number;
  status: UploadStatus;
  message: string;
  trackId?: string;
  xhr?: XMLHttpRequest;
  artworkFile?: File | null;
}

interface InvitationRow {
  id: string;
  email: string;
  code: string;
  expires_at: string;
  accepted_at: string | null;
}

interface ProfileRow {
  id: string;
  email: string;
  display_name: string;
  is_admin: boolean;
}

const AUDIO_ACCEPT = "audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/ogg,audio/wav,audio/x-wav,audio/flac,audio/x-flac,.mp3,.m4a,.aac,.ogg,.wav,.flac";

function guessTitle(file: File): string {
  return file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}

/** Extract duration client-side via a throwaway audio element. */
function probeDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null);
    audio.onerror = () => done(null);
    audio.src = url;
    setTimeout(() => done(null), 8000);
  });
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authState, setAuthState] = useState<"loading" | "guest" | "member" | "admin">("loading");
  const [tab, setTab] = useState<"uploads" | "library" | "access">("uploads");

  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [tracks, setTracks] = useState<TrackRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [grantTrackId, setGrantTrackId] = useState<string>("");
  const [grantUserId, setGrantUserId] = useState<string>("");
  const [notice, setNotice] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // auth gate
  useEffect(() => {
    if (!supabase) {
      setAuthState("guest");
      return;
    }
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      const { data: p } = await supabase
        .from("profiles")
        .select("id, email, display_name, is_admin")
        .eq("id", session.user.id)
        .single();
      if (p) {
        setProfile(p as Profile);
        setAuthState(p.is_admin ? "admin" : "member");
      } else {
        setAuthState("guest");
      }
    })();
  }, [router]);

  const refreshLibrary = useCallback(async () => {
    const res = await authedFetch("/api/tracks");
    if (res.ok) {
      const body = (await res.json()) as { tracks: TrackRow[] };
      setTracks(body.tracks);
    }
  }, []);

  const refreshAccess = useCallback(async () => {
    const [invRes, usersRes] = await Promise.all([
      authedFetch("/api/invitations"),
      supabase!.from("profiles").select("id, email, display_name, is_admin").order("created_at"),
    ]);
    if (invRes.ok) {
      const body = (await invRes.json()) as { invitations: InvitationRow[] };
      setInvitations(body.invitations);
    }
    if (!usersRes.error) setUsers((usersRes.data as ProfileRow[]) ?? []);
  }, []);

  useEffect(() => {
    if (authState !== "admin") return;
    void refreshLibrary();
    void refreshAccess();
  }, [authState, refreshLibrary, refreshAccess]);

  // ── upload pipeline ────────────────────────────────────────────────────────

  const patchJob = useCallback((id: string, patch: Partial<UploadJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);

  const uploadOne = useCallback(
    async (job: UploadJob) => {
      patchJob(job.id, { status: "creating", message: "", progress: 0 });
      try {
        // 1. create track record + presigned upload
        const createRes = await authedFetch("/api/tracks", {
          method: "POST",
          body: JSON.stringify({
            title: job.title,
            artist: job.artist || "Unknown artist",
            album: job.album || undefined,
            movie: job.movie || undefined,
            year: job.year || undefined,
            mimeType: job.file.type || guessMime(job.file.name),
          }),
        });

        if (createRes.status === 409) {
          const body = (await createRes.json()) as { duplicateOf?: { title: string } };
          patchJob(job.id, {
            status: "duplicate",
            message: `Already in the library as “${body.duplicateOf?.title ?? job.title}”.`,
          });
          return;
        }
        if (!createRes.ok) {
          const body = (await createRes.json().catch(() => ({}))) as { error?: string };
          patchJob(job.id, { status: "error", message: body.error ?? "Upload rejected." });
          return;
        }

        const { track, upload } = (await createRes.json()) as {
          track: TrackRow;
          upload: { url: string; headers: Record<string, string> };
        };
        patchJob(job.id, { trackId: track.id, status: "uploading" });

        // 2. stream the file straight to R2 via XHR (gives progress + cancel)
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          patchJob(job.id, { xhr });
          xhr.open("PUT", upload.url);
          for (const [k, v] of Object.entries(upload.headers)) xhr.setRequestHeader(k, v);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              patchJob(job.id, { progress: Math.round((e.loaded / e.total) * 100) });
            }
          };
          xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage rejected the upload (${xhr.status}).`)));
          xhr.onerror = () => reject(new Error("Network error during upload."));
          xhr.onabort = () => reject(Object.assign(new Error("Cancelled."), { cancelled: true }));
          xhr.send(job.file);
        });

        patchJob(job.id, { status: "finalizing", progress: 100 });

        // 3. artwork, if supplied
        if (job.artworkFile) {
          try {
            const artRes = await authedFetch(`/api/tracks/${track.id}/upload-url`, {
              method: "POST",
              body: JSON.stringify({ kind: "artwork", mimeType: job.artworkFile.type }),
            });
            if (artRes.ok) {
              const { upload: artUpload } = (await artRes.json()) as {
                upload: { url: string; headers: Record<string, string> };
              };
              await fetch(artUpload.url, {
                method: "PUT",
                headers: artUpload.headers,
                body: job.artworkFile,
              });
              await authedFetch(`/api/tracks/${track.id}/finalize`, {
                method: "POST",
                body: JSON.stringify({ kind: "artwork" }),
              });
            }
          } catch {
            patchJob(job.id, { message: "Uploaded, but artwork failed — add it from the library tab." });
          }
        }

        // 4. finalize (server HEADs the object, marks ready)
        const finalizeRes = await authedFetch(`/api/tracks/${track.id}/finalize`, {
          method: "POST",
          body: JSON.stringify({ kind: "audio", durationSeconds: job.durationSeconds }),
        });
        if (!finalizeRes.ok) {
          const body = (await finalizeRes.json().catch(() => ({}))) as { error?: string };
          patchJob(job.id, { status: "error", message: body.error ?? "Finalization failed — retry from the library tab." });
          return;
        }
        patchJob(job.id, { status: "ready", message: "" });
        void refreshLibrary();
      } catch (err) {
        if ((err as { cancelled?: boolean }).cancelled) {
          patchJob(job.id, { status: "cancelled", message: "Cancelled." });
          // clean up the pending track row so duplicates don't accumulate
          if (job.trackId) {
            await authedFetch(`/api/tracks/${job.trackId}`, { method: "DELETE" }).catch(() => {});
          }
        } else {
          patchJob(job.id, {
            status: "error",
            message: err instanceof Error ? err.message : "Upload failed.",
          });
        }
      }
    },
    [patchJob, refreshLibrary],
  );

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter(
        (f) => f.type.startsWith("audio/") || /\.(mp3|m4a|aac|ogg|wav|flac)$/i.test(f.name),
      );
      if (list.length === 0) {
        setPageError("No supported audio files (MP3, M4A/AAC, OGG, WAV, FLAC).");
        return;
      }
      const newJobs: UploadJob[] = list.map((file, i) => ({
        id: `${Date.now()}-${i}`,
        file,
        title: guessTitle(file),
        artist: "",
        album: "",
        movie: "",
        year: "",
        durationSeconds: null,
        progress: 0,
        status: "queued",
        message: "",
        artworkFile: null,
      }));
      setJobs((prev) => [...prev, ...newJobs]);
      // probe durations in the background
      for (const job of newJobs) {
        void probeDuration(job.file).then((d) => patchJob(job.id, { durationSeconds: d }));
      }
      // start uploads sequentially to keep mobile radios calm
      for (const job of newJobs) {
        // eslint-disable-next-line no-await-in-loop
        await uploadOne(job);
      }
    },
    [patchJob, uploadOne],
  );

  function cancelJob(job: UploadJob) {
    job.xhr?.abort();
    if (job.status === "queued" || job.status === "creating") {
      patchJob(job.id, { status: "cancelled", message: "Cancelled." });
    }
  }

  async function retryJob(job: UploadJob) {
    if (job.trackId) {
      await authedFetch(`/api/tracks/${job.trackId}`, { method: "DELETE" }).catch(() => {});
    }
    patchJob(job.id, { trackId: undefined, status: "queued", message: "", progress: 0 });
    void uploadOne({ ...job, status: "queued", progress: 0, message: "", trackId: undefined });
  }

  // ── access actions ─────────────────────────────────────────────────────────

  async function createInvitation() {
    setNotice(null);
    const res = await authedFetch("/api/invitations", {
      method: "POST",
      body: JSON.stringify({ email: inviteEmail.trim() }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setPageError(body.error ?? "Could not create the invitation.");
      return;
    }
    setInviteEmail("");
    setNotice("Invitation created — share its code with your invitee.");
    void refreshAccess();
  }

  async function revokeInvitation(id: string) {
    await authedFetch(`/api/invitations?id=${id}`, { method: "DELETE" });
    void refreshAccess();
  }

  async function grant() {
    setNotice(null);
    if (!grantTrackId || !grantUserId) return;
    const res = await authedFetch("/api/permissions", {
      method: "POST",
      body: JSON.stringify({ trackId: grantTrackId, userId: grantUserId }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setPageError(body.error ?? "Grant failed.");
      return;
    }
    setNotice("Access granted.");
  }

  // ── guards ─────────────────────────────────────────────────────────────────

  if (authState === "loading") {
    return <main style={pageWrap}><p style={dim}>CHECKING YOUR KEY…</p></main>;
  }
  if (authState !== "admin") {
    return (
      <main style={pageWrap}>
        <h1 style={{ fontSize: 20 }}>Library owner area</h1>
        <p style={dim}>
          This dashboard is only for the room&apos;s owner.{" "}
          <Link href="/" style={{ color: "var(--ta, #c9a560)" }}>Back to the music room →</Link>
        </p>
      </main>
    );
  }

  return (
    <main style={{ ...pageWrap, maxWidth: 760 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ fontSize: 20, margin: 0, letterSpacing: "0.1em" }}>OWNER DASHBOARD</h1>
        <Link href="/" style={{ fontSize: 12, color: "var(--ta, #c9a560)" }}>← music room</Link>
      </header>

      <nav style={{ display: "flex", gap: 8, margin: "18px 0" }} aria-label="Dashboard sections">
        {(["uploads", "library", "access"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? "var(--ta, #c9a560)" : "none",
              color: tab === t ? "#0a0a0a" : "inherit",
              border: "1px solid var(--ta, #c9a560)",
              borderRadius: 999,
              padding: "6px 16px",
              fontSize: 11,
              letterSpacing: "0.14em",
              cursor: "pointer",
            }}
            aria-current={tab === t ? "page" : undefined}
          >
            {t.toUpperCase()}
          </button>
        ))}
      </nav>

      {notice && <p style={{ fontSize: 12, color: "var(--ta, #c9a560)" }}>{notice}</p>}
      {pageError && <p role="alert" style={{ fontSize: 12, color: "#e08a7a" }}>{pageError}</p>}

      {/* ── UPLOADS ─────────────────────────────────────────────────────────── */}
      {tab === "uploads" && (
        <section aria-label="Upload audio files">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void addFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
            aria-label="Drop audio files here or browse"
            style={{
              border: `1.5px dashed ${dragOver ? "var(--ta, #c9a560)" : "var(--tb, rgba(255,255,255,0.18))"}`,
              borderRadius: 14,
              padding: "34px 20px",
              textAlign: "center",
              cursor: "pointer",
              display: "grid", placeItems: "center", gap: 8,
            }}
          >
            <UploadCloud size={26} style={{ opacity: 0.7 }} aria-hidden />
            <p style={{ margin: 0, fontSize: 13 }}>Drop audio files or tap to browse</p>
            <p style={{ margin: 0, fontSize: 11, opacity: 0.5 }}>MP3 · M4A/AAC · OGG · WAV · FLAC — up to 200 MB each</p>
            <input
              ref={fileInputRef}
              type="file"
              accept={AUDIO_ACCEPT}
              multiple
              hidden
              onChange={(e) => e.target.files && void addFiles(e.target.files)}
            />
          </div>

          {jobs.length === 0 ? (
            <p style={{ ...dim, marginTop: 18 }}>
              Your library is waiting. Files upload directly to private storage —
              nothing is stored on the website server.
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, marginTop: 16, display: "grid", gap: 10 }}>
              {jobs.map((job) => (
                <li key={job.id} style={jobCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <input
                      value={job.title}
                      onChange={(e) => patchJob(job.id, { title: e.target.value })}
                      aria-label="Title"
                      style={rowInput}
                    />
                    <span style={{ fontSize: 10, letterSpacing: "0.1em", opacity: job.status === "ready" ? 1 : 0.6, color: job.status === "error" ? "#e08a7a" : "var(--ta, #c9a560)", whiteSpace: "nowrap" }}>
                      {job.status.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    <input value={job.artist} onChange={(e) => patchJob(job.id, { artist: e.target.value })} placeholder="Artist" aria-label="Artist" style={rowInput} />
                    <input value={job.album} onChange={(e) => patchJob(job.id, { album: e.target.value })} placeholder="Album" aria-label="Album" style={rowInput} />
                    <input value={job.year} onChange={(e) => patchJob(job.id, { year: e.target.value })} placeholder="Year" aria-label="Year" style={{ ...rowInput, maxWidth: 70 }} />
                  </div>
                  {(job.status === "queued" || job.status === "creating" || job.status === "uploading" || job.status === "finalizing") && (
                    <>
                      <div style={progressTrack} role="progressbar" aria-valuenow={job.progress} aria-valuemin={0} aria-valuemax={100}>
                        <div style={{ ...progressFill, width: `${job.status === "uploading" ? job.progress : job.status === "finalizing" ? 100 : 4}%` }} />
                      </div>
                      <button style={miniAction} onClick={() => cancelJob(job)} aria-label="Cancel upload">
                        <X size={12} /> CANCEL
                      </button>
                    </>
                  )}
                  {job.message && <p style={{ fontSize: 11, opacity: 0.65, margin: "6px 0 0" }}>{job.message}</p>}
                  {(job.status === "error" || job.status === "cancelled") && (
                    <button style={miniAction} onClick={() => void retryJob(job)}>
                      <RefreshCw size={12} /> RETRY
                    </button>
                  )}
                  {job.status === "ready" && (
                    <p style={{ fontSize: 11, color: "var(--ta, #c9a560)", margin: "6px 0 0", display: "flex", alignItems: "center", gap: 4 }}>
                      <Check size={12} /> Verified in storage{job.durationSeconds ? ` · ${Math.round(job.durationSeconds)}s` : ""}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── LIBRARY ─────────────────────────────────────────────────────────── */}
      {tab === "library" && (
        <section aria-label="Track library">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <p style={dim}>{tracks.length} tracks</p>
            <button style={miniAction} onClick={() => void refreshLibrary()}>
              <RefreshCw size={12} /> REFRESH
            </button>
          </div>
          {tracks.length === 0 ? (
            <p style={dim}>Nothing uploaded yet — the bucket is empty and that&apos;s fine.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
              {tracks.map((t) => (
                <li key={t.id} style={{ ...jobCard, display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {t.title} <span style={{ opacity: 0.5, fontSize: 12 }}>— {t.artist}</span>
                    </p>
                    <p style={{ margin: 0, fontSize: 11, opacity: 0.5 }}>
                      {t.status}{t.duration_seconds ? ` · ${Math.round(t.duration_seconds)}s` : ""}{t.size_bytes ? ` · ${(t.size_bytes / 1024 / 1024).toFixed(1)} MB` : ""}
                    </p>
                  </div>
                  <button
                    style={{ ...miniAction, color: "#e08a7a", borderColor: "rgba(224,138,122,0.4)" }}
                    onClick={async () => {
                      if (!confirm(`Delete “${t.title}” and its audio file?`)) return;
                      await authedFetch(`/api/tracks/${t.id}`, { method: "DELETE" });
                      void refreshLibrary();
                    }}
                    aria-label={`Delete ${t.title}`}
                  >
                    <Trash2 size={12} /> DELETE
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── ACCESS ──────────────────────────────────────────────────────────── */}
      {tab === "access" && (
        <section aria-label="Invitations and permissions">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={jobCard}>
            <p style={sectionLabel}>INVITE A FRIEND</p>
            <form
              style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
              onSubmit={(e) => { e.preventDefault(); void createInvitation(); }}
            >
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="friend@example.com"
                aria-label="Invitee email"
                style={{ ...rowInput, flex: 1, minWidth: 200 }}
              />
              <button type="submit" style={cta}>CREATE INVITATION</button>
            </form>
            <ul style={{ listStyle: "none", padding: 0, marginTop: 10, display: "grid", gap: 6 }}>
              {invitations.map((inv) => (
                <li key={inv.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, alignItems: "center" }}>
                  <span>
                    {inv.email} · code <strong style={{ letterSpacing: "0.12em" }}>{inv.code}</strong>
                    <span style={{ opacity: 0.5 }}> · {inv.accepted_at ? "accepted" : `expires ${new Date(inv.expires_at).toLocaleDateString()}`}</span>
                  </span>
                  {!inv.accepted_at && (
                    <button style={miniAction} onClick={() => void revokeInvitation(inv.id)}>REVOKE</button>
                  )}
                </li>
              ))}
            </ul>
            <p style={{ fontSize: 10.5, opacity: 0.45, marginTop: 10 }}>
              An invitation only lets someone sign in. Grant them specific tracks below —
              joining a jam shares exactly one track at a time.
            </p>
          </motion.div>

          <div style={jobCard}>
            <p style={sectionLabel}>GRANT TRACK ACCESS</p>
            <div style={{ display: "grid", gap: 8 }}>
              <select value={grantTrackId} onChange={(e) => setGrantTrackId(e.target.value)} aria-label="Track" style={rowInput}>
                <option value="">— choose a track —</option>
                {tracks.map((t) => <option key={t.id} value={t.id}>{t.title} — {t.artist}</option>)}
              </select>
              <select value={grantUserId} onChange={(e) => setGrantUserId(e.target.value)} aria-label="User" style={rowInput}>
                <option value="">— choose a person —</option>
                {users.filter((u) => !u.is_admin).map((u) => <option key={u.id} value={u.id}>{u.display_name || u.email}</option>)}
              </select>
              <button style={cta} onClick={() => void grant()} disabled={!grantTrackId || !grantUserId}>
                GRANT ACCESS
              </button>
            </div>
          </div>

          <div style={jobCard}>
            <p style={sectionLabel}>PEOPLE</p>
            {users.map((u) => (
              <p key={u.id} style={{ fontSize: 12.5, margin: "4px 0" }}>
                {u.display_name || u.email}{u.is_admin ? " · owner" : ""}
              </p>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function guessMime(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac",
    ogg: "audio/ogg", wav: "audio/wav", flac: "audio/flac",
  };
  return map[ext] ?? "audio/mpeg";
}

const pageWrap: React.CSSProperties = {
  minHeight: "100dvh", padding: "28px 18px", maxWidth: 640, margin: "0 auto",
  fontFamily: "inherit",
};
const dim: React.CSSProperties = { fontSize: 12, opacity: 0.55, letterSpacing: "0.06em" };
const jobCard: React.CSSProperties = {
  border: "1px solid var(--tb, rgba(255,255,255,0.1))",
  borderRadius: 12, padding: "12px 14px",
};
const sectionLabel: React.CSSProperties = { fontSize: 10, letterSpacing: "0.18em", opacity: 0.55, margin: "0 0 8px" };
const rowInput: React.CSSProperties = {
  background: "rgba(0,0,0,0.25)", border: "1px solid var(--tb, rgba(255,255,255,0.12))",
  color: "inherit", borderRadius: 8, padding: "8px 10px", fontSize: 13, minWidth: 0,
};
const miniAction: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5,
  background: "none", border: "1px solid var(--tb, rgba(255,255,255,0.2))",
  color: "inherit", borderRadius: 999, padding: "5px 12px",
  fontSize: 10.5, letterSpacing: "0.08em", cursor: "pointer", marginTop: 8,
};
const cta: React.CSSProperties = {
  background: "var(--ta, #c9a560)", color: "#0a0a0a", border: "none",
  borderRadius: 8, padding: "10px 16px", fontWeight: 600,
  fontSize: 12, letterSpacing: "0.08em", cursor: "pointer",
};
const progressTrack: React.CSSProperties = {
  height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2, marginTop: 10, overflow: "hidden",
};
const progressFill: React.CSSProperties = {
  height: "100%", background: "var(--ta, #c9a560)", transition: "width 0.2s ease",
};
