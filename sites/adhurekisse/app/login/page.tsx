"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Headphones, KeyRound, Mail } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { site } from "../../data/site";
import { loginError } from "../../components/private-library/authErrors";
import { safeReturnPath } from "../../components/private-library/helpers";
import styles from "../../components/private-library/private-library.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"otp" | "password">("otp");
  const [stage, setStage] = useState<"email" | "verify">("email");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(!!supabase);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [next, setNext] = useState("/library");
  const completing = useRef(false);
  const nextRef = useRef("/library");

  useEffect(() => {
    const client = supabase;
    const params = new URLSearchParams(window.location.search);
    const destination = safeReturnPath(params.get("next"));
    nextRef.current = destination; setNext(destination);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.has("error_description") || params.has("error_description")) {
      setError("This sign-in link is invalid or has expired. Request a fresh email below.");
      window.history.replaceState(null, "", `/login?next=${encodeURIComponent(destination)}`);
    }
    if (!client) return;
    let alive = true;
    async function complete() {
      if (completing.current) return;
      completing.current = true;
      try {
        const { data, error: sessionError } = await client!.auth.getSession();
        if (sessionError) throw sessionError;
        if (!data.session) return;
        const accepted = await client!.rpc("accept_invitation");
        if (accepted.error) throw accepted.error;
        if (accepted.data !== true) { await client!.auth.signOut(); throw new Error("Your invitation is missing, expired, or revoked. Ask the owner to renew it."); }
        const { data: profile, error: profileError } = await client!.from("profiles").select("id").eq("id", data.session.user.id).maybeSingle();
        if (profileError) throw profileError;
        if (!profile) { await client!.auth.signOut(); throw new Error("Your account isn’t set up yet. Ask the owner to complete your invitation."); }
        if (alive) router.replace(nextRef.current);
      } catch (err) { if (alive) setError(loginError(err, "otp")); }
      finally { completing.current = false; if (alive) setChecking(false); }
    }
    void complete();
    const { data: listener } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") setTimeout(() => { if (alive) void complete(); }, 0);
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, [router]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function finishSignIn(userId: string | undefined) {
    if (!userId) throw new Error("Sign-in did not create a session. Please try again.");
    const accepted = await supabase!.rpc("accept_invitation");
    if (accepted.error) throw accepted.error;
    if (accepted.data !== true) { await supabase!.auth.signOut(); throw new Error("Your invitation is missing, expired, or revoked. Ask the owner to renew it."); }
    const { data: profile, error: profileError } = await supabase!.from("profiles").select("id").eq("id", userId).maybeSingle();
    if (profileError) throw profileError;
    if (!profile) { await supabase!.auth.signOut(); throw new Error("Your account isn’t set up yet. Ask the owner to complete your invitation."); }
    router.replace(next);
  }
  async function sendCode() {
    if (!supabase || busy || cooldown) return;
    setError(""); setNotice(""); setBusy(true);
    try {
      const result = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/login?next=${encodeURIComponent(next)}` } });
      if (result.error) throw result.error;
      setStage("verify"); setToken(""); setCooldown(60); setNotice("Check your inbox. Enter your email code below, or follow the sign-in link if your email includes one.");
    } catch (err) { setError(loginError(err, "otp")); }
    finally { setBusy(false); }
  }
  async function signIn(event: FormEvent) {
    event.preventDefault(); if (!supabase || busy) return;
    if (mode === "otp" && stage === "email") { await sendCode(); return; }
    setError(""); setNotice(""); setBusy(true);
    // The auth callback must not race the explicit profile check.
    completing.current = true;
    try {
      const result = mode === "password" ? await supabase.auth.signInWithPassword({ email: email.trim(), password }) : await supabase.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: "email" });
      if (result.error) throw result.error;
      await finishSignIn(result.data.session?.user.id);
    } catch (err) { setError(loginError(err, mode === "password" ? "password" : "verify")); }
    finally { completing.current = false; setBusy(false); }
  }

  return <main className={styles.page}><div className={styles.container}>
    <nav className={styles.nav} aria-label="Sign-in navigation"><Link className={styles.brand} href="/">adhurekisse.</Link><Link className={styles.navLink} href="/"><ArrowLeft size={15} aria-hidden="true" />Back to the room</Link></nav>
    <div className={styles.loginLayout}><section><p className={styles.eyebrow}>A private music room</p><h1 className={styles.title}>A few songs.<br />A familiar feeling.</h1><p className={styles.subtitle}>{site.tagline}</p><p className={styles.subtitle} style={{ marginTop: 20 }}>Step inside for the records, playlists, and people that make this space yours.</p><div className={styles.stats}><span><Headphones size={16} aria-hidden="true" /> Made for listening, together.</span></div></section>
      <section className={styles.loginPanel} aria-labelledby="login-heading">
        <p className={styles.eyebrow}>{site.eyebrow}</p><h2 className={styles.heading} id="login-heading">{stage === "verify" && mode === "otp" ? "Check your inbox" : "Welcome to the room"}</h2><p className={styles.small} style={{ marginBottom: 24 }}>{stage === "verify" && mode === "otp" ? `A little key, sent to ${email}.` : "Sign in with the email your invitation was sent to."}</p>
        {!supabase ? <div className={styles.notice}><p>Private access isn’t configured on this deployment yet. You can still explore the curated archive.</p><Link href="/" className={styles.secondary}>Explore the music room</Link></div> : checking ? <p className={styles.small} role="status">Checking your session…</p> : <>
          <form className={styles.form} onSubmit={(event) => void signIn(event)} aria-busy={busy}>
            {(stage === "email" || mode === "password") ? <label className={styles.label}>Your email<input className={styles.input} type="email" required autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" disabled={busy} /></label> : <label className={styles.label}>Email sign-in code<input autoFocus className={`${styles.input} ${styles.code}`} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" minLength={6} maxLength={10} required value={token} onChange={(event) => setToken(event.target.value.replace(/\D/g, ""))} placeholder="Enter your code" disabled={busy} /></label>}
            {mode === "password" && <label className={styles.label}>Password<input className={styles.input} type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} /></label>}
            <button className={styles.button} disabled={busy || (mode === "otp" && stage === "email" && cooldown > 0)}>{mode === "password" ? <KeyRound size={16} aria-hidden="true" /> : <Mail size={16} aria-hidden="true" />}{busy ? "One moment…" : mode === "password" ? "Sign in" : stage === "verify" ? "Enter the room" : cooldown ? `Send again in ${cooldown}s` : "Send sign-in code"}<ArrowRight size={15} aria-hidden="true" /></button>
          </form>
          {stage === "verify" && mode === "otp" && <div className={styles.actions} style={{ marginTop: 14 }}><button className={styles.secondary} disabled={busy || cooldown > 0} onClick={() => void sendCode()}>{cooldown ? `Resend in ${cooldown}s` : "Resend code"}</button><button className={styles.navLink} disabled={busy} onClick={() => { setStage("email"); setToken(""); setError(""); setNotice(""); }}>Change email</button></div>}
          <button className={styles.navLink} style={{ marginTop: 16 }} disabled={busy} onClick={() => { setMode(mode === "otp" ? "password" : "otp"); setStage("email"); setPassword(""); setToken(""); setError(""); setNotice(""); }}>{mode === "otp" ? "Use a password instead" : "Use an email sign-in code instead"}</button>
          <p className={styles.small} style={{ borderTop: "1px solid var(--line)", paddingTop: 18, marginTop: 18 }}>Need an invitation? Ask the room’s owner. Already invited? Check spam or request a fresh sign-in email.</p>
        </>}
        {notice && <p className={styles.notice} role="status">{notice}</p>}{error && <p className={styles.error} role="alert">{error}</p>}
      </section>
    </div>
  </div></main>;
}
