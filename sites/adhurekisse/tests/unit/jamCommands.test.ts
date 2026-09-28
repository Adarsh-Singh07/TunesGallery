import { beforeEach, describe, expect, it, vi } from "vitest";
import { JamSession, type PlayerAdapter } from "../../lib/jam/JamSession";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// Simulates the jam_apply_command RPC semantics (revision guard, role check,
// state transitions) on the client's JamSession.command() path using a fake
// Supabase client. Verifies stale-revision rejection and recovery.
// ─────────────────────────────────────────────────────────────────────────────

interface ServerRoom {
  id: string;
  code: string;
  hostId: string;
  guestId: string | null;
  collaborative: boolean;
  status: "open" | "active" | "ended";
}
interface ServerState {
  roomId: string;
  trackId: string | null;
  playbackState: "idle" | "ready" | "playing" | "paused" | "ended";
  positionSeconds: number;
  revision: number;
  updatedAt: string;
}

function makeFakeDb(room: ServerRoom, state: ServerState, actorId: string) {
  const appliedCommands = new Set<string>();
  const stateRef = state;
  const roomRef = room;

  function authorize(type: string, actor: string): string | null {
    if (roomRef.status === "ended") return "ROOM_ENDED";
    const isHost = actor === roomRef.hostId;
    const isCollabGuest = roomRef.collaborative && actor === roomRef.guestId;
    if (!isHost && !isCollabGuest) return "FORBIDDEN";
    if (!isHost && (type === "end_room" || type === "set_collaborative")) return "FORBIDDEN";
    return null;
  }

  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    if (fn === "jam_apply_command") {
      const { p_command_id, p_type, p_expected_revision } = args as {
        p_command_id: string;
        p_type: string;
        p_expected_revision: number | null;
      };
      if (appliedCommands.has(p_command_id)) {
        return { data: { revision: stateRef.revision }, error: null }; // idempotent replay
      }
      const denied = authorize(p_type, actorId);
      if (denied) return { data: null, error: { message: denied } };
      if (p_expected_revision != null && p_expected_revision !== stateRef.revision) {
        return { data: null, error: { message: "STALE_REVISION" } };
      }
      appliedCommands.add(p_command_id);
      // mirror server transitions
      if (p_type === "play") stateRef.playbackState = "playing";
      if (p_type === "pause") stateRef.playbackState = "paused";
      if (p_type === "seek") stateRef.positionSeconds = (args as { p_payload: { position_seconds?: number } }).p_payload.position_seconds ?? stateRef.positionSeconds;
      if (p_type === "set_track") {
        stateRef.trackId = (args as { p_payload: { track_id: string } }).p_payload.track_id;
        stateRef.playbackState = "idle";
        stateRef.positionSeconds = 0;
      }
      if (p_type === "start_at") stateRef.playbackState = "playing";
      if (p_type === "end_room") {
        stateRef.playbackState = "ended";
        roomRef.status = "ended";
      }
      stateRef.revision += 1;
      stateRef.updatedAt = new Date().toISOString();
      return { data: { revision: stateRef.revision }, error: null };
    }
    if (fn === "jam_heartbeat" || fn === "jam_leave_room") return { data: null, error: null };
    return { data: null, error: { message: `unexpected rpc ${fn}` } };
  });

  const from = vi.fn(() => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      single: async () => ({ data: { ...stateRef }, error: null }),
    };
    return builder;
  });

  return { rpc, from } as unknown as SupabaseClient;
}

function makePlayer(): PlayerAdapter & { loaded: string[]; playing: boolean; position: number } {
  const player = {
    loaded: [] as string[],
    playing: false,
    position: 0,
    loadTrack: async (index: number) => {
      player.loaded.push(String(index));
    },
    play: async () => {
      player.playing = true;
    },
    pause: async () => {
      player.playing = false;
    },
    seek: async (sec: number) => {
      player.position = sec;
    },
    setRate: async () => {},
    getPosition: () => player.position,
    isPlaying: () => player.playing,
    isBuffered: () => true,
  };
  return player;
}

function makeSession(room: ServerRoom, state: ServerState, actorId: string, isHost: boolean) {
  const player = makePlayer();
  const db = makeFakeDb(room, state, actorId);
  const session = new JamSession({
    db,
    roomId: room.id,
    userId: actorId,
    displayName: isHost ? "Host" : "Guest",
    player,
    resolveTrack: (id) => (id === "track-a" ? 0 : id === "track-b" ? 1 : null),
    readinessTimeoutMs: 50,
  });
  // Seed internal state without network start(). The session keeps its own
  // copy of the server row, exactly like a client that fetched it earlier.
  (session as unknown as { _room: ServerRoom })._room = room;
  (session as unknown as { _stateRow: ServerState })._stateRow = { ...state };
  (session as unknown as { _role: "host" | "guest" })._role = isHost ? "host" : "guest";
  return { session, player, db };
}

const asCommandable = (s: JamSession) =>
  (s as unknown as { command: (t: string, p?: Record<string, unknown>) => Promise<void> }).command.bind(s);

let room: ServerRoom;
let state: ServerState;

beforeEach(() => {
  room = { id: "room-1", code: "ABC123", hostId: "u-host", guestId: "u-guest", collaborative: false, status: "active" };
  state = { roomId: "room-1", trackId: null, playbackState: "idle", positionSeconds: 0, revision: 0, updatedAt: new Date().toISOString() };
});

describe("JamSession command path", () => {
  it("host plays: idle → playing, revision bumps", async () => {
    const { session } = makeSession(room, state, "u-host", true);
    await asCommandable(session)("play");
    expect(state.playbackState).toBe("playing");
    expect(state.revision).toBe(1);
  });

  it("guest without collaborative mode is rejected with FORBIDDEN", async () => {
    const { session } = makeSession(room, state, "u-guest", false);
    await expect(asCommandable(session)("play")).rejects.toThrow(
      "You cannot control this room.",
    );
  });

  it("collaborative guest may play but not end the room", async () => {
    room.collaborative = true;
    const { session } = makeSession(room, state, "u-guest", false);
    await asCommandable(session)("play");
    expect(state.playbackState).toBe("playing");
    await expect(asCommandable(session)("end_room")).rejects.toThrow(
      "You cannot control this room.",
    );
  });

  it("stale revision is rejected and state is refetched", async () => {
    const { session } = makeSession(room, state, "u-host", true);
    // simulate another writer bumping the revision behind our back
    state.revision = 7;
    await expect(asCommandable(session)("play")).rejects.toThrow(
      "Someone else changed playback",
    );
    // refetchState ran and picked up revision 7
    const snap = (session as unknown as { _stateRow: ServerState })._stateRow;
    expect(snap.revision).toBe(7);
  });

  it("sequential commands each bump the revision", async () => {
    const { session } = makeSession(room, state, "u-host", true);
    const cmd = asCommandable(session);
    await cmd("seek", { position_seconds: 10 });
    await cmd("seek", { position_seconds: 20 });
    expect(state.revision).toBe(2);
    expect(state.positionSeconds).toBe(20);
  });

  it("set_track flows idle → start_at → playing", async () => {
    const { session } = makeSession(room, state, "u-host", true);
    const cmd = asCommandable(session);
    await cmd("set_track", { track_id: "track-a" });
    expect(state.playbackState).toBe("idle");
    await cmd("start_at");
    expect(state.playbackState).toBe("playing");
    expect(state.trackId).toBe("track-a");
  });

  it("ended rooms reject every command", async () => {
    room.status = "ended";
    const { session } = makeSession(room, state, "u-host", true);
    await expect(asCommandable(session)("play")).rejects.toThrow();
  });
});
