"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { exchangeCodeForTokens } from "../../lib/spotify/pkce";

function CallbackLogic() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      setStatus("error");
      setErrorMessage(
        error === "access_denied"
          ? "Spotify login was cancelled."
          : `Spotify error: ${error}`,
      );
      return;
    }

    if (!code) {
      setStatus("error");
      setErrorMessage("No authorization code returned from Spotify.");
      return;
    }

    exchangeCodeForTokens(code)
      .then(() => {
        setStatus("success");
        setTimeout(() => router.replace("/"), 1200);
      })
      .catch((err: unknown) => {
        setStatus("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Token exchange failed.",
        );
      });
  }, [searchParams, router]);

  return (
    <>
      {status === "processing" && (
        <div>
          <p style={{ color: "var(--muted)", textTransform: "uppercase" }}>
            CONNECTING TO SPOTIFY…
          </p>
        </div>
      )}

      {status === "success" && (
        <div>
          <p style={{ color: "var(--accent)", textTransform: "uppercase", marginBottom: "12px" }}>
            ✓ SPOTIFY CONNECTED
          </p>
          <p style={{ color: "var(--muted)" }}>Returning to adhurekisse…</p>
        </div>
      )}

      {status === "error" && (
        <div>
          <p style={{ color: "#e05555", textTransform: "uppercase", marginBottom: "16px" }}>
            Connection failed
          </p>
          <p style={{ color: "var(--muted)", marginBottom: "28px", maxWidth: "360px" }}>
            {errorMessage}
          </p>
          <button
            onClick={() => router.replace("/")}
            style={{
              border: "1px solid var(--border)",
              background: "none",
              color: "var(--foreground)",
              padding: "10px 24px",
              letterSpacing: "0.18em",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
            }}
          >
            RETURN HOME
          </button>
        </div>
      )}
    </>
  );
}

export default function SpotifyCallbackPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "var(--background)",
        color: "var(--foreground)",
        fontFamily: "var(--font-mono)",
        fontSize: "12px",
        letterSpacing: "0.18em",
        textAlign: "center",
        padding: "40px 20px",
      }}
    >
      <Suspense fallback={<div><p style={{ color: "var(--muted)", textTransform: "uppercase" }}>LOADING…</p></div>}>
        <CallbackLogic />
      </Suspense>
    </main>
  );
}
