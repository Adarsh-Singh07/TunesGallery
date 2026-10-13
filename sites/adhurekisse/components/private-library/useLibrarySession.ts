"use client";

import { useCallback, useEffect, useState } from "react";
import type { Profile } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { activationNotice, loginError } from "./authErrors";

export function useLibrarySession() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "guest" | "error">("loading");
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const retry = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    const client = supabase;
    if (!client) { setStatus("guest"); return; }
    let alive = true;
    let generation = 0;
    async function check() {
      const request = ++generation;
      try {
        const { data, error: sessionError } = await client!.auth.getSession();
        if (sessionError) throw sessionError;
        if (!alive || request !== generation) return;
        if (!data.session) { setProfile(null); setStatus("guest"); return; }
        const active = await client!.rpc("activate_account");
        if (active.error) throw active.error;
        if (active.data !== true) throw new Error(activationNotice);
        const { data: row, error: profileError } = await client!.from("profiles")
          .select("id,email,display_name,is_admin,is_active").eq("id", data.session.user.id).maybeSingle();
        if (profileError) throw profileError;
        if (!alive || request !== generation) return;
        if (!row?.is_active) throw new Error(activationNotice);
        setProfile(row as Profile);
        setError("");
        setStatus("ready");
      } catch (err) {
        if (alive && request === generation) { setProfile(null); setError(loginError(err, "activate")); setStatus("error"); }
      }
    }
    setStatus("loading");
    void check();
    // Do not await another Supabase call inside its auth callback (auth lock).
    const { data: listener } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") { generation++; setProfile(null); setStatus("guest"); }
      else if (event === "SIGNED_IN" || event === "USER_UPDATED") setTimeout(() => { if (alive) void check(); }, 0);
    });
    const expire = () => { generation++; setProfile(null); setError("Your session expired. Sign in again to continue."); setStatus("guest"); };
    window.addEventListener("library:session-expired", expire);
    return () => { alive = false; generation++; listener.subscription.unsubscribe(); window.removeEventListener("library:session-expired", expire); };
  }, [version]);

  return { profile, status, error, retry, configured: !!supabase };
}
