"use client";

// ─────────────────────────────────────────────────────────────────────────────
// AuthGate — full-screen sign-in prompt shown before the EntryGate when the
// deployment has Supabase configured and the visitor isn't signed in.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { motion } from "framer-motion";

export default function AuthGate({ siteName }: { siteName: string }) {
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
        <p className="entry-tagline">This room is invite-only.</p>
        <Link href="/login" className="entry-btn" style={{ textDecoration: "none" }} role="button">
          <span className="entry-btn-dot" aria-hidden="true" />
          SIGN IN
        </Link>
        <p className="entry-hint">Check your invitation email for details</p>
      </motion.div>
    </motion.div>
  );
}
