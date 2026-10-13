import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { synchronizeClock, type ClockEstimate } from "./clock";
import {
  adaptiveThresholds, classifyDrift, expectedPosition, nudgeRate,
  NUDGE_MAX_MS, NUDGE_SETTLE_MS, SEEK_COOLDOWN_MS, scheduledStartAt,
  type DriftThresholds, type TimelineState,
} from "./timeline";

export type JamConnection = "connecting" | "online" | "reconnecting" | "ended";
export interface JamParticipantInfo {
  userId: string;
  displayName: string;
  role: "host" | "guest";
  status: string;
  lastSeen: string;
  connected: boolean;
}
export interface JamRoomInfo {
  id: string;
  code: string;
  hostId: string;
  guestId: string | null;
  collaborative: boolean;
  status: "open" | "active" | "ended";
  expiresAt?: number;
}
export interface JamStateSnapshot {
  trackId: string | null;
  playbackState: "idle" | "ready" | "playing" | "paused" | "ended";
  revision: number;
  expectedPosition: number;
  startsAt: number | null;
}
export interface JamChatMessage {
  id: string;
  userId: string;
  name: string;
  text: string;
  at: number;
  delivery?: "sending" | "sent" | "failed";
}
export interface JamQueueItem {
  id: string;
  trackId: string;
  title: string;
  artist: string;
  addedBy: string;
}
export interface JamUiState {
  connection: JamConnection;
  room: JamRoomInfo | null;
  myRole: "host" | "guest" | null;
  participants: JamParticipantInfo[];
  state: JamStateSnapshot | null;
  queue: JamQueueItem[];
  chat: JamChatMessage[];
  clock: ClockEstimate | null;
  canControl: boolean;
  sleeping: boolean;
  sleepEndsAt: number | null;
  needsGesture: boolean;
  localStatus: string;
  error: string | null;
}

/** Direct provider operations: these must NOT route back through Jam controls. */
export interface PlayerAdapter {
  loadTrack(songIndex: number, autoplay: boolean): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  setRate(rate: number): Promise<void>;
  getPosition(): number;
  isPlaying(): boolean;
  isBuffered(): boolean;
  getDuration?(): number;
}
export type TrackResolver = (trackId: string) => number | null | Promise<number | null>;
export interface JamSessionOptions {
  db: SupabaseClient;
  roomId: string;
  userId: string;
  displayName: string;
  player: PlayerAdapter;
  resolveTrack: TrackResolver;
  thresholds?: DriftThresholds;
  readinessTimeoutMs?: number;
}
export interface RoomStateRow {
  room_id: string;
  track_id: string | null;
  playback_state: JamStateSnapshot["playbackState"];
  position_seconds: number;
  revision: number;
  updated_at: string;
  start_at?: string | null;
  scheduled_start_at?: string | null;
  track_revision?: number;
}

const REACTIONS = new Set(["❤️", "✨", "🥰", "💔", "🔥", "🎶"]);
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const visible = () => typeof document === "undefined" || document.visibilityState !== "hidden";
const online = () => typeof navigator === "undefined" || navigator.onLine !== false;

/** Database rows are authoritative, including identity-bound readiness and chat. */
export class JamSession {
  private channel: RealtimeChannel | null = null;
  private disposed = false;
  private suspended = false;
  private lifetime = new AbortController();
  private started: Promise<void> | null = null;
  private recovery: Promise<void> | null = null;
  private connecting: Promise<void> | null = null;
  private clockTask: Promise<void> | null = null;
  private commandTail: Promise<void> = Promise.resolve();
  private playbackTask: Promise<void> | null = null;
  private syncRequested = false;
  private syncing = false;
  private _room: JamRoomInfo | null = null;
  private _role: "host" | "guest" | null = null;
  private _connection: JamConnection = "connecting";
  private _stateRow: RoomStateRow | null = null;
  private _queue: JamQueueItem[] = [];
  private _chat: JamChatMessage[] = [];
  private _participants = new Map<string, JamParticipantInfo>();
  private _clock: ClockEstimate | null = null;
  private clockAnchor = { epoch: Date.now(), mono: performance.now() };
  private _error: string | null = null;
  private _needsGesture = false;
  private announcedStatus: string | null = null;
  private readyRetryAt = 0;
  private loadedTrackId: string | null = null;
  private readyKey: string | null = null;
  private readyPeers = new Set<string>();
  private startingKey: string | null = null;
  private endedRevision: number | null = null;
  private readinessWatch: ReturnType<typeof setTimeout> | null = null;
  private startWatch: ReturnType<typeof setTimeout> | null = null;
  private reconnectWatch: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private currentRate = 1;
  private rateTail: Promise<void> = Promise.resolve();
  private nudgeStarted = 0;
  private lastSeek = -Infinity;
  private driftBusy = false;
  private _sleepEndsAt: number | null = null;
  private _sleeping = false;
  private sleepWatch: ReturnType<typeof setTimeout> | null = null;
  private timers: ReturnType<typeof setInterval>[] = [];
  private cleanup: (() => void)[] = [];
  private listeners = new Set<(state: JamUiState) => void>();
  private requestVersions = new Map<string, number>();

  constructor(private opts: JamSessionOptions) {}

