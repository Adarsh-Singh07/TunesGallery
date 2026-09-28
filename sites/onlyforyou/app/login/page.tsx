"use client";

import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { site } from "../../data/site";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [stage, setStage] = useState<"email" | "verify">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const configured = !!supabase;

  async function handleSendCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { error: otpError } = await supabase!.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: false },
      });
      if (otpError) {
        setError(
          otpError.message.includes("not allowed") || otpError.message.includes("not found")
            ? "This email hasn't been invited. Ask the room's owner for an invitation."
            : otpError.message,
        );
        return;
      }
      setStage("verify");
      setNotice("Check your inbox — enter the 6-digit code below.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { data, error: verifyError } = await supabase!.auth.verifyOtp({
        email: email.trim(),
        token: token.trim(),
        type: "email",
      });
      if (verifyError) {
        setError("That code didn't work. Request a fresh one if it expired.");
        return;
      }
      if (data.session) {
        // Profile check — never provisioned users shouldn't linger half-logged-in
        const { data: profile } = await supabase!
          .from("profiles")
          .select("id")
          .eq("id", data.session.user.id)
          .single();
        if (!profile) {
          await supabase!.auth.signOut();
          setError("Your account isn't set up yet. Ask the owner to re-invite you.");
          return;
        }
        router.replace("/");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page" style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "24px" }}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{
          width: "100%",
          maxWidth: 380,
          background: "var(--surface, rgba(255,255,255,0.03))",
          border: "1px solid var(--border, rgba(255,255,255,0.1))",
          borderRadius: 16,
          padding: "36px 30px",
        }}
      >
        <p className="login-eyebrow" style={{ fontSize: 11, letterSpacing: "0.2em", opacity: 0.6 }}>
          {site.eyebrow}
        </p>
        <h1 style={{ fontSize: 24, margin: "8px 0 4px" }}>{site.name}</h1>
        <p style={{ fontSize: 13, opacity: 0.65, marginBottom: 24 }}>{site.tagline}</p>

        {!configured ? (
          <p style={{ fontSize: 13, opacity: 0.7 }}>
            Private access isn&apos;t configured on this deployment yet. The room stays open
            without accounts until the owner enables sign-in.
          </p>
        ) : stage === "email" ? (
          <form onSubmit={handleSendCode}>
            <label htmlFor="email" style={{ fontSize: 12, letterSpacing: "0.08em", opacity: 0.7 }}>
              YOUR EMAIL
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                width: "100%",
                marginTop: 8,
                marginBottom: 16,
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid var(--border, rgba(255,255,255,0.12))",
                background: "rgba(0,0,0,0.25)",
                color: "inherit",
                fontSize: 15,
              }}
            />
            <button
              type="submit"
              disabled={busy}
              style={{
                width: "100%",
                padding: "13px 0",
                borderRadius: 10,
                border: "none",
                background: "var(--accent, #c9a560)",
                color: "#0a0a0a",
                fontWeight: 600,
                letterSpacing: "0.06em",
                fontSize: 14,
                cursor: busy ? "wait" : "pointer",
              }}
            >
              {busy ? "SENDING…" : "SEND SIGN-IN CODE"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify}>
            <label htmlFor="code" style={{ fontSize: 12, letterSpacing: "0.08em", opacity: 0.7 }}>
              6-DIGIT CODE
            </label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              required
              value={token}
              onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))}
              placeholder="••••••"
              style={{
                width: "100%",
                marginTop: 8,
                marginBottom: 16,
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid var(--border, rgba(255,255,255,0.12))",
                background: "rgba(0,0,0,0.25)",
                color: "inherit",
                fontSize: 20,
                letterSpacing: "0.4em",
                textAlign: "center",
              }}
            />
            <button
              type="submit"
              disabled={busy}
              style={{
                width: "100%",
                padding: "13px 0",
                borderRadius: 10,
                border: "none",
                background: "var(--accent, #c9a560)",
                color: "#0a0a0a",
                fontWeight: 600,
                letterSpacing: "0.06em",
                fontSize: 14,
                cursor: busy ? "wait" : "pointer",
              }}
            >
              {busy ? "VERIFYING…" : "ENTER THE ROOM"}
            </button>
            <button
              type="button"
              onClick={() => { setStage("email"); setNotice(null); }}
              style={{
                width: "100%",
                marginTop: 10,
                padding: "10px 0",
                background: "none",
                border: "none",
                color: "inherit",
                opacity: 0.6,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Use a different email
            </button>
          </form>
        )}

        {notice && <p style={{ marginTop: 14, fontSize: 12, opacity: 0.75 }}>{notice}</p>}
        {error && (
          <p role="alert" style={{ marginTop: 14, fontSize: 12, color: "#e08a7a" }}>
            {error}
          </p>
        )}

        <hr style={{ border: "none", borderTop: "1px solid var(--border, rgba(255,255,255,0.08))", margin: "22px 0 14px" }} />
        <Link href="/" style={{ fontSize: 12, opacity: 0.55, letterSpacing: "0.08em" }}>
          ← BACK TO THE ROOM
        </Link>
      </motion.div>
    </main>
  );
}
