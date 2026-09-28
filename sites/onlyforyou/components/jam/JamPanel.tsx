"use client";

// ─────────────────────────────────────────────────────────────────────────────
// JamPanel — create/join/active-room UI for the two-person shared session.
// Rendered as an overlay from MusicRoom. Uses the same cinematic theme vars.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Users, Copy, Check, X, LogOut, DoorOpen, Moon, Send, Radio } from "lucide-react";

import type { JamUiState } from "../../lib/jam/JamSession";
import type { JamPhase, JamActions } from "../../lib/jam/useJam";

interface Props {
  open: boolean;
  onClose: () => void;
  phase: JamPhase;
  jamState: JamUiState | null;
  joinError: string | null;
  actions: JamActions;
  /** Title of the track currently loaded in the local player (for display) */
  currentTrackTitle?: string;
  /** Id of the track the room is currently sharing, for highlighting */
  currentRoomTrackId?: string | null;
  /** Private-library tracks available to add to the shared queue */
  libraryTracks?: { index: number; trackId: string; title: string; artist: string }[];
}

const REACTIONS = ["❤️", "✨", "🥲", "🌙", "🔥", "🎶"];
const SLEEP_OPTIONS = [
  { label: "15 min", ms: 15 * 60_000 },
  { label: "30 min", ms: 30 * 60_000 },
  { label: "60 min", ms: 60 * 60_000 },
];

function statusLabel(status: string): string {
  switch (status) {
    case "listening": return "listening";
    case "buffering": return "buffering…";
    case "ready": return "ready";
    case "reconnecting": return "reconnecting…";
    case "disconnected": return "disconnected";
    case "joining": return "joining…";
    case "left": return "left";
    default: return status;
  }
}

