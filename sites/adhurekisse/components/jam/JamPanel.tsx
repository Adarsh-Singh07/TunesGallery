"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowUp, Check, Copy, DoorOpen, Moon, Radio, Send, Users, X } from "lucide-react";
import type { JamUiState } from "../../lib/jam/JamSession";
import type { JamActions, JamPhase } from "../../lib/jam/useJam";
import styles from "./JamPanel.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  phase: JamPhase;
  jamState: JamUiState | null;
  joinError: string | null;
  actions: JamActions;
  currentTrackTitle?: string;
  currentRoomTrackId?: string | null;
  libraryTracks?: { index: number; trackId: string; title: string; artist: string }[];
}
const REACTIONS = ["❤️", "✨", "🥰", "💔", "🔥", "🎶"];
const STATUS: Record<string, string> = {
  listening: "Listening", buffering: "Buffering…", ready: "Ready", reconnecting: "Reconnecting…",
  connecting: "Connecting…", joining: "Joining…", disconnected: "Away", left: "Left",
  sleeping: "Sleep timer finished", "needs audio": "Tap to enable audio", ended: "Room ended",
};

export default function JamPanel({
  open, onClose, phase, jamState: state, joinError, actions, currentTrackTitle, libraryTracks = [],
}: Props) {
  const [joinCode, setJoinCode] = useState("");
  const [collaborative, setCollaborative] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [draft, setDraft] = useState("");
  const [pick, setPick] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [collaborativeOverride, setCollaborativeOverride] = useState<boolean | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const chat = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const running = useRef(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const elements = Array.from(dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
      ) ?? []);
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [open, onClose]);
  useEffect(() => {
    if (chat.current) chat.current.scrollTop = chat.current.scrollHeight;
  }, [state?.chat.length, open]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2_000);
    return () => clearTimeout(timer);
  }, [copied]);
  useEffect(() => { setError(null); }, [state?.room?.id, phase]);
  useEffect(() => {
    if (collaborativeOverride !== null && state?.room?.collaborative === collaborativeOverride) {
      setCollaborativeOverride(null);
    }
  }, [collaborativeOverride, state?.room?.collaborative]);

  if (!open) return null;
  const room = state?.room;
  const inRoom = !!room && (phase === "active" || phase === "ended" || phase === "joining");
  const ended = phase === "ended" || state?.connection === "ended";
  const live = !ended && state?.connection === "online";
  const host = state?.myRole === "host";
  const canControl = !!state?.canControl && live;
  const playing = state?.state?.playbackState === "playing";
  const preparing = !!state?.state?.trackId && ["idle", "ready"].includes(state.state.playbackState);
  const scheduled = !!state?.state?.startsAt;
  const queue = state?.queue ?? [];

  async function run(fn: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true); setError(null);
    try { await fn(); }
    catch (e) { setError(e instanceof Error ? e.message : "Something went wrong. Please try again."); }
    finally { running.current = false; setBusy(false); }
  }
  async function copyInvite(kind: "code" | "link") {
    if (!room) return;
    try {
      const url = new URL("/", window.location.origin);
      url.searchParams.set("jam", room.code);
      await navigator.clipboard.writeText(kind === "code" ? room.code : url.toString());
      setError(null); setCopied(kind);
    } catch { setError("Could not copy. Select and share the six-character room code above instead."); }
  }
  function move(index: number, by: number) {
    const ids = queue.map((item) => item.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    void run(() => actions.reorderQueue(ids));
  }

  return (
    <motion.div className={styles.backdrop} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.2 }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div ref={dialog} className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="jam-title" tabIndex={-1}
        initial={{ y: reducedMotion ? 0 : 16 }} animate={{ y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.25 }}>
        <header className={styles.header}>
          <div><p className={styles.eyebrow}>A LITTLE CLOSER, ONE SONG AT A TIME</p>
            <h2 id="jam-title"><Radio size={19} aria-hidden /> Jam together</h2></div>
          <button className={styles.icon} onClick={onClose} aria-label="Close Jam panel"><X size={20} /></button>
        </header>

        {inRoom && room ? <>
          <section className={styles.invite} aria-label="Room invitation">
            <div><p className={styles.eyebrow}>YOUR ROOM · TWO LISTENERS</p><p className={styles.code}>{room.code}</p></div>
            <div className={styles.inviteActions}>
              <button className={styles.pill} onClick={() => void copyInvite("code")} disabled={ended}>
                {copied === "code" ? <Check size={15} /> : <Copy size={15} />}{copied === "code" ? "Code copied" : "Copy code"}
              </button>
              <button className={styles.pill} onClick={() => void copyInvite("link")} disabled={ended}>
                {copied === "link" ? <Check size={15} /> : <Copy size={15} />}{copied === "link" ? "Link copied" : "Invite link"}
              </button>
            </div>
          </section>

          <div className={styles.connection} role="status">
            <span className={live ? styles.liveDot : styles.waitDot} aria-hidden />
            {ended ? "The room has ended · solo listening is ready" : live ? "Together, live" : "Reconnecting · buffered audio can keep playing"}
          </div>
          <section className={styles.listeners} aria-label="Room participants">
            {state?.participants.map((p) => <div className={styles.listener} key={p.userId}>
              <span className={styles.avatar} aria-hidden>{p.displayName.slice(0, 1).toUpperCase()}</span>
              <div><strong>{p.displayName}</strong><span>{p.role === "host" ? "Host" : "Guest"} · {STATUS[p.status] ?? p.status}</span></div>
              <span className={p.connected && live ? styles.liveDot : styles.waitDot} aria-label={p.connected && live ? "Connected" : "Connection unconfirmed"} />
            </div>)}
            {!room.guestId && !ended && <div className={`${styles.listener} ${styles.emptyListener}`}>
              <Users size={22} aria-hidden /><div><strong>A place for your person</strong><span>Share the code to invite them</span></div>
            </div>}
            {!state?.participants.length && <p className={styles.hint}>Finding the listeners…</p>}
          </section>

          <section className={styles.card} aria-label="Shared playback">
            <p className={styles.eyebrow}>{scheduled ? "STARTING TOGETHER…" : preparing ? "GETTING BOTH DEVICES READY…" : "NOW SHARING"}</p>
            <h3 className={styles.track}>{state?.state?.trackId ? currentTrackTitle || "Shared track" : "Choose your first song"}</h3>
            {preparing && <p className={styles.hint}>Both devices must be ready. We check briefly, then show you if someone needs a little longer.</p>}
            <div className={styles.actions}>
              <button className={styles.primary} disabled={!canControl || busy || !state?.state?.trackId || preparing}
                onClick={() => void run(playing ? actions.pause : actions.play)}>
                {playing ? "Pause for both" : "Play for both"}
              </button>
              <button className={styles.pill} disabled={!canControl || busy || !state?.state?.trackId}
                onClick={() => void run(() => actions.seek(Math.max(0, (state?.state?.expectedPosition ?? 0) - 10)))} aria-label="Seek back ten seconds for both">−10s</button>
              <button className={styles.pill} disabled={!canControl || busy || !state?.state?.trackId}
                onClick={() => void run(actions.next)}>Next</button>
            </div>
            {!state?.canControl && !ended && <p className={styles.hint}>The host sets the pace. Suggest a song in the queue below.</p>}
            {(state?.needsGesture || state?.sleeping) && !ended && <div className={styles.notice}>
              <p>{state.sleeping ? "Your sleep timer finished. The other listener is still in the room." : "Your browser needs a tap before it can play audio."}</p>
              <button className={styles.primary} onClick={() => void run(actions.resumeLocal)} disabled={busy}>
                {state.sleeping ? "Rejoin the music" : "Enable audio"}
              </button>
            </div>}
            {host && !ended && <label className={styles.checkbox}>
              <input type="checkbox" checked={collaborativeOverride ?? room.collaborative} disabled={busy || !live}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setCollaborativeOverride(checked);
                  void run(async () => {
                    try { await actions.setCollaborative(checked); }
                    catch (cause) { setCollaborativeOverride(null); throw cause; }
                  });
                }} />
              Let my guest control playback too
            </label>}
          </section>

          <section className={styles.card} aria-labelledby="jam-queue-title">
            <h3 id="jam-queue-title" className={styles.eyebrow}>OUR QUEUE · {queue.length}</h3>
            {!queue.length && <p className={styles.hint}>A blank page for your next few songs.</p>}
            <ol className={styles.queue}>
              {queue.map((item, index) => <li key={item.id} aria-current={item.trackId === state?.state?.trackId ? "true" : undefined}>
                <span className={styles.number}>{String(index + 1).padStart(2, "0")}</span>
                <div className={styles.queueTitle}><strong>{item.title}</strong><span>{item.artist}{item.addedBy !== room.hostId ? " · guest suggestion" : ""}</span></div>
                <div className={styles.queueButtons}>
                  {state?.canControl && <button className={styles.icon} disabled={!live || busy} onClick={() => void run(() => actions.playQueueItem(item.id))} aria-label={`Play ${item.title} for both`}>▶</button>}
                  {host && !ended && <>
                    <button className={styles.icon} disabled={!live || busy || index === 0} onClick={() => move(index, -1)} aria-label={`Move ${item.title} up`}><ArrowUp size={16} /></button>
                    <button className={styles.icon} disabled={!live || busy || index === queue.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${item.title} down`}><ArrowDown size={16} /></button>
                    <button className={styles.icon} disabled={!live || busy} onClick={() => void run(() => actions.removeFromQueue(item.id))} aria-label={`Remove ${item.title}`}><X size={16} /></button>
                  </>}
                </div>
              </li>)}
            </ol>
            {!ended && <form className={styles.form} onSubmit={(e) => {
              e.preventDefault();
              const item = libraryTracks.find((t) => String(t.index) === pick);
              if (item) void run(async () => { await (host ? actions.addToQueue(item.index) : actions.suggestTrack(item.index)); setPick(""); });
            }}>
              <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Choose a shared track" disabled={!live || busy || !libraryTracks.length}>
                <option value="">{libraryTracks.length ? (host ? "Add a song…" : "Suggest a song…") : "No playable private tracks yet"}</option>
                {libraryTracks.map((item) => <option key={item.trackId} value={String(item.index)}>{item.title} — {item.artist}</option>)}
              </select>
              <button className={styles.pill} type="submit" disabled={!pick || !live || busy}>{host ? "Add" : "Suggest"}</button>
            </form>}
            <p className={styles.hint}>Only tracks both listeners can access can be shared.</p>
          </section>

          {!ended && <>
            <section className={styles.card} aria-label="Personal sleep timer">
              <p className={styles.eyebrow}><Moon size={13} aria-hidden /> SLEEP TIMER · JUST FOR YOU</p>
              <div className={styles.actions}>
                {state?.sleepEndsAt ? <button className={styles.pill} onClick={actions.cancelSleepTimer}>Cancel · <SleepCountdown endsAt={state.sleepEndsAt} /></button>
                  : [15, 30, 60].map((minutes) => <button className={styles.pill} key={minutes} onClick={() => actions.startSleepTimer(minutes * 60_000)}>{minutes} min</button>)}
              </div>
              <p className={styles.hint}>Pauses only your audio. Your person can keep listening.</p>
            </section>
            <section className={styles.card} aria-labelledby="jam-chat-title">
              <h3 id="jam-chat-title" className={styles.eyebrow}>LITTLE WORDS BETWEEN SONGS</h3>
              <div ref={chat} className={styles.chat} role="log" aria-label="Room chat" aria-live="polite" aria-relevant="additions">
                {!state?.chat.length && <p className={styles.hint}>Say what this song reminds you of…</p>}
                {state?.chat.map((m) => <p key={m.id}><strong>{m.name}</strong> {m.text}
                  {m.delivery === "failed" && <small className={styles.error}> · not delivered</small>}
                  {m.delivery === "sending" && <small> · sending…</small>}</p>)}
              </div>
              <div className={styles.reactions} aria-label="Reactions">{REACTIONS.map((emoji) =>
                <button className={styles.icon} key={emoji} onClick={() => actions.sendReaction(emoji)} disabled={!live} aria-label={`React ${emoji}`}>{emoji}</button>)}</div>
              <form className={styles.form} onSubmit={(e) => { e.preventDefault(); if (draft.trim() && live) { actions.sendChat(draft); setDraft(""); } }}>
                <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={280} placeholder="A message for the room…" aria-label="Chat message" disabled={!live} />
                <button className={styles.pill} type="submit" aria-label="Send message" disabled={!draft.trim() || !live}><Send size={17} /></button>
              </form>
              <p className={styles.hint}>Messages are saved to this private room.</p>
            </section>
          </>}
          <footer className={styles.footer}>
            <span className={styles.hint}>{state?.clock ? `Connection RTT ${Math.round(state.clock.rttMs)} ms` : "Estimating the shared clock…"}</span>
            <button className={styles.pill} disabled={busy || (!ended && !live)} onClick={() => void run(ended ? actions.leave : host ? actions.end : actions.leave)}>
              <DoorOpen size={15} />{ended ? "Back to solo" : host ? "End room" : "Leave room"}
            </button>
          </footer>
        </> : <>
          <p className={styles.intro}>Two headphones. One shared moment.</p>
          <p className={styles.hint}>Solo listening is ready whenever you are. To listen together, create a code for one guest or enter a code they shared with you.</p>
          {phase === "joining" ? <p role="status" className={styles.notice}>Opening your room and checking the connection…</p> : <>
            <button className={`${styles.primary} ${styles.full}`} disabled={busy} onClick={() => void run(() => actions.createRoom(collaborative))}>Create a private room code</button>
            <label className={styles.checkbox}><input type="checkbox" checked={collaborative} onChange={(e) => setCollaborative(e.target.checked)} />Allow my guest to control playback</label>
            <section className={styles.card}>
              <p className={styles.eyebrow}>ALREADY HAVE A ROOM CODE?</p>
              <form className={styles.form} onSubmit={(e) => { e.preventDefault(); if (joinCode.length === 6) void run(() => actions.joinRoom(joinCode)); }}>
                <input className={styles.codeInput} value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                  placeholder="ABC123" aria-label="Six-character room code" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={6} />
                <button className={styles.primary} type="submit" disabled={busy || joinCode.length !== 6}>Join</button>
              </form>
            </section>
          </>}
          <p className={styles.hint}>A code joins a room; it doesn’t grant private tracks. Shared playback uses private audio that both listeners can already access. Curated songs remain available for solo listening.</p>
        </>}
        {(error || joinError || state?.error) && <p role="alert" className={styles.error}>{error || joinError || state?.error}</p>}
      </motion.div>
    </motion.div>
  );
}

function SleepCountdown({ endsAt }: { endsAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1_000); return () => clearInterval(timer); }, []);
  const seconds = Math.max(0, Math.ceil((endsAt - now) / 1_000));
  return <>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</>;
}
