// ─────────────────────────────────────────────────────────────────────────────
// JamSession — client-side engine for two-person synchronized listening.
//
// Design invariants:
//  • The DATABASE (jam_room_state) is the only source of truth. Realtime
//    broadcasts are ephemeral conveniences (chat, reactions, readiness).
//  • Every device streams independently from R2; nothing audio passes
//    through the realtime layer.
//  • The live position is COMPUTED from the reference position + server
//    clock offset — never copied from another device's audio element.
//  • All control mutations flow through jam_apply_command (revision-checked,
//    host-or-collaborative-guest only). Stale revisions are rejected, not
//    applied.
//  • Reconnection recovers from authoritative state, never replays events.
// ─────────────────────────────────────────────────────────────────────────────

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { synchronizeClock, type ClockEstimate } from "./clock";
import {
  DEFAULT_DRIFT_THRESHOLDS,
  NUDGE_SETTLE_MS,
  classifyDrift,
  driftMs,
  expectedPosition,
  nudgeRate,
  clientToServerMs,
  type DriftThresholds,
} from "./timeline";

export type JamConnection = "connecting" | "online" | "reconnecting" | "ended";

export interface JamParticipantInfo {
  userId: string;
  displayName: string;
  role: "host" | "guest";
  status: string;
  lastSeen: string;
  connected: boolean; // realtime presence
}

export interface JamRoomInfo {
  id: string;
  code: string;
  hostId: string;
  guestId: string | null;
  collaborative: boolean;
  status: "open" | "active" | "ended";
}

export interface JamStateSnapshot {
  trackId: string | null;
  playbackState: "idle" | "ready" | "playing" | "paused" | "ended";
  revision: number;
  expectedPosition: number;
}

export interface JamChatMessage {
  id: string;
  userId: string;
  name: string;
  text: string;
  at: number;
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
  clock: { offsetMs: number; rttMs: number } | null;
  canControl: boolean;
  sleeping: boolean;
  sleepEndsAt: number | null;
  error: string | null;
}

/** Local playback surface the session drives (implemented around PlaybackManager). */
export interface PlayerAdapter {
  loadTrack(songIndex: number, autoplay: boolean): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  setRate(rate: number): Promise<void>;
  getPosition(): number;
  isPlaying(): boolean;
  isBuffered(): boolean;
}

/** Maps an R2 track id to its index in the local playlist. */
export type TrackResolver = (trackId: string) => number | null;

export interface JamSessionOptions {
  db: SupabaseClient;
  roomId: string;
  userId: string;
  displayName: string;
  player: PlayerAdapter;
  resolveTrack: TrackResolver;
  thresholds?: DriftThresholds;
  /** Host wait for the other participant before starting anyway. */
  readinessTimeoutMs?: number;
}

interface RoomStateRow {
  room_id: string;
  track_id: string | null;
  playback_state: JamStateSnapshot["playbackState"];
  position_seconds: number;
  revision: number;
  updated_at: string;
}

const CHAT_LIMIT = 280;
const HEARTBEAT_MS = 20_000;
const DRIFT_TICK_MS = 2_000;
const CLOCK_RESYNC_MS = 5 * 60_000;

export class JamSession {
  private opts: JamSessionOptions;
  private channel: RealtimeChannel | null = null;
  private disposed = false;

  private _room: JamRoomInfo | null = null;
  private _role: "host" | "guest" | null = null;
  private _connection: JamConnection = "connecting";
  private _stateRow: RoomStateRow | null = null;
  private _queue: JamQueueItem[] = [];
  private _chat: JamChatMessage[] = [];
  private _participants = new Map<string, JamParticipantInfo>();
  private _clock: ClockEstimate | null = null;
  private _error: string | null = null;
  private _myPresenceName: string;

  // readiness handshake
  private readyPeers = new Set<string>();
  private readinessWatch: ReturnType<typeof setTimeout> | null = null;
  private loadingTrackId: string | null = null;

  // drift correction
  private currentRate = 1;

