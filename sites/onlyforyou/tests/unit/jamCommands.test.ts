import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { JamSession, type JamUiState, type PlayerAdapter, type RoomStateRow } from "../../lib/jam/JamSession";
import { attachJamTransport, type JamTransportHandlers } from "../../lib/jam/transport";

type Callback = (payload: any) => void;
const sessions: JamSession[] = [];

/** Snake_case PostgREST rows and a controllable Realtime channel, no live service. */
function harness(actor = "host", collaborative = false, initial: Partial<RoomStateRow> = {}) {
  const room = { id: "room-1", code: "ABC123", host_id: "host", guest_id: "guest" as string | null, collaborative, status: "active",
    expires_at: new Date(Date.now() + 12 * 60 * 60_000).toISOString() };
  let row: RoomStateRow = { room_id: room.id, track_id: "track-a", playback_state: "paused", position_seconds: 12,
    revision: 0, track_revision: 0, updated_at: new Date().toISOString(), ...initial };
  const participants = new Map(["host", "guest"].map((id) => [id, { user_id: id, role: id === "host" ? "host" : "guest",
    status: "joining", last_seen: new Date().toISOString(), ready_track_id: null as string | null, ready_revision: null as number | null,
    profiles: { display_name: id } }]));
  const messages: any[] = [];
  let failMessage = false;
  let queue = [{ id: "qa", track_id: "track-a", position: 1, added_by: "host", tracks: { title: "A", artist: "Artist" } },
    { id: "qb", track_id: "track-b", position: 2, added_by: "host", tracks: { title: "B", artist: "Artist" } }];
  const channels: any[] = [];
  const applied = new Map<string, number>();
  let loseResponse = false;
  const rpc = vi.fn((fn: string, args: any = {}) => query(async () => {
    if (fn === "server_time") return { data: new Date().toISOString(), error: null };
    if (fn === "jam_heartbeat") {
      const p = participants.get(actor)!; p.status = args.p_status; p.last_seen = new Date().toISOString();
      if (["buffering", "disconnected", "reconnecting"].includes(p.status)) { p.ready_track_id = null; p.ready_revision = null; }
      return { data: null, error: null };
    }
    if (fn === "jam_set_ready") {
      if (args.p_expected_revision !== row.revision) return { data: null, error: { message: "STALE_REVISION" } };
      const p = participants.get(actor)!;
      p.ready_track_id = args.p_track_id; p.ready_revision = row.track_revision ?? row.revision; p.status = "ready";
      return { data: null, error: null };
    }
    if (fn === "jam_send_message") {
      if (failMessage) return { data: null, error: { message: "RATE_LIMITED" } };
      const item = { id: args.p_message_id, user_id: actor, room_id: room.id, name: actor,
        text: args.p_text, kind: args.p_kind, created_at: new Date().toISOString() };
      messages.push(item); return { data: item, error: null };
    }
    if (fn === "jam_leave_room") { if (actor === "host") room.status = "ended"; return { data: null, error: null }; }
    if (fn !== "jam_apply_command") throw new Error(`Unexpected RPC ${fn}`);
    const { p_command_id: id, p_type: type, p_payload: payload, p_expected_revision: rev } = args;
    if (applied.has(id)) return { data: { revision: applied.get(id) }, error: null };
    if (room.status === "ended") return { data: null, error: { message: "ROOM_ENDED", code: "P0001" } };
    if (actor !== "host" && (type !== "suggest_track" && (!room.collaborative || ["end_room", "set_collaborative", "queue_add", "queue_remove", "queue_reorder", "start_at"].includes(type)))) {
      return { data: null, error: { message: "FORBIDDEN", code: "P0001" } };
    }
    if (rev !== row.revision) return { data: null, error: { message: "STALE_REVISION", code: "P0001" } };
    if (payload.track_id === "denied") return { data: null, error: { message: "TRACK_ACCESS_DENIED", code: "P0001" } };
    if (["play", "start_at"].includes(type) && [room.host_id, room.guest_id].filter(Boolean).some((id) => {
      const p = participants.get(id!)!;
      return p.ready_track_id !== row.track_id || p.ready_revision !== row.track_revision || ["buffering", "joining", "disconnected", "reconnecting"].includes(p.status);
    })) return { data: null, error: { message: "NOT_READY", code: "P0001" } };
    row = { ...row, revision: row.revision + 1, updated_at: new Date().toISOString() };
    if (type === "play" || type === "start_at") row.playback_state = "playing";
    if (type === "pause") row.playback_state = "paused";
    if (type === "seek") row.position_seconds = payload.position_seconds;
    let selectedTrack = payload.track_id;
    if (type === "skip_next") {
      const first = queue.shift();
      if (!first) return { data: null, error: { message: "QUEUE_EMPTY", code: "P0001" } };
      selectedTrack = first.track_id;
    }
    if (type === "set_track" || type === "skip_next") {
      row.track_id = selectedTrack; row.position_seconds = type === "skip_next" ? 0 : payload.position_seconds;
      row.playback_state = "idle"; row.track_revision = row.revision;
      participants.forEach((p) => { p.ready_track_id = null; p.ready_revision = null; p.status = "buffering"; });
      if (type === "set_track" && payload.queue_item_id) queue = queue.filter((q) => q.id !== payload.queue_item_id);
    }
    if (type === "start_at") row.updated_at = payload.start_at;
    if (type === "set_collaborative") room.collaborative = payload.collaborative;
    if (type === "end_room") { room.status = "ended"; row.playback_state = "ended"; }
    if (type === "queue_remove") queue = queue.filter((q) => q.id !== payload.queue_item_id);
    applied.set(id, row.revision);
    if (loseResponse) { loseResponse = false; throw new TypeError("Failed to fetch after server commit"); }
    return { data: { revision: row.revision }, error: null };
  }));
  const from = vi.fn((table: string) => query(async () => {
    if (table === "jam_rooms") return { data: { ...room }, error: null };
    if (table === "jam_room_state") return { data: { ...row }, error: null };
    if (table === "jam_queue") return { data: queue.map((q) => ({ ...q })), error: null };
    if (table === "jam_participants") return { data: [...participants.values()].map((p) => ({ ...p })), error: null };
    if (table === "jam_messages") return { data: [...messages].reverse(), error: null };
    throw new Error(`Unexpected table ${table}`);
  }));
  const db = {
    rpc, from,
    channel: vi.fn((_topic: string, config: unknown) => {
      const handlers: { type: string; filter: any; fn: Callback }[] = [];
      const channel = {
        config, handlers, status: null as Callback | null, presence: {} as Record<string, any[]>,
        on(type: string, filter: any, fn: Callback) { handlers.push({ type, filter, fn }); return channel; },
        subscribe(fn: Callback) { channel.status = fn; queueMicrotask(() => fn("SUBSCRIBED")); return channel; },
        track: vi.fn(async (p: any) => { channel.presence[actor] = [p]; return "ok"; }),
        presenceState: () => channel.presence,
        send: vi.fn(async () => "ok"),
        emit(type: string, filter: string, payload: any) {
          handlers.filter((h) => h.type === type && (h.filter.event === filter || h.filter.table === filter)).forEach((h) => h.fn(payload));
        },
      };
      channels.push(channel);
      return channel;
    }),
    removeChannel: vi.fn(async (channel: any) => { channel.status?.("CLOSED"); return "ok"; }),
  };
  let position = 0;
  let playing = false;
  let buffered = true;
  let duration = 1_000;
  const player: PlayerAdapter = {
    loadTrack: vi.fn(async () => {}), play: vi.fn(async () => { playing = true; }),
    pause: vi.fn(async () => { playing = false; }), seek: vi.fn(async (s) => { position = s; }),
    setRate: vi.fn(async () => {}), getPosition: () => position, isPlaying: () => playing,
    isBuffered: () => buffered, getDuration: () => duration,
  };
  const session = new JamSession({ db: db as unknown as SupabaseClient, roomId: room.id, userId: actor,
    displayName: actor, player, resolveTrack: (id) => id === "track-a" ? 0 : id === "track-b" ? 1 : null,
    readinessTimeoutMs: 500 });
  sessions.push(session);
  let state: JamUiState;
  session.subscribe((s) => { state = s; });
  return {
    db, session, player, channels, room, commands: () => rpc.mock.calls.filter(([name]) => name === "jam_apply_command").map(([, args]) => args),
    state: () => state!, row: () => row, setRow: (change: Partial<RoomStateRow>) => { row = { ...row, ...change }; },
    loseResponse: () => { loseResponse = true; }, buffered: (value: boolean) => { buffered = value; },
    failMessage: () => { failMessage = true; },
    removeQueue: (id: string) => { queue = queue.filter((q) => q.id !== id); },
    ready: (id: string, trackId = row.track_id, revision = row.track_revision ?? row.revision) => {
      const p = participants.get(id)!; p.ready_track_id = trackId; p.ready_revision = revision; p.status = "ready";
      p.last_seen = new Date().toISOString();
      channels.at(-1)?.emit("postgres_changes", "jam_participants", { new: { ...p } });
    },
    position: (value: number) => { position = value; }, duration: (value: number) => { duration = value; },
    push: (change: Partial<RoomStateRow>) => { row = { ...row, ...change }; channels.at(-1)?.emit("postgres_changes", "jam_room_state", { new: { ...row } }); },
  };
}

