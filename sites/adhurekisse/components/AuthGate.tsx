"use client";

// ─────────────────────────────────────────────────────────────────────────────
// AuthGate — full-screen sign-in prompt shown before the EntryGate when the
// deployment has Supabase configured and the visitor isn't signed in.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { safeReturnPath } from "./private-library/helpers";

export default function AuthGate({ siteName }: { siteName: string }) {
  const [destination, setDestination] = useState("/");
  useEffect(() => { setDestination(safeReturnPath(`${window.location.pathname}${window.location.search}${window.location.hash}`)); }, []);
  const loginHref = `/login?next=${encodeURIComponent(destination)}`;

  return (
    <motion.div
      className="entry-gate"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      role="dialog"
      aria-label="Sign in required"
      aria-modal="true"
    >
      <div className="entry-gate-bg" aria-hidden="true" />
      <motion.div
        className="entry-gate-content"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
      >
        <p className="entry-eyebrow">A PRIVATE MUSIC ROOM</p>
        <h1 className="entry-title" lang="hi">{siteName}</h1>
        <p className="entry-tagline">Listen solo, then invite someone to a private Jam.</p>
        <Link href={loginHref} className="entry-btn" style={{ textDecoration: "none" }} role="button">
          <span className="entry-btn-dot" aria-hidden="true" />
          SIGN IN
        </Link>
        <Link href={`${loginHref}&mode=register`} className="entry-btn" style={{ textDecoration: "none", marginTop: 12 }} role="button">REGISTER</Link>
        <p className="entry-hint">Create an account to listen. Jam rooms use a six-character code.</p>
      </motion.div>
    </motion.div>
  );
}