  // sleep timer (independent per participant — local only)
  private sleepTimer: ReturnType<typeof setTimeout> | null = null;
  private _sleepEndsAt: number | null = null;
  private _sleeping = false;

  private uiListeners = new Set<(s: JamUiState) => void>();
  private timers: ReturnType<typeof setInterval>[] = [];
  private reconnectAttempt = 0;

  constructor(opts: JamSessionOptions) {
    this.opts = opts;
    this._myPresenceName = opts.displayName;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    await this.fetchRoom();
    await this.refetchState();
    await this.refetchQueue();
    await this.resyncClock();
    await this.subscribeChannel();

    this.timers.push(setInterval(() => void this.heartbeat("listening"), HEARTBEAT_MS));
    this.timers.push(setInterval(() => void this.resyncClock(), CLOCK_RESYNC_MS));
    this.timers.push(setInterval(() => this.driftTick(), DRIFT_TICK_MS));
    this.emit();
  }

  dispose(): void {
    this.disposed = true;
    this.timers.forEach(clearInterval);
    this.timers = [];
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    if (this.readinessWatch) clearTimeout(this.readinessWatch);
    if (this.channel) void this.opts.db.removeChannel(this.channel);
    this.channel = null;
    this.uiListeners.clear();
  }

  subscribe(listener: (s: JamUiState) => void): () => void {
    this.uiListeners.add(listener);
    listener(this.uiState());
    return () => this.uiListeners.delete(listener);
  }

  // ── Room bootstrap (static, before a session exists) ───────────────────────

  static async createRoom(
    db: SupabaseClient,
    collaborative: boolean,
  ): Promise<{ roomId: string; code: string }> {
    const { data, error } = await db.rpc("jam_create_room", { p_collaborative: collaborative });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as { room_id: string; room_code: string };
    return { roomId: row.room_id, code: row.room_code };
  }

  static async joinRoom(db: SupabaseClient, code: string): Promise<string> {
    const { data, error } = await db.rpc("jam_join_room", { p_code: code });
    if (error) {
      const msg = error.message;
      throw new Error(
        msg === "ROOM_NOT_FOUND"
          ? "No open room with that code. It may have expired."
          : msg === "ROOM_FULL"
            ? "This room already has two listeners."
            : msg === "ALREADY_HOST"
              ? "You are already the host of this room."
              : msg,
      );
    }
    return String(data);
  }

  // ── Commands (the only mutation path for authoritative state) ──────────────

  private async command(type: string, payload: Record<string, unknown> = {}): Promise<void> {
    if (!this._room) throw new Error("Not in a room");
    const commandId = crypto.randomUUID();
    const { error } = await this.opts.db.rpc("jam_apply_command", {
      p_room_id: this._room.id,
      p_command_id: commandId,
      p_type: type,
      p_payload: payload,
      p_expected_revision: this._stateRow?.revision ?? null,
    });
    if (error) {
      if (error.message.includes("STALE_REVISION")) {
        await this.refetchState();
        throw new Error("Someone else changed playback a moment ago — try again.");
      }
      if (error.message.includes("FORBIDDEN")) throw new Error("You cannot control this room.");
      if (error.message.includes("TRACK_ACCESS_DENIED")) {
        throw new Error("One of the participants cannot access that track.");
      }
      throw new Error(error.message);
    }
    await this.refetchState();
  }

  get canControl(): boolean {
    return (
      this._role === "host" ||
      (this._role === "guest" && this._room?.collaborative === true)
    );
  }