  start(): Promise<void> {
    if (!this.started) this.started = this.bootstrap();
    return this.started;
  }

  private async bootstrap(): Promise<void> {
    try {
      await this.recover(true);
      if (this.disposed) return;
      this.installLifecycle();
      await this.connect();
      this.timers.push(setInterval(() => {
        if (!this.disposed && !this.suspended) {
          this.checkSleep();
          this.checkExpiry();
          this.notifyPlayerState();
          void this.driftTick();
        }
      }, 1_000));
      this.timers.push(setInterval(() => {
        if (visible() && online() && !this.suspended) {
          void this.heartbeat();
          void this.recover().catch((e) => this.connectionLost(e));
        }
      }, 20_000));
      this.timers.push(setInterval(() => {
        if (visible() && !this.suspended) void this.resyncClock();
      }, 5 * 60_000));
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  /** Detaches synchronization, never pauses/destroys independently buffered audio. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.lifetime.abort();
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.clearTransportTimers();
    if (this.reconnectWatch) clearTimeout(this.reconnectWatch);
    if (this.sleepWatch) clearTimeout(this.sleepWatch);
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
    const channel = this.channel;
    this.channel = null;
    if (channel) void this.opts.db.removeChannel(channel).catch(() => {});
    void this.setRate(1).catch(() => {});
    this.listeners.clear();
  }

  subscribe(listener: (state: JamUiState) => void): () => void {
    this.listeners.add(listener);
    listener(this.uiState());
    return () => { this.listeners.delete(listener); };
  }

  static async createRoom(db: SupabaseClient, collaborative: boolean): Promise<{ roomId: string; code: string }> {
    const { data, error } = await db.rpc("jam_create_room", { p_collaborative: collaborative });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.room_id) throw new Error("The room could not be created.");
    return { roomId: row.room_id, code: row.room_code };
  }

  static async joinRoom(db: SupabaseClient, code: string): Promise<string> {
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(normalized)) throw new Error("Enter the six-character room code.");
    const { data, error } = await db.rpc("jam_join_room", { p_code: normalized });
    if (error) {
      if (error.message.includes("ROOM_FULL")) throw new Error("This room already has two listeners.");
      if (error.message.includes("ROOM_NOT_FOUND")) throw new Error("No open room with that code. It may have expired.");
      throw new Error(error.message);
    }
    if (!data) throw new Error("Could not join this room. Check the code, available seat, and shared-track permissions, then try again.");
    return String(data);
  }

  get canControl(): boolean {
    return !this.disposed && this._room?.status !== "ended" &&
      (this._role === "host" || (this._role === "guest" && this._room?.collaborative === true));
  }

  private assertCommand(type: string): void {
    if (this.disposed || !this._room || this._room.status === "ended") throw new Error("This room has ended.");
    if (this._connection !== "online") throw new Error("Reconnecting — wait for the room to be live.");
    const hostOnly = ["end_room", "set_collaborative", "queue_add", "queue_remove", "queue_reorder", "start_at"].includes(type);
    if ((hostOnly && this._role !== "host") || (type !== "suggest_track" && !this.canControl)) {
      throw new Error("You cannot control this room.");
    }
    if (type === "suggest_track" && this._role !== "guest") throw new Error("Only the guest can suggest a track.");
  }

  /** Serialize local intentions. Ambiguous transport retries reuse the identical ID and revision. */
  private command(type: string, payload: Record<string, unknown> | (() => Record<string, unknown>) = {}, requiredRevision?: number): Promise<void> {
    const id = crypto.randomUUID();
    const task = this.commandTail.then(async () => {
      this.assertCommand(type);
      if (requiredRevision !== undefined && this._stateRow?.revision !== requiredRevision) return;
      const args = {
        p_room_id: this.opts.roomId, p_command_id: id, p_type: type,
        p_payload: typeof payload === "function" ? payload() : payload, p_expected_revision: this._stateRow?.revision ?? 0,
      };
      for (let attempt = 0; attempt < 2; attempt++) {
        let result;
        try {
          result = await this.request((signal) => this.opts.db.rpc("jam_apply_command", args).abortSignal(signal));
        } catch (error) {
          if (!attempt && !this.disposed && online()) continue;
          this.connectionLost(error);
          throw new Error("The command could not be confirmed. Reconnecting to the room…");
        }
        if (result.error) {
          const error = result.error;
          if (!error.code && /fetch|network|timeout/i.test(error.message) && !attempt) continue;
          if (error.message.includes("STALE_REVISION")) {
            await this.recover();
            throw new Error("Someone else changed playback a moment ago — try again.");
          }
          if (error.message.includes("ROOM_ENDED")) this.finish();
          if (error.message.includes("FORBIDDEN")) throw new Error("You cannot control this room.");
          if (error.message.includes("NOT_READY")) throw new Error("One device is still preparing audio. Both listeners must be ready before playback can start.");
          if (error.message.includes("TRACK_ACCESS_DENIED")) throw new Error("Both listeners need permission to play this track.");
          if (error.message.includes("UNKNOWN_COMMAND")) throw new Error("This feature needs the Jam database update.");
          throw new Error(error.message);
        }
        // Never invent state from a revision-only RPC response.
        try { await this.recover(); }
        catch (error) {
          this.connectionLost(error);
          throw new Error("The command was received, but the latest room state could not be fetched. Reconnecting…");
        }
        return;
      }
    });
    this.commandTail = task.catch(() => {});
    return task;
  }

  async play(): Promise<void> {
    this.wake();
    if (!this._stateRow?.track_id) throw new Error("Choose a shared track first.");
    await this.command("play");
  }
  pause(): Promise<void> { return this.command("pause"); }
  seek(seconds: number): Promise<void> {
    if (!Number.isFinite(seconds)) return Promise.reject(new Error("Choose a valid playback position."));
    return this.command("seek", { position_seconds: Math.max(0, seconds) });
  }
  setTrack(trackId: string, positionSeconds = 0): Promise<void> {
    if (!trackId || !Number.isFinite(positionSeconds)) return Promise.reject(new Error("Choose a valid track."));
    return this.command("set_track", { track_id: trackId, position_seconds: Math.max(0, positionSeconds) });
  }
  async skipNext(nextTrackId?: string | null): Promise<void> {
    if (nextTrackId) return this.setTrack(nextTrackId);
    if (this._queue.length) await this.command("skip_next");
    else await this.pause();
  }
  async playQueueItem(id: string): Promise<void> {
    const item = this._queue.find((q) => q.id === id);
    if (!item) throw new Error("This queue item is no longer available.");
    // The database consumes the selected entry atomically with set_track.
    await this.command("set_track", { track_id: item.trackId, position_seconds: 0, queue_item_id: id });
  }
  /** Provider-ended is consumed on BOTH devices; only the host advances the room. */
  async onEnded(): Promise<void> {
    const row = this._stateRow;
    if (this.disposed || this._sleeping || !row || row.playback_state !== "playing") return;
    if (this._role !== "host" || this._connection !== "online" || this.endedRevision === row.revision) return;
    this.endedRevision = row.revision;
    try { await this.skipNext(); } catch (e) { this.report(e); }
  }
  setCollaborative(on: boolean): Promise<void> { return this.command("set_collaborative", { collaborative: on }); }
  endRoom(): Promise<void> { return this.command("end_room"); }
  async leave(): Promise<void> {
    if (this.disposed) return;
    const { error } = await this.request((signal) => this.opts.db.rpc("jam_leave_room", { p_room_id: this.opts.roomId }).abortSignal(signal));
    if (error) throw new Error(error.message);
    this.finish();
  }

  addToQueue(trackId: string): Promise<void> { return this.command("queue_add", { track_id: trackId }); }
  removeFromQueue(id: string): Promise<void> { return this.command("queue_remove", { queue_item_id: id }); }
  reorderQueue(ids: string[]): Promise<void> {
    if (ids.length !== this._queue.length || new Set(ids).size !== ids.length || ids.some((id) => !this._queue.some((q) => q.id === id))) {
      return Promise.reject(new Error("The queue changed — refresh its order and try again."));
    }
    return this.command("queue_reorder", { ordered_ids: [...ids] });
  }
  suggestTrack(trackId: string): Promise<void> { return this.command("suggest_track", { track_id: trackId }); }

  sendChat(text: string): void { this.sendMessage(text.trim().slice(0, 280), "chat"); }
  sendReaction(emoji: string): void { if (REACTIONS.has(emoji)) this.sendMessage(emoji, "reaction"); }
  private sendMessage(text: string, event: "chat" | "reaction"): void {
    if (!text || this.disposed) return;
    if (this._connection !== "online") { this.report(new Error("Chat will return when the room reconnects.")); return; }
    const item: JamChatMessage = { id: crypto.randomUUID(), userId: this.opts.userId, name: this.opts.displayName, text, at: Date.now(), delivery: "sending" };
    this._chat = [...this._chat.slice(-99), item];
    this.emit();
    void this.request((signal) => this.opts.db.rpc("jam_send_message", {
      p_room_id: this.opts.roomId, p_message_id: item.id, p_text: text, p_kind: event,
    }).abortSignal(signal))
      .then(({ data, error }) => {
        this.setDelivery(item.id, error ? "failed" : "sent");
        if (!error && data) this.receiveMessage(data);
      })
      .catch(() => this.setDelivery(item.id, "failed"));
  }
  private setDelivery(id: string, delivery: "sent" | "failed"): void {
    if (this.disposed) return;
    this._chat = this._chat.map((m) => m.id === id ? { ...m, delivery } : m);
    this.emit();
  }
  private receiveMessage(payload: Record<string, unknown>): void {
    if (this.disposed || payload.room_id !== this.opts.roomId || typeof payload.id !== "string" || payload.id.length > 100 || !this.isMember(payload.user_id)) return;
    const text = payload.text;
    if (typeof text !== "string" || !text.trim()) return;
    const item: JamChatMessage = {
      id: payload.id, userId: String(payload.user_id), name: String(payload.name || "Listener").slice(0, 80),
      text: text.slice(0, 280), at: Date.parse(String(payload.created_at)) || Date.now(), delivery: "sent",
    };
    const existing = this._chat.findIndex((m) => m.id === payload.id);
    if (existing >= 0) this._chat = this._chat.map((m) => m.id === item.id ? item : m);
    else this._chat = [...this._chat.slice(-99), item];
    this._chat.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
    this.emit();
  }

  startSleepTimer(ms: number): void {
    if (this.disposed || !Number.isFinite(ms) || ms <= 0) return;
    if (this.sleepWatch) clearTimeout(this.sleepWatch);
    this._sleeping = false;
    this._sleepEndsAt = Date.now() + Math.min(ms, 24 * 60 * 60_000);
    this.sleepWatch = setTimeout(() => this.checkSleep(), Math.min(ms, 24 * 60 * 60_000));
    this.emit();
  }
  cancelSleepTimer(): void {
    if (this.sleepWatch) clearTimeout(this.sleepWatch);
    this.sleepWatch = null;
    this._sleepEndsAt = null;
    this.emit();
  }
  private checkSleep(): void {
    if (this.disposed || !this._sleepEndsAt || Date.now() < this._sleepEndsAt) return;
    this.cancelSleepTimer();
    this._sleeping = true;
    this.clearTransportTimers();
    void this.opts.player.pause().catch((e) => this.report(e));
    void this.setRate(1).catch(() => {});
    this.emit();
  }
  private checkExpiry(): void {
    if (!this.disposed && this._room?.expiresAt && this.serverNow() >= this._room.expiresAt) this.finish();
  }
  wake(): void {
    this.cancelSleepTimer();
    this._sleeping = false;
    this.emit();
  }
  /** Local user gesture: also works for a guest without shared control permission. */
  async resumeLocal(): Promise<void> {
    this.wake();
    this._needsGesture = false;
    this._error = null;
    // Start within the gesture when already prepared; reconciliation seeks afterward.
    const row = this._stateRow;
    if (row?.playback_state === "playing" && this.anchor(row) <= this.serverNow() && this.loadedTrackId === row.track_id) {
      try { await this.opts.player.play(); } catch (e) { this._needsGesture = true; this.report(e); return; }
    }
    await this.requestSync();
  }

  notifyPlayerReady(): void {
    const row = this._stateRow;
    if (this.disposed || this._sleeping || !row?.track_id || this.loadedTrackId !== row.track_id || !this.opts.player.isBuffered()) return;
    const key = this.stateKey(row);
    if (this.readyKey === key || this._connection !== "online" || performance.now() < this.readyRetryAt) return;
    this.readyKey = key;
    void this.request((signal) => this.opts.db.rpc("jam_set_ready", {
      p_room_id: this.opts.roomId, p_track_id: row.track_id, p_expected_revision: row.revision,
    }).abortSignal(signal)).then(async ({ error }) => {
      if (this.disposed || !this._stateRow || this.stateKey(this._stateRow) !== key) return;
      if (error) throw new Error(error.message);
      this.readyPeers.add(this.opts.userId);
      await this.fetchParticipants();
      this.maybeStart();
    }).catch((error) => {
      if (this.readyKey === key) this.readyKey = null;
      this.readyRetryAt = performance.now() + 5_000;
      this.report(error);
    });
    this.emit();
  }

  /** Called on provider state changes; readiness never depends on a React ref render. */
  notifyPlayerState(): void {
    if (this.disposed) return;
    this.notifyPlayerReady();
    this.emit();
  }

  /** A library update can make a previously unresolved shared track available. */
  refreshLibrary(): void {
    if (!this.disposed && this.loadedTrackId !== this._stateRow?.track_id) void this.requestSync();
  }

  private stateKey(row: RoomStateRow): string { return `${row.track_id}:${row.track_revision ?? row.revision}`; }
  private anchor(row: RoomStateRow): number { return Date.parse(row.start_at ?? row.scheduled_start_at ?? row.updated_at); }
  private timeline(row: RoomStateRow): TimelineState {
    return { positionSeconds: row.position_seconds, updatedAt: this.anchor(row), playbackState: row.playback_state };
  }
  private serverNow(): number { return this.clockAnchor.epoch + (performance.now() - this.clockAnchor.mono) + (this._clock?.offsetMs ?? 0); }
  private target(row: RoomStateRow): number {
    const target = expectedPosition(this.timeline(row), this.serverNow());
    const duration = this.opts.player.getDuration?.();
    return duration && Number.isFinite(duration) ? Math.min(duration, target) : target;
  }
  private current(row: RoomStateRow): boolean { return !this.disposed && !this.suspended && !this._sleeping && this._stateRow === row; }

  /** Reject duplicates and older snapshots before starting ANY asynchronous player work. */
  private async applyStateRow(row: RoomStateRow, recover = false): Promise<void> {
    if (this.disposed || row.room_id !== this.opts.roomId || !Number.isSafeInteger(row.revision) || row.revision < 0 ||
        !Number.isFinite(row.position_seconds) || !Number.isFinite(this.anchor(row))) return;
    if (this._stateRow && row.revision < this._stateRow.revision) return;
    if (this._stateRow && row.revision === this._stateRow.revision) {
      if (recover) await this.requestSync();
      return;
    }
    const trackChanged = !this._stateRow || this.stateKey(this._stateRow) !== this.stateKey(row);
    this._stateRow = { ...row };
    this.clearTransportTimers();
    if (trackChanged) { this.readyPeers.clear(); this.readyKey = null; this.readyRetryAt = 0; }
    this.startingKey = null;
    if (this.loadedTrackId !== row.track_id) this._needsGesture = false;
    if (row.playback_state === "ended") { this.finish(); return; }
    this.armReadiness();
    this.emit();
    await this.requestSync();
  }

  /** A single coalescing player worker; late loads can never play an older revision. */
  private requestSync(): Promise<void> {
    if (this.disposed || this.suspended) return Promise.resolve();
    this.syncRequested = true;
    if (!this.playbackTask) {
      this.playbackTask = (async () => {
        this.syncing = true;
        while (this.syncRequested && !this.disposed && !this.suspended) {
          this.syncRequested = false;
          const row = this._stateRow;
          if (!row || this._sleeping) continue;
          try { await this.reconcile(row); }
          catch (error) {
            if (this.current(row)) { this._needsGesture = true; this.report(error); }
          }
        }
      })().finally(() => {
        this.syncing = false;
        this.playbackTask = null;
        if (this.syncRequested && !this.disposed && !this.suspended) void this.requestSync();
      });
    }
    return this.playbackTask;
  }

  private async reconcile(row: RoomStateRow): Promise<void> {
    if (!this.current(row)) return;
    await this.setRate(1);
    if (!this.current(row)) return;
    if (!row.track_id) return;
    if (this.loadedTrackId !== row.track_id) {
      await this.opts.player.pause();
      if (!this.current(row)) return;
      const index = await this.opts.resolveTrack(row.track_id);
      if (!this.current(row)) return;
      if (index == null) throw new Error("This shared track is not available in your library yet. Refresh your library, then tap Enable audio.");
      await this.opts.player.loadTrack(index, false);
      // Record the actual load even if a newer row arrived while it was pending.
      this.loadedTrackId = row.track_id;
      if (!this.current(row)) return;
    }
    this.notifyPlayerReady();
    if (row.playback_state !== "playing") {
      await this.opts.player.pause();
      if (!this.current(row)) return;
      await this.opts.player.seek(this.target(row));
      this.armReadiness();
      return;
    }
    const delay = this.anchor(row) - this.serverNow();
    if (delay > 10) {
      await this.opts.player.pause();
      if (!this.current(row)) return;
      await this.opts.player.seek(row.position_seconds);
      if (!this.current(row)) return;
      if (this.startWatch) clearTimeout(this.startWatch);
      this.startWatch = setTimeout(() => {
        this.startWatch = null;
        if (this.current(row)) void this.requestSync();
      }, Math.min(delay, 2_147_483_647));
      return;
    }
    if (!this.current(row)) return;
    if (Math.abs(this.opts.player.getPosition() - this.target(row)) > 0.04) {
      await this.opts.player.seek(this.target(row));
      this.lastSeek = performance.now();
    }
    if (!this.current(row)) return;
    if (!this.opts.player.isPlaying()) await this.opts.player.play();
    if (this.current(row)) { this._error = null; this._needsGesture = false; this.emit(); }
  }

  private armReadiness(): void {
    const row = this._stateRow;
    if (this.disposed || this.suspended || this._sleeping || this._role !== "host" || !row?.track_id ||
        !["idle", "ready"].includes(row.playback_state) || this.readinessWatch || this.startingKey === this.stateKey(row)) return;
    this.readinessWatch = setTimeout(() => {
      this.readinessWatch = null;
      if (this.current(row)) this.issueStart(row);
    }, Math.max(250, Math.min(15_000, this.opts.readinessTimeoutMs ?? 5_000)));
  }
  private maybeStart(): void {
    const row = this._stateRow;
    if (!row || !this._room || this._role !== "host" || !["idle", "ready"].includes(row.playback_state)) return;
    if (this._room.guestId && this.readyPeers.has(this._room.hostId) && this.readyPeers.has(this._room.guestId)) this.issueStart(row);
  }
  private issueStart(row: RoomStateRow): void {
    const key = this.stateKey(row);
    if (!this.current(row) || this._connection !== "online" || this.startingKey === key) return;
    this.startingKey = key;
    if (this.readinessWatch) clearTimeout(this.readinessWatch);
    this.readinessWatch = null;
    const lead = Math.min(3_000, Math.max(1_200, (this._clock?.rttMs ?? 0) * 2 + 400));
    void this.command("start_at", () => ({
      position_seconds: row.position_seconds,
      start_at: new Date(scheduledStartAt(this.serverNow(), lead)).toISOString(),
    }), row.revision).catch((e) => {
      // A NOT_READY timeout is bounded; a later authoritative readiness update may start it.
      if (this.startingKey === key) this.startingKey = null;
      this.report(e);
    });
  }
  private clearTransportTimers(): void {
    if (this.readinessWatch) clearTimeout(this.readinessWatch);
    if (this.startWatch) clearTimeout(this.startWatch);
    this.readinessWatch = this.startWatch = null;
  }

  private async driftTick(): Promise<void> {
    this.checkSleep();
    const row = this._stateRow;
    if (this.driftBusy || this.syncing || this.recovery || !row || !this.current(row) || !visible() || this._connection !== "online" ||
        row.playback_state !== "playing" || this.anchor(row) > this.serverNow() || !this.opts.player.isPlaying() || !this.opts.player.isBuffered()) {
      if (this.currentRate !== 1 && !this.driftBusy) await this.setRate(1).catch(() => {});
      return;
    }
    const drift = (this.target(row) - this.opts.player.getPosition()) * 1000;
    const thresholds = adaptiveThresholds(this.opts.thresholds, this._clock?.rttMs);
    const correction = classifyDrift(drift, thresholds);
    const now = performance.now();
    this.driftBusy = true;
    try {
      if (this.currentRate !== 1 && now - this.nudgeStarted >= NUDGE_MAX_MS) {
        await this.setRate(1);
        this.lastSeek = now;
      } else if (correction === "seek" && now - this.lastSeek >= SEEK_COOLDOWN_MS) {
        await this.setRate(1);
        if (!this.current(row)) return;
        this.lastSeek = now;
        await this.opts.player.seek(this.target(row));
      } else if (correction === "nudge" && now - this.lastSeek >= 2_000) {
        if (this.currentRate === 1) this.nudgeStarted = now;
        if (now - this.nudgeStarted >= NUDGE_MAX_MS) {
          await this.setRate(1);
          this.lastSeek = now; // rest between bounded nudge windows
        } else await this.setRate(nudgeRate(drift));
      } else if (Math.abs(drift) < Math.max(NUDGE_SETTLE_MS, thresholds.none / 2) || correction === "seek") {
        await this.setRate(1);
      }
    } catch (e) { this.report(e); }
    finally { this.driftBusy = false; }
  }
  private setRate(rate: number): Promise<void> {
    const task = this.rateTail.then(async () => {
      if (this.currentRate === rate) return;
      await this.opts.player.setRate(rate);
      this.currentRate = rate;
    });
    this.rateTail = task.catch(() => {});
    return task;
  }

  /** Request bounds release lifecycle/command queues even on hung fetches. */
  private async request<T>(run: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
    if (this.disposed) throw new Error("Session closed");
    const controller = new AbortController();
    const abort = () => controller.abort();
    this.lifetime.signal.addEventListener("abort", abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rejectAbort: (() => void) | undefined;
    try {
      const cancelled = new Promise<never>((_, reject) => {
        rejectAbort = () => reject(new Error("Request interrupted or timed out"));
        controller.signal.addEventListener("abort", rejectAbort, { once: true });
        timer = setTimeout(abort, 8_000);
      });
      return await Promise.race([Promise.resolve(run(controller.signal)), cancelled]);
    } finally {
      clearTimeout(timer);
      this.lifetime.signal.removeEventListener("abort", abort);
      if (rejectAbort) controller.signal.removeEventListener("abort", rejectAbort);
    }
  }

  /** Fetch after SUBSCRIBED too: this closes the initial read/subscribe gap. */
  private recover(clock = false): Promise<void> {
    if (this.disposed || this.suspended) return Promise.resolve();
    this.checkExpiry();
    if (this.disposed) return Promise.resolve();
    if (this.recovery) return this.recovery;
    this.recovery = (async () => {
      await this.fetchRoom();
      if (this.disposed) return;
      if (clock) await this.resyncClock();
      await this.refetchState(clock);
      if (this.disposed) return;
      await Promise.all([this.refetchQueue(), this.fetchParticipants(), this.refetchChat()]);
    })().finally(() => { this.recovery = null; });
    return this.recovery;
  }
  private version(key: string): () => boolean {
    const version = (this.requestVersions.get(key) ?? 0) + 1;
    this.requestVersions.set(key, version);
    return () => !this.disposed && version === this.requestVersions.get(key);
  }
  private async fetchRoom(): Promise<void> {
    const current = this.version("room");
    const { data, error } = await this.request((signal) => this.opts.db.from("jam_rooms")
      .select("id,code,host_id,guest_id,collaborative,status,expires_at").eq("id", this.opts.roomId).abortSignal(signal).single());
    if (!current()) return;
    if (error?.code === "PGRST116" && this._room) { this.finish(); return; }
    if (error || !data) throw new Error(error?.message ?? "Room not found");
    if (data.host_id !== this.opts.userId && data.guest_id !== this.opts.userId) { this.finish(); return; }
    this._room = { id: data.id, code: data.code, hostId: data.host_id, guestId: data.guest_id, collaborative: data.collaborative, status: data.status,
      expiresAt: data.expires_at ? Date.parse(data.expires_at) : undefined };
    this._role = data.host_id === this.opts.userId ? "host" : "guest";
    if (data.status === "ended") { this.finish(); return; }
    this.emit();
  }
  private async refetchState(force = false): Promise<void> {
    const { data, error } = await this.request((signal) => this.opts.db.from("jam_room_state").select("*")
      .eq("room_id", this.opts.roomId).abortSignal(signal).single());
    if (this.disposed) return;
    if (error || !data) throw new Error(error?.message ?? "Room timeline unavailable");
    await this.applyStateRow(data as RoomStateRow, force);
  }
  private async refetchQueue(): Promise<void> {
    const current = this.version("queue");
    const { data, error } = await this.request((signal) => this.opts.db.from("jam_queue")
      .select("id,track_id,position,added_by,tracks(title,artist)").eq("room_id", this.opts.roomId)
      .order("position", { ascending: true }).order("id", { ascending: true }).abortSignal(signal));
    if (!current()) return;
    if (error) throw new Error(error.message);
    this._queue = (data ?? []).map((row) => {
      const track = (Array.isArray(row.tracks) ? row.tracks[0] : row.tracks) as { title?: string; artist?: string } | null;
      return { id: row.id, trackId: row.track_id, title: track?.title ?? "Shared track", artist: track?.artist ?? "", addedBy: row.added_by };
    });
    this.emit();
  }
  private async fetchParticipants(): Promise<void> {
    const current = this.version("participants");
    const { data, error } = await this.request((signal) => this.opts.db.from("jam_participants")
      .select("user_id,role,status,last_seen,ready_track_id,ready_revision,profiles(display_name)").eq("room_id", this.opts.roomId).abortSignal(signal));
    if (!current()) return;
    if (error) throw new Error(error.message);
    const participants = new Map<string, JamParticipantInfo>();
    this.readyPeers.clear();
    for (const row of data ?? []) {
      if (!this.isMember(row.user_id) || row.status === "left") continue;
      const profile = (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles) as { display_name?: string } | null;
      participants.set(row.user_id, {
        userId: row.user_id, role: row.role, displayName: profile?.display_name || "Listener",
        status: row.status, lastSeen: row.last_seen,
        connected: row.status !== "disconnected" && row.status !== "reconnecting" && this.serverNow() - Date.parse(row.last_seen) < 60_000,
      });
      if (this._stateRow && row.ready_track_id === this._stateRow.track_id && row.ready_revision === (this._stateRow.track_revision ?? this._stateRow.revision) &&
          !["buffering", "reconnecting", "disconnected", "joining"].includes(row.status) && this.serverNow() - Date.parse(row.last_seen) < 60_000) {
        this.readyPeers.add(row.user_id);
      }
    }
    this._participants = participants;
    this.maybeStart();
    this.emit();
  }
  private async refetchChat(): Promise<void> {
    const current = this.version("chat");
    const { data, error } = await this.request((signal) => this.opts.db.from("jam_messages")
      .select("id,room_id,user_id,name,text,kind,created_at").eq("room_id", this.opts.roomId)
      .order("created_at", { ascending: false }).limit(100).abortSignal(signal));
    if (!current()) return;
    if (error) throw new Error(error.message);
    for (const row of [...(data ?? [])].reverse()) this.receiveMessage(row);
  }
  private resyncClock(): Promise<void> {
    if (this.clockTask) return this.clockTask;
    this.clockTask = (async () => {
      const estimate = await synchronizeClock(async (signal) => {
        const query = this.opts.db.rpc("server_time");
        const { data, error } = await (signal ? query.abortSignal(signal) : query);
        if (error) throw new Error(error.message);
        return Date.parse(String(data));
      }, 4, { signal: this.lifetime.signal });
      if (this.disposed) return;
      if (estimate) {
        this._clock = estimate;
        this.clockAnchor = { epoch: Date.now(), mono: performance.now() };
      }
      this.emit();
    })().finally(() => { this.clockTask = null; });
    return this.clockTask;
  }
  private localStatus(): string {
    if (this._sleeping) return "sleeping";
    if (this._needsGesture) return "needs audio";
    if (this._connection !== "online") return this._connection;
    if (this._stateRow?.track_id && (this.loadedTrackId !== this._stateRow.track_id || !this.opts.player.isBuffered())) return "buffering";
    return this.opts.player.isPlaying() ? "listening" : "ready";
  }
  private async heartbeat(): Promise<void> {
    if (this.disposed || this.suspended || !online()) return;
    const local = this.localStatus();
    // Keep the original DB status CHECK constraint compatible.
    const status = local === "sleeping" ? "disconnected" : ["listening", "buffering", "ready", "reconnecting"].includes(local) ? local : "ready";
    try {
      const { error } = await this.request((signal) => this.opts.db.rpc("jam_heartbeat", { p_room_id: this.opts.roomId, p_status: status }).abortSignal(signal));
      if (!error && ["buffering", "reconnecting", "disconnected", "joining"].includes(status)) {
        this.readyKey = null;
        this.readyPeers.delete(this.opts.userId);
      }
    } catch { /* recovery owns connection errors */ }
  }
  private isMember(id: unknown): boolean { return typeof id === "string" && !!this._room && (id === this._room.hostId || id === this._room.guestId); }

  private connect(): Promise<void> {
    if (this.connecting) return this.connecting;
    this.connecting = this.replaceChannel().finally(() => { this.connecting = null; });
    return this.connecting;
  }
  private async replaceChannel(): Promise<void> {
    if (this.disposed || this.suspended || !online()) return;
    const old = this.channel;
    this.channel = null; // old callbacks are now inert, including CLOSED from removeChannel
    if (old) await this.opts.db.removeChannel(old).catch(() => {});
    if (this.disposed || this.suspended) return;
    const channel = this.opts.db.channel(`jam:${this.opts.roomId}`, {
      config: { private: true },
    });
    this.channel = channel;
    const active = () => !this.disposed && !this.suspended && this.channel === channel;
    const refresh = () => { if (active()) void this.recover().catch((e) => this.connectionLost(e)); };
    channel
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jam_room_state", filter: `room_id=eq.${this.opts.roomId}` }, ({ new: row }) => {
        if (active()) {
          void this.applyStateRow(row as RoomStateRow).catch((e) => this.report(e));
          // Queue commands bump this revision too. Filtered DELETE delivery is not
          // guaranteed, so fetch associated room/queue metadata from the new anchor.
          refresh();
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jam_rooms", filter: `id=eq.${this.opts.roomId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "jam_queue", filter: `room_id=eq.${this.opts.roomId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "jam_participants", filter: `room_id=eq.${this.opts.roomId}` }, refresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "jam_messages", filter: `room_id=eq.${this.opts.roomId}` }, ({ new: row }) => {
        if (active()) this.receiveMessage(row);
      })
      .subscribe((status) => {
        if (!active()) return;
        if (status === "SUBSCRIBED") {
          if (this.reconnectWatch) clearTimeout(this.reconnectWatch);
          this.reconnectWatch = null;
          void (async () => {
            await this.recover(true);
            if (!active()) return;
            this._connection = "online";
            this.reconnectAttempt = 0;
            this.readyKey = null; // reannounce a readiness signal lost during disconnection
            this.notifyPlayerReady();
            this.armReadiness();
            this.maybeStart();
            await this.heartbeat();
            this.emit();
          })().catch((e) => this.connectionLost(e));
        } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) this.connectionLost();
      });
  }
  private connectionLost(error?: unknown): void {
    if (this.disposed) return;
    this._connection = "reconnecting";
    if (error) this._error = `Reconnecting: ${message(error)}`;
    this.clearTransportTimers();
    void this.setRate(1).catch(() => {});
    this.emit();
    if (this.reconnectWatch || this.suspended || !online()) return;
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(5, this.reconnectAttempt++)) * (0.8 + Math.random() * 0.4);
    this.reconnectWatch = setTimeout(() => {
      this.reconnectWatch = null;
      void this.connect().catch((e) => this.connectionLost(e));
    }, delay);
  }
  private installLifecycle(): void {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const listen = (target: EventTarget, type: string, fn: () => void) => {
      target.addEventListener(type, fn);
      this.cleanup.push(() => target.removeEventListener(type, fn));
    };
    const resume = () => {
      if (this.disposed) return;
      this.suspended = false;
      this.checkSleep();
      if (!online()) return;
      if (!this.channel || this._connection !== "online") {
        if (this.reconnectWatch) clearTimeout(this.reconnectWatch);
        this.reconnectWatch = null;
        void this.connect().catch((e) => this.connectionLost(e));
      } else void this.recover(true).catch((e) => this.connectionLost(e));
    };
    const suspend = () => {
      this.suspended = true;
      this.clearTransportTimers();
      if (this.reconnectWatch) clearTimeout(this.reconnectWatch);
      this.reconnectWatch = null;
      const channel = this.channel;
      this.channel = null;
      if (channel) void this.opts.db.removeChannel(channel).catch(() => {});
      this.connectionLost();
    };
    listen(window, "online", resume);
    listen(window, "offline", () => this.connectionLost());
    listen(window, "pageshow", resume);
    listen(window, "pagehide", suspend);
    listen(document, "freeze", suspend);
    listen(document, "resume", resume);
    listen(document, "visibilitychange", () => {
      if (visible()) resume();
      else { this.checkSleep(); void this.setRate(1).catch(() => {}); }
    });
  }
  private finish(): void {
    if (this.disposed) return;
    this._connection = "ended";
    if (this._room) this._room = { ...this._room, status: "ended" };
    this.emit();
    this.dispose();
  }
  private report(error: unknown): void { if (!this.disposed) { this._error = message(error); this.emit(); } }
  private uiState(): JamUiState {
    const row = this._stateRow;
    return {
      connection: this._connection, room: this._room, myRole: this._role,
      participants: [...this._participants.values()].map((p) => p.userId === this.opts.userId ? { ...p, status: this.localStatus() } : p)
        .sort((a, b) => a.role === b.role ? a.userId.localeCompare(b.userId) : a.role === "host" ? -1 : 1),
      state: row ? { trackId: row.track_id, playbackState: row.playback_state, revision: row.revision,
        expectedPosition: expectedPosition(this.timeline(row), this.serverNow()),
        startsAt: row.playback_state === "playing" && this.anchor(row) > this.serverNow() ? this.anchor(row) : null } : null,
      queue: [...this._queue], chat: [...this._chat], clock: this._clock,
      canControl: this.canControl, sleeping: this._sleeping, sleepEndsAt: this._sleepEndsAt,
      needsGesture: this._needsGesture, localStatus: this.localStatus(), error: this._error,
    };
  }
  private emit(): void {
    if (!this.disposed && this._connection === "online" && this.announcedStatus !== this.localStatus()) {
      this.announcedStatus = this.localStatus();
      void this.heartbeat();
    }
    const state = this.uiState();
    this.listeners.forEach((fn) => fn(state));
  }
}
