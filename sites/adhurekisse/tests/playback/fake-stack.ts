import { expect, type BrowserContext, type WebSocketRoute } from "@playwright/test";
import { fulfillTone, toneWav } from "./tone";
import { youtubeStub } from "./youtube-stub";

export const SUPABASE = "https://qa-local.supabase.test";
export const AUDIO = "https://qa-audio.test";
const ROOM = "10000000-0000-4000-8000-000000000001";
export const USERS = {
  host: "20000000-0000-4000-8000-000000000001",
  guest: "20000000-0000-4000-8000-000000000002",
  third: "20000000-0000-4000-8000-000000000003",
};
export type Identity = keyof typeof USERS;
export const tracks = ["Evening tone", "Morning tone"].map((title, index) => ({
  id: `30000000-0000-4000-8000-00000000000${index + 1}`, owner_id: USERS.host,
  title, artist: "QA generated audio", album: "Deterministic browser fixtures", movie: null,
  year: "2026", tags: ["qa"], audio_key: null, artwork_key: null, artworkUrl: null,
  mime_type: "audio/wav", size_bytes: 1440044, duration_seconds: 90, status: "ready",
  created_at: `2026-10-0${index + 1}T00:00:00Z`, updated_at: "2026-10-03T00:00:00Z",
}));
type Row = Record<string, any>; // Wire-format rows intentionally model PostgREST JSON.
type AuthFailure = { status: number; code: string; message: string };
type Subscription = { socket: WebSocketRoute; topic: string; joinRef: string; array: boolean; filters: Row[] };

/** Test-side contract emulator; it is not evidence of database RLS or live Realtime. */
export class FakeStack {
  room: Row | null = null;
  state: Row = this.initialState();
  queue: Row[] = [];
  participants = new Map<string, Row>();
  messages: Row[] = [];
  commands: { type: string; user: string }[] = [];
  streamRequests: { track: string; authorization: string }[] = [];
  audioRequests: { range: string | undefined; authorization: string | undefined; status: number }[] = [];
  unexpected: string[] = [];
  signupMode: "confirmation" | "session" | "duplicate" = "confirmation";
  signupError: AuthFailure | null = null;
  signInError: AuthFailure | null = null;
  activationResult = true;
  authRequests: { path: string; body: Row; redirectTo: string | null }[] = [];
  rpcRequests: { name: string; user: string }[] = [];
  libraryReads: { user: string; trackIds: string[] }[] = [];
  realtimeEnabled = true;
  denyStream = false;
  delayStream: string | null = null;
  private subscriptions = new Set<Subscription>();
  private streamSerial = 0;
  private ids = 0;
  private applied = new Set<string>();
  private sessions = new Map<string, Row>();
  private privateTrackAccess = new Set<string>();
  private tones = tracks.map((_, index) => toneWav(90, 220 + index * 110));

  private initialState(): Row {
    return { room_id: ROOM, track_id: null, playback_state: "idle", position_seconds: 0, revision: 0, track_revision: 0, updated_at: new Date().toISOString(), start_at: null };
  }

  private authUser(identity: Identity, email = `${identity}@qa.test`, metadata: Row = {}) {
    return { id: USERS[identity], aud: "authenticated", role: "authenticated", email, email_confirmed_at: new Date().toISOString(), app_metadata: { provider: "email" }, user_metadata: metadata, created_at: new Date().toISOString() };
  }