  async play(): Promise<void> {
    await this.command("play");
  }
  async pause(): Promise<void> {
    await this.command("pause", {
      position_seconds: this.opts.player.getPosition(),
    });
  }
  async seek(seconds: number): Promise<void> {
    await this.command("seek", { position_seconds: Math.max(0, seconds) });
  }
  async setTrack(trackId: string, positionSeconds = 0): Promise<void> {
    await this.command("set_track", { track_id: trackId, position_seconds: positionSeconds });
  }
  async skipNext(nextTrackId: string | null): Promise<void> {
    if (!nextTrackId) return;
    await this.command("set_track", { track_id: nextTrackId, position_seconds: 0 });
  }
  async setCollaborative(on: boolean): Promise<void> {
    if (this._role !== "host") throw new Error("Only the host can change this");
    await this.command("set_collaborative", { collaborative: on });
  }
  async endRoom(): Promise<void> {
    await this.command("end_room");
  }
  async leave(): Promise<void> {
    if (!this._room) return;
    await this.opts.db.rpc("jam_leave_room", { p_room_id: this._room.id });
    this._connection = "ended";
    this.emit();
    this.dispose();
  }

  // ── Queue (RLS-protected table writes; changes stream via postgres_changes)

  async addToQueue(trackId: string): Promise<void> {
    if (!this._room) return;
    const position = this._queue.length + 1;
    const { error } = await this.opts.db.from("jam_queue").insert({
      room_id: this._room.id,
      track_id: trackId,
      position,
      added_by: this.opts.userId,
    });
    if (error) throw new Error(error.message.includes("row-level-security")
      ? "You cannot add to this queue."
      : error.message);
    await this.refetchQueue();
  }

  async removeFromQueue(queueItemId: string): Promise<void> {
    if (!this._room) return;
    const { error } = await this.opts.db
      .from("jam_queue")
      .delete()
      .eq("id", queueItemId)
      .eq("room_id", this._room.id);
    if (error) throw new Error(error.message);
    await this.refetchQueue();
  }

  async reorderQueue(orderedIds: string[]): Promise<void> {
    if (!this._room) return;
    await Promise.all(
      orderedIds.map((id, i) =>
        this.opts.db
          .from("jam_queue")
          .update({ position: i + 1 })
          .eq("id", id)
          .eq("room_id", this._room.id),
      ),
    );
    await this.refetchQueue();
  }

  /** Guest suggestion when collaborative controls are off = queue add. */
  suggestTrack(trackId: string): Promise<void> {
    return this.addToQueue(trackId);
  }

  // ── Chat & reactions (ephemeral broadcast — never blocks audio sync) ───────

  sendChat(text: string): void {
    const trimmed = text.trim().slice(0, CHAT_LIMIT);
    if (!trimmed || !this.channel) return;
    this.channel.send({
      type: "broadcast",
      event: "chat",
      payload: {
        id: crypto.randomUUID(),
        userId: this.opts.userId,
        name: this._myPresenceName,
        text: trimmed,
        at: Date.now(),
      },
    });
  }

  sendReaction(emoji: string): void {
    if (!this.channel || !/^[\p{Emoji}\u200d]{1,8}$/u.test(emoji)) return;
    this.channel.send({
      type: "broadcast",
      event: "reaction",
      payload: { id: crypto.randomUUID(), userId: this.opts.userId, name: this._myPresenceName, emoji },
    });
  }

  // ── Sleep timer — strictly local; never signals the other participant ──────

  startSleepTimer(ms: number): void {
    this.cancelSleepTimer();
    this._sleepEndsAt = Date.now() + ms;
    this.sleepTimer = setTimeout(() => {
      this._sleeping = true;
      void this.opts.player.pause();
      this.emit();
    }, ms);
    this.emit();
  }

  cancelSleepTimer(): void {
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    this.sleepTimer = null;
    this._sleepEndsAt = null;
    this._sleeping = false;
    this.emit();
  }

  /** A user-initiated play clears the sleep state. */
  wake(): void {
    if (this._sleeping || this._sleepEndsAt) this.cancelSleepTimer();
  }

  // ── Player readiness (called by the hook when buffering completes) ─────────

