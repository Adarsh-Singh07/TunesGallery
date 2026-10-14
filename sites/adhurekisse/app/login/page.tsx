"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Headphones, KeyRound, Mail } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { site } from "../../data/site";
import { registerAccount, requestEmailCode, verifyEmailCode } from "../../lib/emailCode";
import { activationNotice, loginError } from "../../components/private-library/authErrors";
import { safeReturnPath } from "../../components/private-library/helpers";
import styles from "../../components/private-library/private-library.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [authMode, setAuthMode] = useState<"sign-in" | "register">("sign-in");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mode, setMode] = useState<"otp" | "password">("otp");
  const [stage, setStage] = useState<"email" | "verify">("email");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(!!supabase);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [registrationSent, setRegistrationSent] = useState(false);
  const [registerVerified, setRegisterVerified] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [next, setNext] = useState("/");
  const authOperation = useRef(false);
  const completion = useRef<Promise<void> | null>(null);
  const redirected = useRef(false);
  const nextRef = useRef("/");

  function resetForm(nextMode: "sign-in" | "register") {
    setAuthMode(nextMode);
    setStage("email");
    setRegistrationSent(false);
    setRegisterVerified(false);
    setToken("");
    setPassword("");
    setConfirmPassword("");
    setError("");
    setNotice("");
  }

  const finishSignIn = useCallback((userId: string | undefined): Promise<void> => {
    if (!userId) return Promise.reject(new Error("Sign-in did not create a session. Please try again."));
    if (redirected.current) return Promise.resolve();
    // Both URL sessions and explicit auth calls use one activation/profile check.
    if (!completion.current) completion.current = (async () => {
      try {
        const active = await supabase!.rpc("activate_account");
        if (active.error) throw active.error;
        if (active.data !== true) {
          await supabase!.auth.signOut();
          throw new Error(activationNotice);
        }
        const { data: profile, error: profileError } = await supabase!.from("profiles").select("id,is_active").eq("id", userId).maybeSingle();
        if (profileError) throw profileError;
        if (!profile?.is_active) {
          await supabase!.auth.signOut();
          throw new Error(activationNotice);
        }
        redirected.current = true;
        router.replace(nextRef.current);
      } catch (err) { throw new Error(loginError(err, "activate")); }
    })().finally(() => { completion.current = null; });
    return completion.current;
  }, [router]);

  useEffect(() => {
    const client = supabase;
    const params = new URLSearchParams(window.location.search);
    const destination = safeReturnPath(params.get("next"));
    nextRef.current = destination; setNext(destination);
    if (params.get("mode") === "register") setAuthMode("register");
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (hash.has("error_description") || params.has("error_description")) {
      setError("This sign-in link is invalid or has expired. Request a fresh email below.");
      window.history.replaceState(null, "", `/login?next=${encodeURIComponent(destination)}`);
    }
    if (!client) return;
    let alive = true;
    async function complete() {
      if (authOperation.current || redirected.current || !alive) return;
      try {
        const { data, error: sessionError } = await client!.auth.getSession();
        if (!alive || authOperation.current || redirected.current) return;
        if (sessionError) throw sessionError;
        if (!data.session) return;
        await finishSignIn(data.session.user.id);
      } catch (err) { if (alive) setError(loginError(err, "otp")); }
      finally { if (alive) setChecking(false); }
    }
    void complete();
    const { data: listener } = client.auth.onAuthStateChange((event) => {
      // Ignore the event at dispatch time too: a timer from an explicit sign-up
      // must not start a second activation after that submission has finished.
      if (event === "SIGNED_IN" && !authOperation.current && !redirected.current) setTimeout(() => { if (alive) void complete(); }, 0);
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, [finishSignIn]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

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
    event.preventDefault(); if (!supabase || busy || authOperation.current) return;
    if (mode === "otp" && stage === "email") { await sendCode(); return; }
    setError(""); setNotice(""); setBusy(true);
    // The auth callback must not race the explicit profile check.
    authOperation.current = true;
    try {
      const result = mode === "password" ? await supabase.auth.signInWithPassword({ email: email.trim(), password }) : await supabase.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: "email" });
      if (result.error) throw result.error;
      await finishSignIn(result.data.session?.user.id);
    } catch (err) { setError(loginError(err, mode === "password" ? "password" : "verify")); }
    finally { authOperation.current = false; setBusy(false); }
  }

  async function register(event: FormEvent) {
    event.preventDefault(); if (!supabase || busy || authOperation.current) return;
    setError(""); setNotice("");
    if (password !== confirmPassword) { setError("The passwords don’t match. Please enter them again."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setBusy(true);
    authOperation.current = true;
    try {
      const result = await registerAccount({ email: email.trim(), password, displayName: displayName.trim() || undefined });
      if (!result.ok) throw new Error(result.error ?? "Could not create the account.");
      // The account now exists but is locked until its emailed code is verified.
      setRegistrationSent(true); setRegisterVerified(false); setToken("");
      setPassword(""); setConfirmPassword("");
      setNotice(result.delivered ? `We emailed a 6-digit code to ${email.trim()}. Enter it below to finish.` : "Account created. We couldn’t deliver the code — use “Resend code” below, then sign in.");
    } catch (err) { setError(loginError(err, "register")); }
    finally { authOperation.current = false; setBusy(false); }
  }

  async function resendRegisterCode() {
    if (busy || cooldown > 0) return;
    setError(""); setBusy(true);
    try {
      await requestEmailCode(email.trim());
      setCooldown(60);
      setNotice("We re-sent your code. It may take a moment to arrive — check spam if you don’t see it.");
    } catch { setNotice("Resend is unavailable right now. Wait a minute and try again."); }
    finally { setBusy(false); }
  }

  async function verifyRegister(event: FormEvent) {
    event.preventDefault(); if (!supabase || busy || authOperation.current) return;
    setError(""); setNotice("");
    authOperation.current = true; setBusy(true);
    try {
      const result = await verifyEmailCode(email.trim(), token.trim());
      if (!result.ok) throw new Error(result.error ?? "That code is invalid or expired.");
      setRegisterVerified(true); setToken("");
      setNotice("Account verified. Sign in with your password to enter the room.");
    } catch (err) { setError(loginError(err, "verify")); }
    finally { authOperation.current = false; setBusy(false); }
  }

  const signInHeading = stage === "verify" && mode === "otp" ? "Check your inbox" : "Welcome to the room";
  const registerHeading = registerVerified ? "Account verified" : registrationSent ? "Enter your code" : "Create your account";
  const registerSubheading = registerVerified
    ? "Now sign in with your password to enter the room."
    : registrationSent
      ? `We sent a 6-digit code to ${email.trim()}. Enter it to verify your account.`
      : "Register once to listen solo, then create or join a Jam with a room code.";
  const heading = authMode === "register" ? registerHeading : signInHeading;
  const subheading = authMode === "register"
    ? registerSubheading
    : stage === "verify" && mode === "otp" ? `A little key, sent to ${email}.` : "Sign in to listen and join private Jam rooms.";

  return <main className={styles.page}><div className={styles.container}>
    <nav className={styles.nav} aria-label="Sign-in navigation"><Link className={styles.brand} href="/">adhurekisse.</Link><Link className={styles.navLink} href="/"><ArrowLeft size={15} aria-hidden="true" />Back to the room</Link></nav>
    <div className={styles.loginLayout}><section><p className={styles.eyebrow}>A private music room</p><h1 className={styles.title}>A few songs.<br />A familiar feeling.</h1><p className={styles.subtitle}>{site.tagline}</p><p className={styles.subtitle} style={{ marginTop: 20 }}>Step inside for the records, playlists, and people that make this space yours.</p><div className={styles.stats}><span><Headphones size={16} aria-hidden="true" /> Made for listening, together.</span></div></section>
      <section className={styles.loginPanel} aria-labelledby="login-heading">
        <p className={styles.eyebrow}>{site.eyebrow}</p><h2 className={styles.heading} id="login-heading">{heading}</h2><p className={styles.small} style={{ marginBottom: 24 }}>{subheading}</p>
        {!supabase ? <div className={styles.notice}><p>Private access isn’t configured on this deployment yet. You can still explore the curated archive.</p><Link href="/" className={styles.secondary}>Explore the music room</Link></div> : checking ? <p className={styles.small} role="status">Checking your session…</p> : <>
          <div className={styles.actions} role="group" aria-label="Account action">
            <button aria-label="Sign in options" aria-pressed={authMode === "sign-in"} className={authMode === "sign-in" ? styles.button : styles.secondary} disabled={busy} onClick={() => resetForm("sign-in")}>Sign in</button>
            <button aria-label="Create account options" aria-pressed={authMode === "register"} className={authMode === "register" ? styles.button : styles.secondary} disabled={busy} onClick={() => resetForm("register")}>Create account</button>
          </div>
          {authMode === "register" ? (registerVerified
            ? <div className={styles.notice}>
                <p>Account verified. Sign in with your password to enter the room.</p>
                <button className={styles.secondary} onClick={() => { resetForm("sign-in"); setMode("password"); }}>Sign in</button>
              </div>
            : registrationSent
              ? <form className={styles.form} onSubmit={(event) => void verifyRegister(event)} aria-busy={busy}>
                <label className={styles.label}>Verification code<input autoFocus className={`${styles.input} ${styles.code}`} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={token} onChange={(event) => setToken(event.target.value.replace(/\D/g, ""))} placeholder="6-digit code" disabled={busy} /></label>
                <button className={styles.button} disabled={busy || token.length < 6}>{busy ? "Verifying…" : "Verify code"}<ArrowRight size={15} aria-hidden="true" /></button>
                <div className={styles.actions} style={{ marginTop: 14 }}>
                  <button type="button" className={styles.secondary} disabled={busy || cooldown > 0} onClick={() => void resendRegisterCode()}>{cooldown ? `Resend in ${cooldown}s` : "Resend code"}</button>
                  <button type="button" className={styles.navLink} disabled={busy} onClick={() => { setRegistrationSent(false); setRegisterVerified(false); setToken(""); setError(""); setNotice(""); }}>Change email</button>
                </div>
              </form>
              : <form className={styles.form} onSubmit={(event) => void register(event)} aria-busy={busy}>
                <label className={styles.label}>Your name<input className={styles.input} type="text" autoComplete="name" maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="How should we call you?" disabled={busy} /></label>
                <label className={styles.label}>Your email<input className={styles.input} type="email" required autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" disabled={busy} /></label>
                <label className={styles.label}>Password<input className={styles.input} type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} /></label>
                <label className={styles.label}>Confirm password<input className={styles.input} type="password" required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} disabled={busy} /></label>
                <button className={styles.button} disabled={busy}>{busy ? "Creating account…" : "Create account"}<ArrowRight size={15} aria-hidden="true" /></button>
              </form>) : <>
            <form className={styles.form} onSubmit={(event) => void signIn(event)} aria-busy={busy}>
              {(stage === "email" || mode === "password") ? <label className={styles.label}>Your email<input className={styles.input} type="email" required autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" disabled={busy} /></label> : <label className={styles.label}>Email sign-in code<input autoFocus className={`${styles.input} ${styles.code}`} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" minLength={6} maxLength={10} required value={token} onChange={(event) => setToken(event.target.value.replace(/\D/g, ""))} placeholder="Enter your code" disabled={busy} /></label>}
              {mode === "password" && <label className={styles.label}>Password<input className={styles.input} type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} /></label>}
              <button className={styles.button} disabled={busy || (mode === "otp" && stage === "email" && cooldown > 0)}>{mode === "password" ? <KeyRound size={16} aria-hidden="true" /> : <Mail size={16} aria-hidden="true" />}{busy ? "One moment…" : mode === "password" ? "Sign in" : stage === "verify" ? "Enter the room" : cooldown ? `Send again in ${cooldown}s` : "Send sign-in code"}<ArrowRight size={15} aria-hidden="true" /></button>
            </form>
            {stage === "verify" && mode === "otp" && <div className={styles.actions} style={{ marginTop: 14 }}><button className={styles.secondary} disabled={busy || cooldown > 0} onClick={() => void sendCode()}>{cooldown ? `Resend in ${cooldown}s` : "Resend code"}</button><button className={styles.navLink} disabled={busy} onClick={() => { setStage("email"); setToken(""); setError(""); setNotice(""); }}>Change email</button></div>}
            <button className={styles.navLink} style={{ marginTop: 16 }} disabled={busy} onClick={() => { setMode(mode === "otp" ? "password" : "otp"); setStage("email"); setPassword(""); setToken(""); setError(""); setNotice(""); }}>{mode === "otp" ? "Use a password instead" : "Use an email sign-in code instead"}</button>
          </>}
          <p className={styles.small} style={{ borderTop: "1px solid var(--line)", paddingTop: 18, marginTop: 18 }}>Everyone can register. Your account lets you listen alone; Jam rooms stay private and are joined with a six-character code.</p>
        </>}
        {notice && <p className={styles.notice} role="status">{notice}</p>}{error && <p className={styles.error} role="alert">{error}</p>}
      </section>
    </div>
  </div></main>;
}