function query(run: () => Promise<any>) {
  const builder: any = {
    select: () => builder, eq: () => builder, order: () => builder, limit: () => builder, single: () => builder, abortSignal: () => builder,
    then: (resolve: any, reject: any) => run().then(resolve, reject),
  };
  return builder;
}
async function flush() { for (let i = 0; i < 100; i++) await Promise.resolve(); }
async function start(h: ReturnType<typeof harness>) { await h.session.start(); await flush(); }
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date", "performance", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] }); vi.setSystemTime(new Date("2026-10-03T12:00:00Z")); });
afterEach(() => { sessions.splice(0).forEach((s) => s.dispose()); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("authoritative commands and state ordering", () => {
  it("serializes simultaneous local commands with fresh expected revisions", async () => {
    const h = harness(); await start(h);
    await Promise.all([h.session.seek(20), h.session.seek(30)]);
    expect(h.commands().map((c) => c.p_expected_revision)).toEqual([0, 1]);
    expect(h.state().state?.revision).toBe(2);
    expect(h.player.getPosition()).toBe(30);
  });
  it("retries an ambiguous commit with the identical command ID/payload/revision", async () => {
    const h = harness(); await start(h); h.loseResponse();
    await h.session.seek(42);
    expect(h.commands()).toHaveLength(2);
    expect(h.commands()[0]).toEqual(h.commands()[1]);
    expect(h.row().revision).toBe(1);
    expect(h.player.getPosition()).toBe(42);
  });
  it("refetches a stale revision and rejects the intention without replay", async () => {
    const h = harness(); await start(h); h.setRow({ revision: 7, position_seconds: 70 });
    await expect(h.session.seek(20)).rejects.toThrow("Someone else changed playback");
    expect(h.state().state?.revision).toBe(7);
    expect(h.commands()).toHaveLength(1);
    expect(h.player.getPosition()).toBe(70);
  });
  it("ignores duplicate and out-of-order realtime rows", async () => {
    const h = harness(); await start(h);
    h.push({ revision: 5, position_seconds: 50 }); await flush();
    const seeks = vi.mocked(h.player.seek).mock.calls.length;
    h.push({ revision: 2, position_seconds: 2 });
    h.push({ revision: 5, position_seconds: 999 }); await flush();
    expect(h.state().state?.revision).toBe(5);
    expect(h.player.getPosition()).toBe(50);
    expect(h.player.seek).toHaveBeenCalledTimes(seeks);
  });
  it("applies paused seeks and tracks changed while already playing", async () => {
    const h = harness(); await start(h);
    h.push({ revision: 1, position_seconds: 22 }); await flush();
    expect(h.player.getPosition()).toBe(22);
    h.push({ revision: 2, playback_state: "playing" }); await flush();
    h.push({ revision: 3, track_id: "track-b", position_seconds: 0 }); await flush();
    expect(h.player.loadTrack).toHaveBeenLastCalledWith(1, false);
    expect(h.player.isPlaying()).toBe(true);
  });
  it("coalesces revisions during a slow load without playing the superseded track", async () => {
    const h = harness(); await start(h);
    let release!: () => void;
    vi.mocked(h.player.loadTrack).mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    h.push({ revision: 1, track_id: "track-b", playback_state: "playing" }); await flush();
    h.push({ revision: 2, track_id: "track-a", playback_state: "paused", position_seconds: 9 }); await flush();
    release(); await flush();
    expect(h.player.play).not.toHaveBeenCalled();
    expect(h.player.loadTrack).toHaveBeenLastCalledWith(0, false);
    expect(h.player.getPosition()).toBe(9);
  });
  it("pause uses the server timeline rather than a lagging local position", async () => {
    const h = harness(); await start(h); h.position(0);
    await h.session.pause();
    expect(h.commands()[0].p_payload).toEqual({});
  });
});

describe("permissions and queue contract", () => {
  it("read-only guest cannot mutate playback but can suggest through the RPC", async () => {
    const h = harness("guest"); await start(h);
    await expect(h.session.play()).rejects.toThrow("You cannot control");
    await expect(h.session.addToQueue("track-b")).rejects.toThrow("You cannot control");
    await h.session.suggestTrack("track-b");
    expect(h.commands()[0].p_type).toBe("suggest_track");
  });
  it("collaborative guest can seek but cannot end/manage the host queue", async () => {
    const h = harness("guest", true); await start(h);
    await h.session.seek(33);
    await expect(h.session.endRoom()).rejects.toThrow("You cannot control");
    await expect(h.session.removeFromQueue("qa")).rejects.toThrow("You cannot control");
    expect(h.player.getPosition()).toBe(33);
  });
  it("host reorders via one atomic command and rejects invalid permutations", async () => {
    const h = harness(); await start(h);
    await expect(h.session.reorderQueue(["qa", "qa"])).rejects.toThrow("queue changed");
    await h.session.reorderQueue(["qb", "qa"]);
    expect(h.commands()[0]).toMatchObject({ p_type: "queue_reorder", p_payload: { ordered_ids: ["qb", "qa"] } });
  });
  it("explicit next consumes a queue entry atomically rather than inferring from track IDs", async () => {
    const h = harness(); await start(h);
    await h.session.skipNext();
    expect(h.commands()[0].p_type).toBe("skip_next");
    expect(h.state().queue.map((q) => q.id)).toEqual(["qb"]);
  });
  it("host-selected queue playback consumes the entry atomically", async () => {
    const h = harness(); await start(h);
    await h.session.playQueueItem("qb");
    expect(h.commands()[0]).toMatchObject({ p_type: "set_track", p_payload: { track_id: "track-b", queue_item_id: "qb" } });
    expect(h.state().queue.map((q) => q.id)).toEqual(["qa"]);
  });
  it("recovers queue deletions from the state revision even without a filtered DELETE", async () => {
    const h = harness("guest"); await start(h);
    h.removeQueue("qb"); h.push({ revision: 1 }); await flush();
    expect(h.state().queue.map((q) => q.id)).toEqual(["qa"]);
  });
  it("reports DB rejection for either listener's track permission", async () => {
    const h = harness(); await start(h);
    await expect(h.session.setTrack("denied")).rejects.toThrow("Both listeners need permission");
    expect(h.player.loadTrack).toHaveBeenCalledTimes(1);
  });
  it("refreshes room metadata so collaboration changes immediately affect permission", async () => {
    const h = harness(); await start(h);
    await h.session.setCollaborative(true);
    expect(h.state().room?.collaborative).toBe(true);
  });
});

describe("readiness and scheduled playback", () => {
  it("records local readiness and starts once both revision-scoped signals arrive", async () => {
    const h = harness("host", false, { playback_state: "idle", position_seconds: 7 }); await start(h);
    h.ready("guest", "old", 0); await flush();
    h.ready("guest", "track-a", 9);
    await flush(); expect(h.commands()).toHaveLength(0);
    h.ready("guest", "track-a", 0);
    h.ready("guest", "track-a", 0);
    await flush();
    expect(h.commands()).toHaveLength(1);
    expect(h.commands()[0].p_payload.position_seconds).toBe(7);
    expect(Date.parse(h.commands()[0].p_payload.start_at) - Date.now()).toBe(1_200);
    expect(h.player.isPlaying()).toBe(false);
    await vi.advanceTimersByTimeAsync(1_199); expect(h.player.isPlaying()).toBe(false);
    await vi.advanceTimersByTimeAsync(1); expect(h.player.isPlaying()).toBe(true);
    expect(h.player.getPosition()).toBe(7);
  });
  it("bounds the readiness wait and reports NOT_READY without forcing the DB", async () => {
    const h = harness("host", false, { playback_state: "idle", position_seconds: 0 }); h.buffered(false); await start(h);
    await vi.advanceTimersByTimeAsync(500);
    expect(h.commands()).toHaveLength(1);
    expect(h.commands()[0].p_type).toBe("start_at");
    expect(h.state().error).toContain("Both listeners must be ready");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(h.commands()).toHaveLength(1);
    expect(h.player.play).not.toHaveBeenCalled();
  });
  it("starts after authoritative late readiness following a bounded timeout", async () => {
    const h = harness("host", false, { playback_state: "idle", position_seconds: 0 }); await start(h);
    await vi.advanceTimersByTimeAsync(500);
    expect(h.state().error).toContain("Both listeners must be ready");
    h.ready("guest"); await flush();
    expect(h.commands()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1_200);
    expect(h.player.isPlaying()).toBe(true);
  });
  it("preserves track-scoped readiness across unrelated queue revisions", async () => {
    const h = harness("host", false, { playback_state: "idle", position_seconds: 0 }); await start(h);
    const readyCalls = h.db.rpc.mock.calls.filter(([name]) => name === "jam_set_ready").length;
    await h.session.addToQueue("track-b");
    expect(h.db.rpc.mock.calls.filter(([name]) => name === "jam_set_ready")).toHaveLength(readyCalls);
    h.ready("guest", "track-a", 0); await flush();
    expect(h.commands().at(-1)).toMatchObject({ p_type: "start_at", p_expected_revision: 1 });
  });
  it("recovers a late join to the current expected position", async () => {
    const h = harness("guest", false, { playback_state: "playing", position_seconds: 10, updated_at: new Date(Date.now() - 5_000).toISOString() });
    await start(h);
    expect(h.player.getPosition()).toBe(15);
    expect(h.player.isPlaying()).toBe(true);
  });
  it("cancels a scheduled start when pause supersedes it", async () => {
    const h = harness("guest", false, { playback_state: "playing", position_seconds: 25, updated_at: new Date(Date.now() + 1_200).toISOString() });
    await start(h);
    h.push({ revision: 1, playback_state: "paused", updated_at: new Date().toISOString() }); await flush();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(h.player.play).not.toHaveBeenCalled();
    expect(h.player.getPosition()).toBe(25);
  });
});

describe("lifecycle, drift, sleep, and ephemeral communication", () => {
  it("uses private room filters and installs handlers/timers only once", async () => {
    const h = harness(); await Promise.all([h.session.start(), h.session.start()]); await flush();
    expect(h.channels).toHaveLength(1);
    expect(h.channels[0].config.config.private).toBe(true);
    const changes = h.channels[0].handlers.filter((handler: any) => handler.type === "postgres_changes");
    expect(changes).toHaveLength(5);
    expect(changes.every((handler: any) => handler.filter.filter.includes("room-1"))).toBe(true);
  });
  it("coalesces failures into one backoff and keeps audio playing on disconnect/dispose", async () => {
    const h = harness("guest", false, { playback_state: "playing" }); await start(h);
    const pauses = vi.mocked(h.player.pause).mock.calls.length;
    h.channels[0].status("CHANNEL_ERROR"); h.channels[0].status("TIMED_OUT"); h.channels[0].status("CLOSED");
    await vi.advanceTimersByTimeAsync(1_300); await flush();
    expect(h.channels).toHaveLength(2);
    expect(h.state().connection).toBe("online");
    h.session.dispose(); await vi.advanceTimersByTimeAsync(60_000);
    expect(h.player.pause).toHaveBeenCalledTimes(pauses);
    expect(h.player.isPlaying()).toBe(true);
    expect(h.channels).toHaveLength(2);
  });
  it("fetches authoritative state after resubscription and makes old callbacks inert", async () => {
    const h = harness("guest"); await start(h);
    const old = h.channels[0]; old.status("CHANNEL_ERROR");
    h.setRow({ revision: 9, position_seconds: 90 });
    await vi.advanceTimersByTimeAsync(1_300); await flush();
    expect(h.player.getPosition()).toBe(90);
    old.emit("postgres_changes", "jam_room_state", { new: { ...h.row(), revision: 100, position_seconds: 999 } }); await flush();
    expect(h.state().state?.revision).toBe(9);
  });
  it("recovers state on visibility return and releases lifecycle handlers on end", async () => {
    const win = new EventTarget(); const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
    vi.stubGlobal("window", win); vi.stubGlobal("document", doc);
    const h = harness("guest"); await start(h);
    doc.visibilityState = "hidden"; doc.dispatchEvent(new Event("visibilitychange"));
    h.setRow({ revision: 4, position_seconds: 44 });
    doc.visibilityState = "visible"; doc.dispatchEvent(new Event("visibilitychange")); await flush();
    expect(h.player.getPosition()).toBe(44);
    h.room.status = "ended"; h.channels[0].emit("postgres_changes", "jam_rooms", { new: h.room }); await flush();
    expect(h.state().connection).toBe("ended");
    const requests = h.db.from.mock.calls.length;
    doc.dispatchEvent(new Event("visibilitychange")); await vi.advanceTimersByTimeAsync(30_000);
    expect(h.db.from).toHaveBeenCalledTimes(requests);
  });
  it("freeze detaches the channel without pausing audio; resume fetches latest state", async () => {
    const win = new EventTarget(); const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
    vi.stubGlobal("window", win); vi.stubGlobal("document", doc);
    const h = harness("guest", false, { playback_state: "playing" }); await start(h);
    doc.dispatchEvent(new Event("freeze")); await flush();
    expect(h.player.isPlaying()).toBe(true);
    h.setRow({ revision: 5, playback_state: "paused", position_seconds: 55 });
    doc.dispatchEvent(new Event("resume")); await flush();
    expect(h.player.isPlaying()).toBe(false); expect(h.player.getPosition()).toBe(55);
    expect(h.channels).toHaveLength(2);
  });
  it("hard drift seeks have cooldown and skip buffering", async () => {
    const h = harness("guest", false, { playback_state: "playing", position_seconds: 0 }); await start(h);
    vi.mocked(h.player.seek).mockClear();
    await vi.advanceTimersByTimeAsync(1_000); expect(h.player.seek).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(6_000); expect(h.player.seek).toHaveBeenCalledTimes(1);
    h.buffered(false); await vi.advanceTimersByTimeAsync(3_000); expect(h.player.seek).toHaveBeenCalledTimes(1);
    h.buffered(true); await vi.advanceTimersByTimeAsync(1_000); expect(h.player.seek).toHaveBeenCalledTimes(2);
  });
  it("guest ended never advances even in collaborative mode; host ended deduplicates", async () => {
    const guest = harness("guest", true, { playback_state: "playing" }); await start(guest);
    await guest.session.onEnded(); expect(guest.commands()).toHaveLength(0);
    const host = harness("host", false, { playback_state: "playing" }); await start(host);
    await Promise.all([host.session.onEnded(), host.session.onEnded()]);
    expect(host.commands().filter((c) => c.p_type === "skip_next")).toHaveLength(1);
  });
  it("sleep remains local across remote track/play revisions and catches up only on local wake", async () => {
    const h = harness("guest", false, { playback_state: "playing" }); await start(h);
    h.session.startSleepTimer(500); await vi.advanceTimersByTimeAsync(500);
    expect(h.state().sleeping).toBe(true); expect(h.player.isPlaying()).toBe(false);
    h.push({ revision: 1, track_id: "track-b", position_seconds: 20 }); await flush();
    expect(h.state().sleeping).toBe(true); expect(h.player.loadTrack).toHaveBeenCalledTimes(1);
    expect(h.commands()).toHaveLength(0);
    await h.session.resumeLocal();
    expect(h.state().sleeping).toBe(false); expect(h.player.isPlaying()).toBe(true);
    expect(h.player.loadTrack).toHaveBeenLastCalledWith(1, false);
  });
  it("shows local audio-gesture failure and retries without changing the room", async () => {
    const h = harness("guest", false, { playback_state: "playing" });
    const play = vi.mocked(h.player.play).getMockImplementation()!;
    vi.mocked(h.player.play).mockRejectedValue(new Error("Autoplay blocked"));
    await start(h);
    expect(h.state().needsGesture).toBe(true);
    vi.mocked(h.player.play).mockImplementation(play);
    await h.session.resumeLocal();
    expect(h.state().needsGesture).toBe(false); expect(h.commands()).toHaveLength(0);
  });
  it("echoes own chat, deduplicates authoritative messages, rejects wrong rooms, and reports RPC failure", async () => {
    const h = harness(); await start(h);
    h.session.sendChat("  hello  "); await flush();
    expect(h.state().chat[0]).toMatchObject({ text: "hello", delivery: "sent" });
    const channel = h.channels[0];
    const payload = { id: "chat-1", room_id: "room-1", user_id: "guest", text: "hi", name: "guest", created_at: new Date().toISOString() };
    channel.emit("postgres_changes", "jam_messages", { new: payload }); channel.emit("postgres_changes", "jam_messages", { new: payload });
    channel.emit("postgres_changes", "jam_messages", { new: { ...payload, id: "outside", room_id: "outside" } });
    expect(h.state().chat).toHaveLength(2); expect(h.state().chat.find((m) => m.id === "chat-1")?.name).toBe("guest");
    h.failMessage(); h.session.sendReaction("❤️"); await flush();
    expect(h.state().chat.find((m) => m.text === "❤️")?.delivery).toBe("failed");
  });
  it("remote room end cleans up and does not stop independently buffered audio", async () => {
    const h = harness("guest", false, { playback_state: "playing" }); await start(h);
    const pauses = vi.mocked(h.player.pause).mock.calls.length;
    h.room.status = "ended"; h.channels[0].emit("postgres_changes", "jam_rooms", { new: h.room }); await flush();
    expect(h.state().connection).toBe("ended"); expect(h.state().canControl).toBe(false);
    expect(h.db.removeChannel).toHaveBeenCalled(); expect(h.player.pause).toHaveBeenCalledTimes(pauses);
    expect(h.player.isPlaying()).toBe(true);
  });
  it("restores solo at known expiry even when room RLS would hide the terminal row", async () => {
    const h = harness("guest", false, { playback_state: "playing" });
    h.room.expires_at = new Date(Date.now() + 1_000).toISOString(); await start(h);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(h.state().connection).toBe("ended");
    expect(h.player.isPlaying()).toBe(true);
  });
  it("recovers durable chat missed during a disconnection", async () => {
    const h = harness(); await start(h);
    h.session.sendChat("saved in this room"); await flush();
    h.channels[0].status("CHANNEL_ERROR");
    await h.db.rpc("jam_send_message", { p_room_id: "room-1", p_message_id: "missed", p_text: "while disconnected", p_kind: "chat" });
    await vi.advanceTimersByTimeAsync(1_300); await flush();
    expect(h.state().chat.map((m) => m.text)).toContain("while disconnected");
    expect(h.state().chat.filter((m) => m.text === "saved in this room")).toHaveLength(1);
  });
});

describe("PlaybackManager transport ownership", () => {
  function manager() {
    let handlers: JamTransportHandlers | null = null;
    const soloNext = vi.fn();
    const listeners = new Set<() => void>();
    const setTransportHandlers = vi.fn((value: JamTransportHandlers | null) => { handlers = value; });
    const subscribe = vi.fn((fn: () => void) => { listeners.add(fn); fn(); return () => { listeners.delete(fn); }; });
    return { setTransportHandlers, subscribe, soloNext, listeners, handlers: () => handlers,
      ended: async () => { if (handlers) await handlers.ended(); else soloNext(); } };
  }
  it("consumes a read-only guest's Media Session actions and ended without local fallback", async () => {
    const h = harness("guest", false, { playback_state: "playing" }); await start(h);
    const m = manager(); const report = vi.fn();
    const detach = attachJamTransport(m, h.session, report);
    await m.ended(); await m.handlers()!.next(); await m.handlers()!.seek(22);
    expect(m.soloNext).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledTimes(2);
    expect(h.commands()).toHaveLength(0);
    detach();
  });
  it("restores solo on room end exactly once and makes retained handlers inert", async () => {
    const h = harness("guest", false, { playback_state: "playing" }); await start(h);
    const m = manager(); const report = vi.fn();
    const detach = attachJamTransport(m, h.session, report);
    const old = m.handlers()!;
    const unsubscribe = h.session.subscribe((s) => { if (s.connection === "ended") detach(); });
    h.room.status = "ended"; h.channels[0].emit("postgres_changes", "jam_rooms", { new: h.room }); await flush();
    detach(); expect(m.setTransportHandlers).toHaveBeenCalledTimes(2); expect(m.listeners.size).toBe(0);
    await old.next(); expect(report).not.toHaveBeenCalled();
    await m.ended(); expect(m.soloNext).toHaveBeenCalledTimes(1);
    expect(h.player.isPlaying()).toBe(true);
    unsubscribe();
  });
  it("uses the manager's owned release callback when it provides one", async () => {
    const h = harness(); await start(h);
    const release = vi.fn();
    const setTransportHandlers = vi.fn(() => release);
    const unsubscribe = vi.fn();
    const detach = attachJamTransport({ setTransportHandlers, subscribe: () => unsubscribe }, h.session, vi.fn());
    detach(); detach();
    expect(release).toHaveBeenCalledTimes(1); expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(setTransportHandlers).toHaveBeenCalledTimes(1);
  });
});