  notifyPlayerReady(): void {
    if (!this.loadingTrackId || !this.channel) return;
    this.loadingTrackId = null;
    void this.heartbeat("ready");
    this.channel.send({
      type: "broadcast",
      event: "ready",
      payload: { userId: this.opts.userId, trackId: this._stateRow?.track_id ?? null },
    });
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private serverNow(): number {
    return clientToServerMs(Date.now(), this._clock?.offsetMs ?? 0);
  }

  private async fetchRoom(): Promise<void> {
    const { data, error } = await this.opts.db
      .from("jam_rooms")
      .select("id, code, host_id, guest_id, collaborative, status")
      .eq("id", this.opts.roomId)
      .single();
    if (error || !data) throw new Error(error?.message ?? "Room not found");
    this._room = {
      id: data.id,
      code: data.code,
      hostId: data.host_id,
      guestId: data.guest_id,
      collaborative: data.collaborative,
      status: data.status,
    };
    this._role = data.host_id === this.opts.userId ? "host" : "guest";
  }

  private async refetchState(): Promise<void> {
    const { data, error } = await this.opts.db
      .from("jam_room_state")
      .select("*")
      .eq("room_id", this.opts.roomId)
      .single();
    if (error || !data) return;
    await this.applyStateRow(data as RoomStateRow, true);
  }

  private async refetchQueue(): Promise<void> {
    const { data } = await this.opts.db
      .from("jam_queue")
      .select("id, track_id, position, added_by, tracks(title, artist)")
      .eq("room_id", this.opts.roomId)
      .order("position", { ascending: true });
    if (!data) return;
    this._queue = data.map((row) => {
      const t = row.tracks as { title?: string; artist?: string } | null;
      return {
        id: row.id,
        trackId: row.track_id,
        title: t?.title ?? "Unknown track",
        artist: t?.artist ?? "",
        addedBy: row.added_by,
      };
    });
    this.emit();
  }

  private async applyStateRow(row: RoomStateRow, initial = false): Promise<void> {
    const previous = this._stateRow;
    this._stateRow = row;

    const trackChanged = previous?.track_id !== row.track_id;
    const playStateChanged = previous?.playback_state !== row.playback_state;

    if (trackChanged) {
      this.readyPeers.clear();
      if (this.readinessWatch) clearTimeout(this.readinessWatch);
      this.readinessWatch = null;
      this.loadingTrackId = row.track_id;
      if (row.track_id) {
        const index = this.opts.resolveTrack(row.track_id);
        if (index == null) {
          this._error = "This track is not in your library copy — refresh the page.";
        } else {
          await this.opts.player.loadTrack(index, false);
          void this.heartbeat("buffering");
        }
      }
    }

    if (playStateChanged || initial) {
      if (row.playback_state === "paused" || row.playback_state === "ended") {
        await this.opts.player.pause();
      } else if (row.playback_state === "playing") {
        // Align before playing: a paused→playing transition always carries a
        // fresh reference position; the drift loop polishes the rest.
        const target = expectedPosition(
          {
            positionSeconds: row.position_seconds,
            updatedAt: new Date(row.updated_at).getTime(),
            playbackState: row.playback_state,
          },
          this.serverNow(),
        );
        if (Math.abs(this.opts.player.getPosition() - target) > DEFAULT_DRIFT_THRESHOLDS.seek / 1000) {
          await this.opts.player.seek(target);
        }
        this.wake();
        await this.opts.player.play();
      }
    }

    // Host: run the readiness handshake for a freshly-loaded track
    if (
      this._role === "host" &&
      row.track_id &&
      row.playback_state === "idle"
    ) {
      this.armReadinessHandshake(row.track_id);
    }

    this.emit();
  }

  private armReadinessHandshake(trackId: string): void {
    if (this.readinessWatch) return; // already armed
    this.readinessWatch = setTimeout(() => {
      this.readinessWatch = null;
      // A slow or absent participant must not block the room forever
      void this.command("start_at", { position_seconds: 0 }).catch(() => {});
    }, this.opts.readinessTimeoutMs ?? 5000);
  }

  private async resyncClock(): Promise<void> {
    try {
      const estimate = await synchronizeClock(async () => {
        const { data, error } = await this.opts.db.rpc("server_time");
        if (error) throw new Error(error.message);
        return new Date(String(data)).getTime();
      });
      if (estimate) this._clock = estimate;
      this.emit();
    } catch {
      /* clock resync is best-effort; keep the last estimate */
    }
  }

  private async heartbeat(status: string): Promise<void> {
    if (this.disposed || !this._room) return;
    await this.opts.db.rpc("jam_heartbeat", {
      p_room_id: this._room.id,
      p_status: status,
    });
  }

  private async subscribeChannel(): Promise<void> {
    if (this.disposed) return;
    const old = this.channel;
    if (old) {
      this.opts.db.removeChannel(old);
      this.channel = null;
    }

    const channel = this.opts.db.channel(`jam:${this.opts.roomId}`, {
      config: { presence: { key: this.opts.userId } },
    });

    channel
      .on("presence", { event: "sync" }, () => this.handlePresenceSync())
      .on("broadcast", { event: "ready" }, ({ payload }) => {
        this.readyPeers.add(String(payload.userId));
        // Host: start as soon as both sides are ready (no artificial delay)
        if (
          this._role === "host" &&
          this._stateRow?.playback_state === "idle" &&
          this._room &&
          this.readyPeers.has(this._room.hostId) &&
          this._room.guestId &&
          this.readyPeers.has(this._room.guestId)
        ) {
          if (this.readinessWatch) {
            clearTimeout(this.readinessWatch);
            this.readinessWatch = null;
          }
          void this.command("start_at", { position_seconds: 0 }).catch(() => {});
        }
      })
      .on("broadcast", { event: "chat" }, ({ payload }) => {
        this._chat = [
          ...this._chat.slice(-99),
          {
            id: String(payload.id),
            userId: String(payload.userId),
            name: String(payload.name ?? "Guest"),
            text: String(payload.text ?? "").slice(0, CHAT_LIMIT),
            at: Number(payload.at ?? Date.now()),
          },
        ];
        this.emit();
      })
      .on("broadcast", { event: "reaction" }, ({ payload }) => {
        this._chat = [
          ...this._chat.slice(-99),
          {
            id: String(payload.id),
            userId: String(payload.userId),
            name: String(payload.name ?? "Guest"),
            text: String(payload.emoji ?? "❤️"),
            at: Date.now(),
          },
        ];
        this.emit();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "jam_room_state" }, (payload) => {
        const row = (payload.new ?? payload.old) as RoomStateRow | null;
        if (row && row.room_id === this.opts.roomId) void this.applyStateRow(row);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "jam_queue" }, () => {
        void this.refetchQueue();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "jam_participants" }, () => {
        void this.fetchParticipants();
      })
      .subscribe(async (status, err) => {
        if (status === "SUBSCRIBED") {
          this._connection = this._role ? "online" : "connecting";
          this.reconnectAttempt = 0;
          await channel.track({
            user_id: this.opts.userId,
            name: this._myPresenceName,
            role: this._role,
          });
          if (this._role) {
            await this.heartbeat("listening");
            await this.fetchParticipants();
          }
          this.emit();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          if (this.disposed || this._connection === "ended") return;
          this._connection = "reconnecting";
          void this.heartbeat("reconnecting");
          this.emit();
          this.scheduleReconnect();
        }
        void err;
      });

    this.channel = channel;
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    const delay = Math.min(30_000, 1000 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    setTimeout(() => {
      if (this.disposed || this._connection === "ended") return;
      void (async () => {
        // Recover from authoritative state, not from replayed events
        await this.resyncClock().catch(() => {});
        await this.fetchRoom().catch(() => {});
        await this.refetchState().catch(() => {});
        await this.refetchQueue().catch(() => {});
        await this.subscribeChannel();
      })();
    }, delay);
  }

  private async fetchParticipants(): Promise<void> {
    const { data } = await this.opts.db
      .from("jam_participants")
      .select("user_id, role, status, last_seen, profiles(display_name)")
      .eq("room_id", this.opts.roomId);
    if (!data) return;
    for (const row of data) {
      const existing = this._participants.get(row.user_id);
      this._participants.set(row.user_id, {
        userId: row.user_id,
        displayName:
          (row.profiles as { display_name?: string } | null)?.display_name ??
          existing?.displayName ??
          "Listener",
        role: row.role,
        status: row.status,
        lastSeen: row.last_seen,
        connected: existing?.connected ?? false,
      });
    }
    this.emit();
  }

  private handlePresenceSync(): void {
    if (!this.channel) return;
    const presence = this.channel.presenceState<{
      user_id: string;
      name: string;
      role: string;
    }>();
    const online = new Set<string>();
    for (const key of Object.keys(presence)) {
      for (const p of presence[key]) {
        online.add(p.user_id ?? key);
        const existing = this._participants.get(p.user_id ?? key);
        if (existing) {
          this._participants.set(p.user_id ?? key, {
            ...existing,
            displayName: p.name ?? existing.displayName,
            connected: true,
          });
        } else {
          this._participants.set(p.user_id ?? key, {
            userId: p.user_id ?? key,
            displayName: p.name ?? "Listener",
            role: p.user_id === this._room?.hostId ? "host" : "guest",
            status: "listening",
            lastSeen: new Date().toISOString(),
            connected: true,
          });
        }
      }
    }
    for (const [id, p] of this._participants) {
      if (!online.has(id)) this._participants.set(id, { ...p, connected: false });
    }
    this.emit();
  }

  /** Adaptive drift correction — runs locally on every participant. */
  private driftTick(): void {
    if (
      this.disposed ||
      this._sleeping ||
      !this._stateRow ||
      this._stateRow.playback_state !== "playing" ||
      !this.opts.player.isPlaying()
    ) {
      return;
    }

    const timeline = {
      positionSeconds: this._stateRow.position_seconds,
      updatedAt: new Date(this._stateRow.updated_at).getTime(),
      playbackState: this._stateRow.playback_state,
    };
    const drift = driftMs(timeline, this.serverNow(), this.opts.player.getPosition());
    const correction = classifyDrift(drift, DEFAULT_DRIFT_THRESHOLDS);

    if (correction === "seek") {
      this.currentRate = 1;
      void this.opts.player.setRate(1);
      void this.opts.player.seek(expectedPosition(timeline, this.serverNow()));
    } else if (correction === "nudge") {
      this.currentRate = nudgeRate(drift);
      void this.opts.player.setRate(this.currentRate);
    } else if (Math.abs(drift) < NUDGE_SETTLE_MS && this.currentRate !== 1) {
      this.currentRate = 1;
      void this.opts.player.setRate(1);
    }
  }

  private uiState(): JamUiState {
    const participants = [...this._participants.values()].sort((a, b) =>
      a.role === b.role ? a.userId.localeCompare(b.userId) : a.role === "host" ? -1 : 1,
    );
    return {
      connection: this._connection,
      room: this._room,
      myRole: this._role,
      participants,
      state: this._stateRow
        ? {
            trackId: this._stateRow.track_id,
            playbackState: this._stateRow.playback_state,
            revision: this._stateRow.revision,
            expectedPosition: expectedPosition(
              {
                positionSeconds: this._stateRow.position_seconds,
                updatedAt: new Date(this._stateRow.updated_at).getTime(),
                playbackState: this._stateRow.playback_state,
              },
              this.serverNow(),
            ),
          }
        : null,
      queue: [...this._queue],
      chat: [...this._chat],
      clock: this._clock ? { offsetMs: this._clock.offsetMs, rttMs: this._clock.rttMs } : null,
      canControl: this.canControl,
      sleeping: this._sleeping,
      sleepEndsAt: this._sleepEndsAt,
      error: this._error,
    };
  }

  private emit(): void {
    const state = this.uiState();
    this.uiListeners.forEach((l) => l(state));
  }
}
