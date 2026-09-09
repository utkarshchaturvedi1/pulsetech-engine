"use client";

import { useCallback, useEffect, useState } from "react";
import { VOICE_DEMO_DISCLAIMER } from "../lib/voiceDemoCopy";

type SessionPayload = {
  enabled: boolean;
  phoneNumber: string | null;
  message: string | null;
  disclaimer: string;
  session: {
    id: string;
    code: string;
    demoId: string;
    expiresAt: string;
    createdAt: string;
    lastUsedAt: string | null;
  } | null;
};

type VoiceDemoCardProps = {
  demoId: string;
};

function formatCountdown(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m + ":" + String(s).padStart(2, "0");
}

export default function VoiceDemoCard({ demoId }: VoiceDemoCardProps) {
  const [payload, setPayload] = useState<SessionPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"code" | "phone" | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const loadSession = useCallback(
    async (opts?: { forceNew?: boolean }) => {
      setBusy(true);
      setError(null);
      try {
        const response = await fetch("/api/voice-demo/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            demoId,
            forceNew: Boolean(opts?.forceNew),
          }),
        });
        const data = (await response.json()) as SessionPayload & { error?: string };
        if (!response.ok) {
          setError(data.error || "Unable to load voice demo.");
          setPayload(null);
          return;
        }
        setPayload(data);
      } catch {
        setError("Unable to load voice demo.");
        setPayload(null);
      } finally {
        setBusy(false);
      }
    },
    [demoId]
  );

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Soft refresh expiry while the page stays open (activity).
  useEffect(() => {
    if (!payload?.session?.id || !payload.enabled) return;
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const response = await fetch("/api/voice-demo/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              demoId,
              refreshSessionId: payload.session?.id,
            }),
          });
          if (!response.ok) return;
          const data = (await response.json()) as SessionPayload;
          setPayload(data);
        } catch {
          // Keep showing the last known session until expiry.
        }
      })();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [demoId, payload?.enabled, payload?.session?.id]);

  async function copyText(value: string, kind: "code" | "phone") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      // Ignore clipboard failures.
    }
  }

  // Production with no public numbers: hide entirely.
  if (payload && !payload.enabled && !payload.message) {
    return null;
  }

  const remainingMs = payload?.session
    ? new Date(payload.session.expiresAt).getTime() - now
    : 0;
  const expired = Boolean(payload?.session && remainingMs <= 0);
  const disclaimer = payload?.disclaimer || VOICE_DEMO_DISCLAIMER;

  return (
    <section className="pt-voice-demo" data-voice-demo-card>
      <div className="pt-voice-demo-inner">
        <div className="pt-voice-demo-copy">
          <p className="pt-kicker">Phone test</p>
          <h2 className="pt-voice-demo-title">
            Test your AI Sales Employee by phone
          </h2>
          <p className="pt-voice-demo-disclaimer" data-voice-demo-disclaimer>
            {disclaimer}
          </p>
        </div>

        {error ? (
          <p className="pt-voice-demo-error">{error}</p>
        ) : null}

        {!payload && !error ? (
          <p className="pt-voice-demo-muted">Preparing your voice demo…</p>
        ) : null}

        {payload && !payload.enabled ? (
          <div className="pt-voice-demo-soon" data-voice-demo-coming-soon>
            <p>{payload.message || "Voice demo will be enabled shortly"}</p>
          </div>
        ) : null}

        {payload?.enabled && payload.session ? (
          <div className="pt-voice-demo-controls">
            <div className="pt-voice-demo-field">
              <span className="pt-voice-demo-label">Demo number</span>
              <div className="pt-voice-demo-row">
                <strong data-voice-demo-phone>
                  {payload.phoneNumber || "—"}
                </strong>
                {payload.phoneNumber ? (
                  <button
                    type="button"
                    className="pt-voice-demo-ghost"
                    onClick={() =>
                      void copyText(payload.phoneNumber || "", "phone")
                    }
                  >
                    {copied === "phone" ? "Copied" : "Copy"}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="pt-voice-demo-field">
              <span className="pt-voice-demo-label">Access code</span>
              <div className="pt-voice-demo-row">
                <strong
                  className="pt-voice-demo-code"
                  data-voice-demo-code
                >
                  {expired ? "Expired" : payload.session.code}
                </strong>
                {!expired ? (
                  <button
                    type="button"
                    className="pt-voice-demo-ghost"
                    onClick={() => void copyText(payload.session!.code, "code")}
                  >
                    {copied === "code" ? "Copied" : "Copy"}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="pt-voice-demo-meta">
              <span data-voice-demo-countdown>
                {expired
                  ? "Code expired"
                  : "Expires in " + formatCountdown(remainingMs)}
              </span>
              <button
                type="button"
                className="pt-btn-secondary pt-voice-demo-regen"
                disabled={busy}
                onClick={() => void loadSession({ forceNew: true })}
                data-voice-demo-regen
              >
                {busy ? "Working…" : "Generate a new code"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
