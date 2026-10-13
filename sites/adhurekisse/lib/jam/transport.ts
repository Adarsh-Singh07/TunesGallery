/** External controls are routed here; direct provider methods remain local. */
export interface JamTransportHandlers {
  play: () => Promise<void>;
  pause: () => Promise<void>;
  seek: (seconds: number) => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  ended: () => Promise<void>;
}

export interface JamTransportManager {
  setTransportHandlers: (handlers: JamTransportHandlers | null) => void | (() => void);
  subscribe: (listener: () => void) => () => void;
}

interface SessionTransport {
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  skipNext(): Promise<void>;
  onEnded(): Promise<void>;
  notifyPlayerState(): void;
}

/** One owned override and player listener, with idempotent solo restoration. */
export function attachJamTransport(manager: JamTransportManager, session: SessionTransport, report: (error: unknown) => void): () => void {
  let detached = false;
  const route = (fn: () => Promise<void>) => async () => {
    if (detached) return;
    try { await fn(); } catch (error) { if (!detached) report(error); }
  };
  const release = manager.setTransportHandlers({
    play: route(() => session.play()), pause: route(() => session.pause()),
    seek: (seconds) => route(() => session.seek(seconds))(),
    next: route(() => session.skipNext()), previous: route(() => session.seek(0)),
    // A guest's resolved no-op consumes ended. It must never mean solo fallback.
    ended: route(() => session.onEnded()),
  });
  const unsubscribe = manager.subscribe(() => { if (!detached) session.notifyPlayerState(); });
  return () => {
    if (detached) return;
    detached = true;
    unsubscribe();
    if (typeof release === "function") release();
    else manager.setTransportHandlers(null);
  };
}