function fmtRemaining(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function JamPanel({
  open, onClose, phase, jamState, joinError, actions, currentTrackTitle, libraryTracks = [],
}: Props) {
  const [joinCode, setJoinCode] = useState("");
  const [collab, setCollab] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [queuePick, setQueuePick] = useState("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [jamState?.chat.length]);

  if (!open) return null;

  const room = jamState?.room ?? null;
  const inviteLink = room && typeof window !== "undefined"
    ? `${window.location.origin}/?jam=${room.code}`
    : "";

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function copyInvite() {
    if (!inviteLink) return;
    void navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  // ── Active room view ───────────────────────────────────────────────────────
  if (room && (phase === "active" || phase === "ended")) {
    const iAmHost = jamState?.myRole === "host";
    const canControl = jamState?.canControl ?? false;
    const playing = jamState?.state?.playbackState === "playing";
    const loading = jamState?.state?.playbackState === "idle";
    const sleepEndsAt = jamState?.sleepEndsAt ?? null;

    return (
      <motion.div
        className="jam-panel-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        style={{
          position: "fixed", inset: 0, zIndex: 90,
          background: "rgba(5,4,3,0.82)", backdropFilter: "blur(10px)",
          display: "grid", placeItems: "center", padding: "16px",
        }}
        role="dialog"
        aria-label="Jam together"
      >
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          style={{
            width: "min(560px, 100%)", maxHeight: "min(86dvh, 720px)",
            overflowY: "auto",
            background: "var(--tsf, rgba(20,17,14,0.92))",
            border: "1px solid var(--tb, rgba(255,255,255,0.1))",
            borderRadius: 18, padding: "22px 20px",
          }}
        >
          {/* header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Radio size={16} style={{ color: "var(--ta, #c9a560)" }} aria-hidden />
              <h2 style={{ fontSize: 15, letterSpacing: "0.14em", margin: 0 }}>JAM TOGETHER</h2>
            </div>
            <button onClick={onClose} aria-label="Close jam panel" style={iconBtn}>
              <X size={17} strokeWidth={1.5} />
            </button>
          </div>

          {/* room code + invite */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div>
                <p style={label}>ROOM CODE</p>
                <p style={{ fontSize: 26, letterSpacing: "0.3em", fontFamily: "var(--font-mono, monospace)", margin: "2px 0 0" }}>
                  {room.code}
                </p>
              </div>
              <button onClick={copyInvite} style={pillBtn} aria-label="Copy invite link">
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "COPIED" : "INVITE LINK"}
              </button>
            </div>
          </div>

          {/* participants + connection */}
          <div style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={label}>
              LISTENERS · {jamState?.connection === "online" ? "LIVE" : jamState?.connection === "reconnecting" ? "RECONNECTING…" : jamState?.connection === "ended" ? "ENDED" : "CONNECTING…"}
            </p>
            {jamState?.participants.map((p) => (
              <div key={p.userId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 13 }}>
                  <span style={{ opacity: p.connected ? 1 : 0.45 }}>{p.connected ? "●" : "○"}</span>{" "}
                  {p.displayName}{p.userId === room.hostId ? " · host" : ""}
                </span>
                <span style={{ fontSize: 11, opacity: 0.6, letterSpacing: "0.06em" }}>
                  {statusLabel(p.status)}
                </span>
              </div>
            ))}
            {jamState?.clock && (
              <p style={{ fontSize: 10, opacity: 0.4, margin: 0 }}>
                sync offset {Math.round(jamState.clock.offsetMs)} ms · rtt {Math.round(jamState.clock.rttMs)} ms
              </p>
            )}
          </div>

          {/* transport */}
          <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <p style={label}>NOW SHARING</p>
              <p style={{ fontSize: 14, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 260 }}>
                {loading ? "preparing…" : currentTrackTitle ?? "—"}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                style={{ ...pillBtn, opacity: canControl ? 1 : 0.4, cursor: canControl ? "pointer" : "not-allowed" }}
                disabled={!canControl || busy || loading}
                onClick={() => void run(playing ? actions.pause : actions.play)}
                aria-label={playing ? "Pause for both" : "Play for both"}
              >
                {playing ? "PAUSE" : "PLAY"}
              </button>
              {iAmHost && phase === "active" && (
                <button style={{ ...pillBtn, borderColor: "rgba(224,138,122,0.5)" }} onClick={() => void run(actions.end)} aria-label="End room">
                  <DoorOpen size={14} /> END
                </button>
              )}
              {!iAmHost && (
                <button style={{ ...pillBtn }} onClick={() => void run(actions.leave)} aria-label="Leave room">
                  <LogOut size={14} /> LEAVE
                </button>
              )}
            </div>
          </div>

          {phase === "ended" && (
            <p style={{ fontSize: 12, color: "var(--ta, #c9a560)", margin: "10px 0" }}>
              This room has ended. You can close the panel and keep listening solo.
            </p>
          )}
          {!canControl && phase === "active" && (
            <p style={{ fontSize: 11, opacity: 0.55, margin: "6px 0" }}>
              The host controls playback here — you can suggest tracks below.
            </p>
          )}

          {/* collaborative toggle (host) */}
          {iAmHost && phase === "active" && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, margin: "10px 2px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={room.collaborative}
                onChange={(e) => void run(() => actions.setCollaborative(e.target.checked))}
              />
              Let the guest control playback too
            </label>
          )}

          {/* queue */}
          <div style={card}>
            <p style={label}>SHARED QUEUE {jamState?.queue.length ? `(${jamState.queue.length})` : ""}</p>
            {jamState?.queue.length === 0 && (
              <p style={{ fontSize: 12, opacity: 0.5, margin: "4px 0" }}>
                Empty — add private tracks below.
              </p>
            )}
            {jamState?.queue.map((item, i) => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                <span style={{ fontSize: 11, opacity: 0.5, fontFamily: "var(--font-mono, monospace)" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span style={{ fontSize: 13, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.title}
                </span>
                {canControl && (
                  <button
                    style={miniBtn}
                    onClick={() => void run(() => actions.playQueueItem(item.id))}
                    aria-label={`Play ${item.title}`}
                  >
                    ▶
                  </button>
                )}
                {canControl && (
                  <button
                    style={miniBtn}
                    onClick={() => void run(() => actions.removeFromQueue(item.id))}
                    aria-label={`Remove ${item.title} from queue`}
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            ))}

            {/* add / suggest from the private library */}
            {libraryTracks.length > 0 && phase === "active" && (
              <form
                style={{ display: "flex", gap: 6, marginTop: 8 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  const pick = libraryTracks.find((t) => String(t.index) === queuePick);
                  if (!pick) return;
                  void run(() =>
                    canControl ? actions.addToQueue(pick.index) : actions.suggestTrack(pick.index),
                  );
                  setQueuePick("");
                }}
              >
                <select
                  value={queuePick}
                  onChange={(e) => setQueuePick(e.target.value)}
                  aria-label="Choose a track for the queue"
                  style={{ ...textInput, flex: 1, minWidth: 0, fontSize: 12.5 }}
                >
                  <option value="">{canControl ? "— add a track —" : "— suggest a track —"}</option>
                  {libraryTracks.map((t) => (
                    <option key={t.trackId} value={String(t.index)}>
                      {t.title} — {t.artist}
                    </option>
                  ))}
                </select>
                <button type="submit" style={miniPill} disabled={!queuePick}>
                  {canControl ? "ADD" : "SUGGEST"}
                </button>
              </form>
            )}
          </div>

          {/* sleep timer */}
          <div style={{ ...card, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <p style={{ ...label, margin: 0 }}><Moon size={11} style={{ verticalAlign: "-1px" }} /> SLEEP TIMER (ONLY YOU)</p>
            {sleepEndsAt ? (
              <button style={pillBtn} onClick={actions.cancelSleepTimer}>
                CANCEL · <SleepCountdown endsAt={sleepEndsAt} />
              </button>
            ) : (
              SLEEP_OPTIONS.map((o) => (
                <button key={o.label} style={miniPill} onClick={() => actions.startSleepTimer(o.ms)}>
                  {o.label}
                </button>
              ))
            )}
          </div>

          {/* reactions */}
          <div style={{ display: "flex", gap: 6, margin: "12px 0 4px" }}>
            {REACTIONS.map((emoji) => (
              <button key={emoji} style={{ ...miniPill, fontSize: 16, padding: "4px 8px" }} onClick={() => actions.sendReaction(emoji)} aria-label={`React ${emoji}`}>
                {emoji}
              </button>
            ))}
          </div>

          {/* chat */}
          <div style={card}>
            <p style={label}>ROOM CHAT</p>
            <div style={{ maxHeight: 130, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
              {jamState?.chat.length === 0 && (
                <p style={{ fontSize: 12, opacity: 0.5, margin: 0 }}>Say something to the room…</p>
              )}
              {jamState?.chat.map((m) => (
                <p key={m.id} style={{ fontSize: 12.5, margin: 0, overflowWrap: "anywhere" }}>
                  <span style={{ opacity: 0.55 }}>{m.name}:</span> {m.text}
                </p>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form
              style={{ display: "flex", gap: 6 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (!chatDraft.trim()) return;
                actions.sendChat(chatDraft);
                setChatDraft("");
              }}
            >
              <input
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value.slice(0, 280))}
                placeholder="Message (280 max)"
                aria-label="Chat message"
                maxLength={280}
                style={{ ...textInput, flex: 1 }}
              />
              <button type="submit" style={miniPill} aria-label="Send message">
                <Send size={13} />
              </button>
            </form>
          </div>

          {error && <p role="alert" style={{ fontSize: 12, color: "#e08a7a" }}>{error}</p>}
        </motion.div>
      </motion.div>
    );
  }

  // ── Idle: create or join ───────────────────────────────────────────────────
  return (
    <motion.div
      className="jam-panel-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        position: "fixed", inset: 0, zIndex: 90,
        background: "rgba(5,4,3,0.82)", backdropFilter: "blur(10px)",
        display: "grid", placeItems: "center", padding: "16px",
      }}
      role="dialog"
      aria-label="Jam together"
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        style={{
          width: "min(420px, 100%)",
          background: "var(--tsf, rgba(20,17,14,0.92))",
          border: "1px solid var(--tb, rgba(255,255,255,0.1))",
          borderRadius: 18, padding: "26px 24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h2 style={{ fontSize: 16, letterSpacing: "0.14em", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <Users size={16} style={{ color: "var(--ta, #c9a560)" }} /> JAM TOGETHER
          </h2>
          <button onClick={onClose} aria-label="Close jam panel" style={iconBtn}>
            <X size={17} strokeWidth={1.5} />
          </button>
        </div>

        {phase === "joining" ? (
          <p style={{ fontSize: 13, opacity: 0.7 }}>Opening the room…</p>
        ) : (
          <>
            <button
              style={{ ...ctaBtn, width: "100%" }}
              disabled={busy}
              onClick={() => void run(() => actions.createRoom(collab))}
            >
              CREATE A PRIVATE ROOM
            </button>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, margin: "10px 2px 18px", cursor: "pointer", opacity: 0.8 }}>
              <input type="checkbox" checked={collab} onChange={(e) => setCollab(e.target.checked)} />
              Allow my guest to control playback
            </label>

            <div style={{ borderTop: "1px solid var(--tb, rgba(255,255,255,0.08))", paddingTop: 18 }}>
              <p style={label}>HAVE A CODE?</p>
              <form
                style={{ display: "flex", gap: 8, marginTop: 8 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (joinCode.trim().length >= 4) void run(() => actions.joinRoom(joinCode.trim()));
                }}
              >
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                  placeholder="ABC123"
                  aria-label="Room code"
                  autoCapitalize="characters"
                  style={{ ...textInput, flex: 1, letterSpacing: "0.25em", textTransform: "uppercase" }}
                />
                <button type="submit" style={ctaBtn} disabled={busy || joinCode.trim().length < 4}>
                  JOIN
                </button>
              </form>
            </div>
          </>
        )}

        {joinError && <p role="alert" style={{ fontSize: 12, color: "#e08a7a", marginTop: 12 }}>{joinError}</p>}
        {error && <p role="alert" style={{ fontSize: 12, color: "#e08a7a", marginTop: 12 }}>{error}</p>}

        <p style={{ fontSize: 11, opacity: 0.45, marginTop: 18, lineHeight: 1.6 }}>
          You&apos;ll both stream the same private track on your own devices.
          A jam invitation doesn&apos;t unlock your whole library — only the
          track being shared.
        </p>
      </motion.div>
    </motion.div>
  );
}

function SleepCountdown({ endsAt }: { endsAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <>{fmtRemaining(endsAt - now)}</>;
}

// ── shared inline styles ─────────────────────────────────────────────────────
const iconBtn: React.CSSProperties = {
  background: "none", border: "none", color: "inherit", opacity: 0.7,
  cursor: "pointer", padding: 6, display: "grid", placeItems: "center",
};
const card: React.CSSProperties = {
  border: "1px solid var(--tb, rgba(255,255,255,0.08))",
  borderRadius: 12, padding: "12px 14px", margin: "10px 0",
};
const label: React.CSSProperties = {
  fontSize: 10, letterSpacing: "0.18em", opacity: 0.55, margin: "0 0 6px",
};
const pillBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  background: "none", border: "1px solid var(--ta, #c9a560)", color: "var(--ta, #c9a560)",
  borderRadius: 999, padding: "7px 14px", fontSize: 11, letterSpacing: "0.1em",
  cursor: "pointer",
};
const miniPill: React.CSSProperties = {
  background: "none", border: "1px solid var(--tb, rgba(255,255,255,0.14))", color: "inherit",
  borderRadius: 999, padding: "5px 10px", fontSize: 11, cursor: "pointer",
};
const miniBtn: React.CSSProperties = {
  background: "none", border: "none", color: "inherit", opacity: 0.6,
  cursor: "pointer", fontSize: 11, padding: "2px 5px",
};
const ctaBtn: React.CSSProperties = {
  background: "var(--ta, #c9a560)", color: "#0a0a0a", border: "none",
  borderRadius: 10, padding: "12px 16px", fontWeight: 600, fontSize: 12.5,
  letterSpacing: "0.08em", cursor: "pointer",
};
const textInput: React.CSSProperties = {
  background: "rgba(0,0,0,0.25)", border: "1px solid var(--tb, rgba(255,255,255,0.12))",
  color: "inherit", borderRadius: 10, padding: "10px 12px", fontSize: 14,
};