  private session(identity: Identity, email?: string, metadata?: Row) {
    const user = this.authUser(identity, email, metadata);
    const session = { access_token: `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.qa-signature`, refresh_token: "qa-refresh-only", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
    this.sessions.set(session.access_token, user);
    return session;
  }

  /** Simulate the emailed callback, while the real Supabase client handles the URL session. */
  confirmationLink() {
    const signup = [...this.authRequests].reverse().find((request) => request.path === "/auth/v1/signup");
    if (!signup?.redirectTo) throw new Error("No signup confirmation destination was recorded");
    const session = this.session("guest", signup.body.email, signup.body.data);
    const url = new URL(signup.redirectTo);
    url.hash = new URLSearchParams({ access_token: session.access_token, refresh_token: session.refresh_token, expires_in: "3600", token_type: "bearer", type: "signup" }).toString();
    return url.toString();
  }

  async install(context: BrowserContext, identity?: Identity) {
    if (identity) {
      const session = this.session(identity);
      this.privateTrackAccess.add(USERS[identity]);
      await context.addInitScript(({ session }) => {
        if (!sessionStorage.getItem("qa-seeded")) {
          localStorage.setItem("sb-qa-local-auth-token", JSON.stringify(session));
          sessionStorage.setItem("qa-seeded", "1");
        }
      }, { session });
    }

    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const token = request.headers().authorization?.replace(/^Bearer /i, "");
      const authenticated = token ? this.sessions.get(token) : undefined;
      const json = (value: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "cache-control": "private, no-store", "access-control-allow-origin": "*" }, body: JSON.stringify(value) });
      if (url.origin === SUPABASE) {
        if (["/auth/v1/signup", "/auth/v1/token", "/auth/v1/otp", "/auth/v1/verify"].includes(url.pathname)) {
          const body = request.postDataJSON() ?? {};
          this.authRequests.push({ path: url.pathname, body, redirectTo: url.searchParams.get("redirect_to") });
          const failure = url.pathname === "/auth/v1/signup" ? this.signupError : this.signInError;
          if (failure) return json(failure, failure.status);
          if (url.pathname === "/auth/v1/otp") return json({});
          if (url.pathname === "/auth/v1/signup" && this.signupMode !== "session") {
            return json({ ...this.authUser("guest", body.email, body.data), email_confirmed_at: null, identities: this.signupMode === "duplicate" ? [] : [{ provider: "email" }] });
          }
          if (url.pathname === "/auth/v1/verify" && body.token !== "123456") return json({ code: "otp_expired", message: "Token expired" }, 403);
          return json(this.session("guest", body.email, body.data));
        }
        if (url.pathname === "/auth/v1/user") return authenticated ? json(authenticated) : json({ message: "Auth session missing", code: "session_not_found" }, 401);
        if (url.pathname === "/auth/v1/logout") return json({});
        if (!authenticated) return json({ message: "Authentication required", code: "42501" }, 401);
        const user = authenticated.id as string;
        const current = Object.entries(USERS).find(([, id]) => id === user)![0];
        if (url.pathname === "/rest/v1/profiles") return json({ id: user, email: authenticated.email, display_name: authenticated.user_metadata.display_name || `QA ${current}`, is_active: this.activationResult, is_admin: current === "host" });
        if (url.pathname.startsWith("/rest/v1/rpc/")) {
          const rpc = url.pathname.split("/").at(-1)!;
          this.rpcRequests.push({ name: rpc, user });
          const body = request.postDataJSON() ?? {};
          try { return json(this.rpc(rpc, body, user)); }
          catch (error) { return json({ code: "P0001", message: (error as Error).message }, 400); }
        }
        const table = url.pathname.split("/").at(-1);
        if (table === "jam_rooms") return json(this.room);
        if (table === "jam_room_state") return json(this.state);
        if (table === "jam_queue") return json(this.queue.map((item) => ({ ...item, tracks: tracks.find((track) => track.id === item.track_id) })));
        if (table === "jam_participants") return json([...this.participants.values()]);
        if (table === "jam_messages") return json([...this.messages].reverse());
        if (table === "messages") return json([]);
        this.unexpected.push(`${request.method()} ${url.pathname}`);
        return json({ error: "Unimplemented fake Supabase request" }, 501);
      }
      if (url.origin === AUDIO) {
        const index = tracks.findIndex((track) => url.pathname.includes(track.id));
        this.audioRequests.push({ range: request.headers().range, authorization: request.headers().authorization, status: request.headers().range ? 206 : 200 });
        return fulfillTone(route, this.tones[Math.max(0, index)]);
      }
      if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
        if (authenticated && url.pathname === "/api/tracks") {
          const visible = this.privateTrackAccess.has(authenticated.id) ? tracks : [];
          this.libraryReads.push({ user: authenticated.id, trackIds: visible.map((track) => track.id) });
          return json({ tracks: visible });
        }
        if (authenticated && /^\/api\/tracks\/.+\/stream$/.test(url.pathname)) {
          const id = url.pathname.split("/")[3];
          this.streamRequests.push({ track: id, authorization: request.headers().authorization ?? "" });
          if (this.delayStream === id) await new Promise((resolve) => setTimeout(resolve, 700));
          if (this.denyStream || !this.privateTrackAccess.has(authenticated.id)) return json({ error: "Track not found" }, 404);
          if (!tracks.some((track) => track.id === id)) return json({ error: "Track not found" }, 404);
          return json({ url: `${AUDIO}/${id}.wav?signature=qa-${++this.streamSerial}`, expiresAt: Date.now() + 15 * 60_000, mimeType: "audio/wav" });
        }
        if (authenticated && url.pathname === "/api/playlists") return json({ playlists: [] });
        if (url.pathname === "/_next/image") return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#24182e"/></svg>' });
        return route.continue();
      }
      // Test the app, not external weather/fonts/YouTube availability. All external
      // traffic is intercepted, so no cloud endpoint is contacted by the browser.
      if (url.hostname === "www.youtube.com" && url.pathname === "/iframe_api") return route.fulfill({ contentType: "application/javascript", body: youtubeStub });
      if (url.hostname.includes("open-meteo")) return json({ current: { temperature_2m: 22, weather_code: 0 }, current_weather: { temperature: 22, weathercode: 0 } });
      if (url.hostname.includes("googleapis") || url.hostname.includes("gstatic")) return route.fulfill({ contentType: "text/css", body: "" });
      return route.fulfill({ status: 200, body: "", contentType: "text/plain" });
    });

    await context.routeWebSocket(/qa-local\.supabase\.test/, (socket) => {
      socket.onMessage((raw) => {
        const parsed = JSON.parse(String(raw));
        const array = Array.isArray(parsed);
        const [joinRef, ref, topic, event, payload] = array ? parsed : [parsed.join_ref, parsed.ref, parsed.topic, parsed.event, parsed.payload];
        const send = (name: string, data: Row) => socket.send(JSON.stringify(array ? [joinRef, ref, topic, name, data] : { join_ref: joinRef, ref, topic, event: name, payload: data }));
        if (event === "phx_join") {
          if (!this.realtimeEnabled && topic.includes("jam:")) return;
          const filters = (payload.config?.postgres_changes ?? []).map((filter: Row, index: number) => ({ ...filter, id: index + 1 }));
          this.subscriptions.add({ socket, topic, joinRef, array, filters });
          send("phx_reply", { status: "ok", response: { postgres_changes: filters } });
          if (!topic.includes("jam:")) send("presence_state", {});
        } else if (event === "phx_leave") {
          for (const subscription of this.subscriptions) if (subscription.socket === socket && subscription.topic === topic) this.subscriptions.delete(subscription);
          send("phx_reply", { status: "ok", response: {} });
        } else send("phx_reply", { status: "ok", response: {} });
      });
      socket.onClose(() => { for (const subscription of this.subscriptions) if (subscription.socket === socket) this.subscriptions.delete(subscription); });
    });
  }

  assertNoUnexpectedRequests() { expect(this.unexpected).toEqual([]); }

  private change(table: string, record: Row, type = "UPDATE") {
    for (const subscription of this.subscriptions) {
      const ids = subscription.filters.filter((filter) => filter.table === table && (filter.event === "*" || filter.event === type)).map((filter) => filter.id);
      if (!ids.length) continue;
      const payload = { ids, data: { schema: "public", table, type, commit_timestamp: new Date().toISOString(), columns: [], record, old_record: {}, errors: null } };
      try { subscription.socket.send(JSON.stringify(subscription.array ? [subscription.joinRef, null, subscription.topic, "postgres_changes", payload] : { join_ref: subscription.joinRef, ref: null, topic: subscription.topic, event: "postgres_changes", payload })); } catch { /* closed context */ }
    }
  }

  private participant(user: string) {
    const identity = Object.entries(USERS).find(([, id]) => id === user)![0];
    return { room_id: ROOM, user_id: user, role: user === this.room?.host_id ? "host" : "guest", status: "ready", last_seen: new Date().toISOString(), ready_track_id: null, ready_revision: null, profiles: { display_name: `QA ${identity}` } };
  }

  private rpc(name: string, body: Row, user: string): unknown {
    if (name === "activate_account" || name === "accept_invitation") return this.activationResult;
    if (name === "server_time") return new Date().toISOString();
    if (name === "jam_create_room") {
      this.room = { id: ROOM, code: "QA1234", host_id: user, guest_id: null, collaborative: body.p_collaborative, status: "open", expires_at: new Date(Date.now() + 3600_000).toISOString() };
      this.state = this.initialState(); this.queue = []; this.messages = []; this.participants.clear();
      this.participants.set(user, this.participant(user));
      return [{ room_id: ROOM, room_code: "QA1234" }];
    }
    if (name === "jam_join_room") {
      if (!this.room || body.p_code !== this.room.code || this.room.status === "ended") throw new Error("ROOM_NOT_FOUND");
      if (this.room.guest_id && this.room.guest_id !== user) throw new Error("ROOM_FULL");
      this.room.guest_id = user; this.room.status = "active";
      this.participants.set(user, this.participant(user));
      this.change("jam_rooms", this.room); this.change("jam_participants", this.participants.get(user)!, "INSERT");
      return ROOM;
    }
    if (!this.room || (user !== this.room.host_id && user !== this.room.guest_id)) throw new Error("FORBIDDEN");
    const participant = this.participants.get(user)!;
    if (name === "jam_heartbeat" || name === "jam_set_ready") {
      if (name === "jam_set_ready") {
        participant.ready_track_id = body.p_track_id; participant.ready_revision = this.state.track_revision; participant.status = "ready";
      } else participant.status = body.p_status;
      participant.last_seen = new Date().toISOString();
      this.change("jam_participants", participant);
      return true;
    }
    if (name === "jam_send_message") {
      const row = { id: body.p_message_id, room_id: ROOM, user_id: user, name: participant.profiles.display_name, text: body.p_text, kind: body.p_kind, created_at: new Date().toISOString() };
      this.messages.push(row); this.change("jam_messages", row, "INSERT"); return row;
    }
    if (name === "jam_leave_room") {
      this.room.guest_id = null; this.participants.delete(user); this.change("jam_rooms", this.room); return true;
    }
    if (name !== "jam_apply_command") { this.unexpected.push(`RPC ${name}`); throw new Error("UNKNOWN_COMMAND"); }
    if (this.applied.has(body.p_command_id)) return this.state.revision;
    if (body.p_expected_revision !== this.state.revision) throw new Error("STALE_REVISION");
    const type = body.p_type;
    if (user !== this.room.host_id && type !== "suggest_track" && (!this.room.collaborative || ["end_room", "set_collaborative", "start_at", "queue_add", "queue_remove", "queue_reorder"].includes(type))) throw new Error("FORBIDDEN");
    this.commands.push({ type, user });
    const payload = body.p_payload;
    const position = this.state.position_seconds + (this.state.playback_state === "playing" ? Math.max(0, (Date.now() - Date.parse(this.state.start_at ?? this.state.updated_at)) / 1000) : 0);
    this.state.position_seconds = position;
    this.state.start_at = null;
    switch (type) {
      case "queue_add": case "suggest_track":
        this.queue.push({ id: `40000000-0000-4000-8000-${String(++this.ids).padStart(12, "0")}`, track_id: payload.track_id, added_by: user, position: this.queue.length }); break;
      case "queue_remove": this.queue = this.queue.filter((item) => item.id !== payload.queue_item_id); break;
      case "queue_reorder": this.queue.sort((a, b) => payload.ordered_ids.indexOf(a.id) - payload.ordered_ids.indexOf(b.id)); break;
      case "set_track": case "skip_next": {
        const item = type === "skip_next" ? this.queue.shift() : this.queue.find((entry) => entry.id === payload.queue_item_id);
        this.state.track_id = payload.track_id ?? item?.track_id;
        this.state.playback_state = "ready"; this.state.position_seconds = payload.position_seconds ?? 0;
        this.state.track_revision = this.state.revision + 1;
        if (item) this.queue = this.queue.filter((entry) => entry.id !== item.id);
        break;
      }
      case "start_at":
        if (![this.room.host_id, this.room.guest_id].filter(Boolean).every((id) => this.participants.get(id)?.ready_track_id === this.state.track_id)) throw new Error("NOT_READY");
        this.state.start_at = payload.start_at; this.state.position_seconds = payload.position_seconds; this.state.playback_state = "playing"; break;
      case "play": this.state.playback_state = "playing"; break;
      case "pause": this.state.playback_state = "paused"; break;
      case "seek": this.state.position_seconds = payload.position_seconds; break;
      case "set_collaborative": this.room.collaborative = payload.collaborative; break;
      case "end_room": this.room.status = "ended"; this.state.playback_state = "ended"; break;
      default: throw new Error("UNKNOWN_COMMAND");
    }
    this.applied.add(body.p_command_id);
    this.state.revision++; this.state.updated_at = new Date().toISOString();
    this.change("jam_room_state", this.state); this.change("jam_rooms", this.room);
    return this.state.revision;
  }
}
