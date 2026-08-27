export type WebsiteIntakePhase = "intake" | "analyzing" | "error";

export type WebsiteIntakeSession = {
  phase: WebsiteIntakePhase;
  lastWebsite: string;
  retryCount: number;
};

export type WebsiteIntakeDecision =
  | { kind: "wait"; reply: string }
  | { kind: "retry" }
  | { kind: "analyze"; website: string }
  | { kind: "ask_full_domain"; reply: string }
  | { kind: "error_help"; reply: string };

export const WEBSITE_INTAKE_WAIT_REPLY =
  "I'm still creating your AI Sales Employee. Please give me a moment.";

export const WEBSITE_FULL_DOMAIN_PROMPT =
  "Please enter the full website or domain, including the extension — for example, yourbusiness.com.";

export const WEBSITE_INTAKE_ERROR_HELP =
  'Analysis failed. Reply "retry" to try the same website again, or enter a different website.';

const RETRY_RE = /retry|try again|again/i;

export function createWebsiteIntakeSession(): WebsiteIntakeSession {
  return {
    phase: "intake",
    lastWebsite: "",
    retryCount: 0,
  };
}

export function isRetryIntent(text: string): boolean {
  return RETRY_RE.test(text.trim());
}

export function isIncompleteDomain(text: string): boolean {
  const host = hostnameFromInput(text);
  if (!host) return false;
  return !host.includes(".");
}

export function extractWebsiteCandidate(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  const tokens = trimmed.split(/\s+/);
  for (const token of tokens) {
    const candidate = websiteCandidateFromToken(token);
    if (candidate) return candidate;
  }

  return undefined;
}

export function resolveWebsiteIntake(
  session: WebsiteIntakeSession,
  rawText: string
): WebsiteIntakeDecision {
  const text = rawText.trim();

  if (session.phase === "analyzing") {
    return { kind: "wait", reply: WEBSITE_INTAKE_WAIT_REPLY };
  }

  const website = extractWebsiteCandidate(text);
  if (website) {
    return { kind: "analyze", website };
  }

  if (session.phase === "error" && isRetryIntent(text) && session.lastWebsite) {
    return { kind: "retry" };
  }

  if (isIncompleteDomain(text)) {
    return { kind: "ask_full_domain", reply: WEBSITE_FULL_DOMAIN_PROMPT };
  }

  if (session.phase === "error") {
    return { kind: "error_help", reply: WEBSITE_INTAKE_ERROR_HELP };
  }

  return { kind: "ask_full_domain", reply: WEBSITE_FULL_DOMAIN_PROMPT };
}

export function applyWebsiteIntakeMessage(
  session: WebsiteIntakeSession,
  rawText: string
): { session: WebsiteIntakeSession; decision: WebsiteIntakeDecision } {
  const decision = resolveWebsiteIntake(session, rawText);

  if (decision.kind === "analyze") {
    return {
      decision,
      session: {
        phase: "analyzing",
        lastWebsite: decision.website,
        retryCount: 0,
      },
    };
  }

  if (decision.kind === "retry") {
    return {
      decision,
      session: {
        ...session,
        phase: "analyzing",
        retryCount: session.retryCount + 1,
      },
    };
  }

  return { session, decision };
}

export function markWebsiteIntakeFailed(
  session: WebsiteIntakeSession
): WebsiteIntakeSession {
  return {
    ...session,
    phase: "error",
  };
}

function websiteCandidateFromToken(token: string): string | undefined {
  const cleaned = stripTrailingPunctuation(token);
  if (!cleaned || cleaned.includes("@")) return undefined;

  const host = hostnameFromInput(cleaned);
  if (!host || !host.includes(".")) return undefined;

  const labels = host.split(".");
  const tld = labels[labels.length - 1] || "";
  if (!/^[a-z]{2,}$/i.test(tld)) return undefined;
  if (labels.some((label) => !label)) return undefined;

  return cleaned;
}

function hostnameFromInput(text: string): string | undefined {
  const cleaned = stripTrailingPunctuation(text.trim());
  if (!cleaned || /\s/.test(cleaned)) return undefined;
  if (/^[a-z][a-z0-9+.-]*:/i.test(cleaned) && !/^https?:\/\//i.test(cleaned)) {
    return undefined;
  }

  const withoutProtocol = cleaned.replace(/^https?:\/\//i, "");
  const host = (withoutProtocol.split(/[/:?#]/)[0] || "").replace(/^www\./i, "");
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i.test(host)) {
    return undefined;
  }

  return host.toLowerCase();
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[.,!?);:'"]+$/g, "");
}
