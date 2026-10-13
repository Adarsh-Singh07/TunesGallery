"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Disc3, Library, LogOut, ShieldCheck } from "lucide-react";
import type { Profile } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { errorMessage } from "./api";
import type { useLibrarySession } from "./useLibrarySession";
import styles from "./private-library.module.css";

export function LibraryShell({ children, active, profile }: { children: ReactNode; active: "library" | "admin"; profile?: Profile | null }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true); setError("");
    try { const result = await supabase?.auth.signOut(); if (result?.error) throw result.error; }
    catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  return <main className={styles.page}><div className={styles.container}>
    <nav className={styles.nav} aria-label="Library navigation">
      <Link className={styles.brand} href="/">adhurekisse<span aria-hidden="true">.</span></Link>
      <div className={styles.actions}>
        <Link className={styles.navLink} href="/"><ArrowLeft size={15} aria-hidden="true" /> Music room</Link>
        <Link className={styles.navLink} href="/library" aria-current={active === "library" ? "page" : undefined}><Library size={15} aria-hidden="true" /> Library</Link>
        {profile?.is_admin && <Link className={styles.navLink} href="/admin" aria-current={active === "admin" ? "page" : undefined}><ShieldCheck size={15} aria-hidden="true" /> Studio</Link>}
        {profile && <button className={styles.iconButton} onClick={() => void logout()} disabled={busy} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>}
      </div>
    </nav>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {children}
  </div></main>;
}

export function SessionBoundary({ session, admin = false, returnTo, children }: { session: ReturnType<typeof useLibrarySession>; admin?: boolean; returnTo?: string; children: ReactNode }) {
  if (session.status === "loading") return <div className={styles.loading} role="status">Opening your collection…</div>;
  if (session.status !== "ready") return <section className={styles.empty}>
    <Disc3 aria-hidden="true" /><h1 className={styles.heading}>{session.status === "error" ? "We couldn’t open your library" : "A room for your records"}</h1>
    <p>{session.error || (session.configured ? "Sign in with your invited email to find the music shared with you." : "Private access is not configured on this deployment yet. The curated archive is waiting in the music room.")}</p>
    <div className={styles.actions}>
      {session.status === "error" && <button className={styles.secondary} onClick={session.retry}>Try again</button>}
      {session.configured && <Link className={styles.button} href={`/login?next=${encodeURIComponent(returnTo ?? (admin ? "/admin" : "/library"))}`}>Sign in</Link>}
      <Link className={styles.secondary} href="/">Explore the archive</Link>
    </div>
  </section>;
  if (admin && !session.profile?.is_admin) return <section className={styles.empty}><ShieldCheck aria-hidden="true" /><h1 className={styles.heading}>The owner’s studio</h1><p>This workspace is for the library owner. Your shared tracks and playlists are in your library.</p><Link href="/library" className={styles.button}>Open my library</Link></section>;
  return <>{children}</>;
}
