"use client";

import { useEffect, useRef, useState } from "react";
import ChatWindow from "./Chat/ChatWindow";
import ChatAgentShell from "./Chat/ChatAgentShell";
import AnalysisProgressIndicator from "./AnalysisProgressIndicator";
import { analyzeWebsite } from "../lib/websiteAnalyzer";
import { BusinessProfile } from "../types/business";
import {
  formatLeadAlertsConfigured,
  isValidLeadAlertEmail,
  LEAD_ALERT_EMAIL_PROMPT,
  LEAD_ALERT_SMS_PROMPT,
  normalizeLeadAlertSms,
  shouldCollectLeadAlertSetup,
} from "../lib/leadAlertRecipients";

type PulseTechEngineChatProps = {
  website: string;
  additionalInfo?: string;
  className?: string;
  agentName?: string;
  agentRole?: string;
  agentAvatar?: string;
  onAnalysisComplete?: (profile: BusinessProfile) => void;
  onProfileUpdate?: (profile: BusinessProfile) => void;
  business?: BusinessProfile | null;
  /** Skip analysis and open directly in ready/feedback mode (invitation path). */
  skipAnalysis?: boolean;
  /** Shared demo id. Required for owner updates so one client cannot write another profile. */
  demoId?: string;
};

type ChatPhase =
  | "analyzing"
  | "collecting_email"
  | "collecting_sms"
  | "ready"
  | "error";

const DEFAULT_AGENT_NAME = "Peter";
const DEFAULT_AGENT_ROLE = "AI Sales Agent";
const DEFAULT_AGENT_AVATAR =
  "http://pulsetechlabs.com/wp-content/uploads/2026/07/PulseTech-Labs-Logo-icon-2.webp";

const ANALYZING_MESSAGE =
  "Give me a moment... I'm analyzing your website.";

const INVITE_READY_MESSAGE = `Your AI Sales Employee is ready.

I've analyzed your website and built it around your business, your services, and the customers you serve.

Now put it to work. Test it like a real customer, challenge it, and see how it handles the conversation. Find something missing? Tell me. I'll fix it instantly.`;

function getProgressLabel(progress: number): string {
  if (progress < 20) return "Connecting to your website...";
  if (progress < 45) return "Reading your website...";
  if (progress < 65) return "Understanding your business...";
  if (progress < 82) return "Learning your services...";
  if (progress < 95) return "Applying your business information...";
  if (progress < 100) return "Preparing your AI Sales Employee...";
  return "Your AI Sales Employee is ready.";
}

function elapsedForProgress(progress: number): number {
  if (progress <= 0) return 0;
  if (progress >= 99) return 18000 * 5;
  return -18000 * Math.log(1 - progress / 99);
}

export default function PulseTechEngineChat({
  website,
  additionalInfo = "",
  className = "",
  agentName = DEFAULT_AGENT_NAME,
  agentRole = DEFAULT_AGENT_ROLE,
  agentAvatar = DEFAULT_AGENT_AVATAR,
  onAnalysisComplete,
  onProfileUpdate,
  business = null,
  skipAnalysis = false,
  demoId = "",
}: PulseTechEngineChatProps) {
  const [phase, setPhase] = useState<ChatPhase>(() => {
    if (!skipAnalysis) return "analyzing";
    if (business && shouldCollectLeadAlertSetup(business)) {
      return "collecting_email";
    }
    return "ready";
  });
  const [assistantMessages, setAssistantMessages] = useState<string[]>([]);
  const [progress, setProgress] = useState(skipAnalysis ? 100 : 0);
  const [showProgress, setShowProgress] = useState(!skipAnalysis);
  const [retryToken, setRetryToken] = useState(0);

  const businessRef = useRef<BusinessProfile | null>(business);
  const progressRef = useRef(skipAnalysis ? 100 : 0);
  const animationFrameRef = useRef<number | null>(null);
  const analysisKeyRef = useRef("");
  const analysisPromiseRef = useRef<Promise<BusinessProfile> | null>(null);
  const completionHandledRef = useRef(skipAnalysis);
  const onCompleteRef = useRef(onAnalysisComplete);
  const onUpdateRef = useRef(onProfileUpdate);
  const [openingMessage] = useState(() => {
    if (!skipAnalysis) return ANALYZING_MESSAGE;
    if (business && shouldCollectLeadAlertSetup(business)) {
      return LEAD_ALERT_EMAIL_PROMPT;
    }
    return INVITE_READY_MESSAGE;
  });
  const pendingEmailRef = useRef("");
  const inviteSeededRef = useRef(false);

  useEffect(() => {
    businessRef.current = business;
  }, [business]);

  useEffect(() => {
    onCompleteRef.current = onAnalysisComplete;
    onUpdateRef.current = onProfileUpdate;
  }, [onAnalysisComplete, onProfileUpdate]);

  useEffect(() => {
    if (!skipAnalysis || inviteSeededRef.current) return;
    inviteSeededRef.current = true;
    setShowProgress(false);
    setProgress(100);
    if (business && shouldCollectLeadAlertSetup(business)) {
      setPhase("collecting_email");
    } else {
      setPhase("ready");
    }
  }, [skipAnalysis, business]);

  useEffect(() => {
    if (skipAnalysis) return;

    let active = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const analysisKey = `${website}::${additionalInfo}::${retryToken}`;

    if (analysisKeyRef.current !== analysisKey) {
      analysisKeyRef.current = analysisKey;
      analysisPromiseRef.current = null;
      completionHandledRef.current = false;
      progressRef.current = 0;
      setProgress(0);
      setShowProgress(true);
      setPhase("analyzing");
      setAssistantMessages([]);
      if (retryToken === 0) {
        businessRef.current = businessRef.current;
      }
    }

    if (!analysisPromiseRef.current) {
      analysisPromiseRef.current = analyzeWebsite(website, additionalInfo).then(
        (created) => created.profile
      );
    }

    const startedAt =
      performance.now() - elapsedForProgress(progressRef.current);

    function pushMessage(content: string) {
      if (!active) return;
      setAssistantMessages((prev) => {
        if (prev[prev.length - 1] === content) return prev;
        return [...prev, content];
      });
    }

    function stopProgressAnimation() {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }

    function updateProgress(next: number) {
      const value = Math.max(0, Math.min(100, next));
      progressRef.current = value;
      setProgress(value);
    }

    function animateStagedProgress(now: number) {
      if (!active) return;

      const elapsed = now - startedAt;
      const staged = 99 * (1 - Math.exp(-elapsed / 18000));
      const next = Math.min(99, staged);

      if (Math.abs(next - progressRef.current) >= 0.25 || next >= 99) {
        updateProgress(next);
      }

      animationFrameRef.current = requestAnimationFrame(animateStagedProgress);
    }

    if (!completionHandledRef.current) {
      setShowProgress(true);
      animationFrameRef.current = requestAnimationFrame(animateStagedProgress);
    }

    async function runAnalysis() {
      try {
        const profile = await analysisPromiseRef.current!;

        if (!active) return;

        if (completionHandledRef.current) {
          stopProgressAnimation();
          updateProgress(100);
          setShowProgress(false);
          setPhase("ready");
          return;
        }

        completionHandledRef.current = true;
        stopProgressAnimation();
        updateProgress(100);
        businessRef.current = profile;

        timers.push(
          setTimeout(() => {
            if (!active) return;
            setShowProgress(false);
            pushMessage(INVITE_READY_MESSAGE);
            setPhase("ready");
            onCompleteRef.current?.(profile);
          }, 450)
        );
      } catch (err) {
        if (!active) return;

        stopProgressAnimation();
        setShowProgress(false);
        completionHandledRef.current = false;
        analysisPromiseRef.current = null;

        const message =
          err instanceof Error && err.message
            ? err.message
            : "I couldn't analyze that website. Please try again.";

        pushMessage(
          `${message}

You can reply "retry" to try analyzing again.`
        );
        setPhase("error");
      }
    }

    runAnalysis();

    return () => {
      active = false;
      stopProgressAnimation();
      timers.forEach(clearTimeout);
    };
  }, [website, additionalInfo, skipAnalysis, retryToken]);

  async function persistProfile(
    next: BusinessProfile
  ): Promise<BusinessProfile> {
    if (!demoId) {
      throw new Error("A valid demo id is required to save lead alerts.");
    }
    const response = await fetch("/api/demo/" + encodeURIComponent(demoId), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: next }),
    });
    const data = (await response.json()) as {
      profile?: BusinessProfile;
      persisted?: boolean;
      error?: string;
    };
    if (!response.ok || data.persisted === false || !data.profile) {
      throw new Error(data.error || "Unable to save lead alerts.");
    }
    businessRef.current = data.profile;
    onUpdateRef.current?.(data.profile);
    return data.profile;
  }

  async function handleUserMessage(message: string): Promise<string> {
    const text = message.trim();

    if (phase === "analyzing") {
      return "I'm still analyzing your website. Please give me a moment.";
    }

    if (phase === "error") {
      if (/retry|try again|again/i.test(text)) {
        setRetryToken((value) => value + 1);
        return "Retrying analysis now...";
      }

      return `Analysis failed. Reply "retry" to try again, or return to the homepage with a different website.`;
    }

    if (phase === "collecting_email") {
      if (!isValidLeadAlertEmail(text)) {
        return LEAD_ALERT_EMAIL_PROMPT;
      }
      pendingEmailRef.current = text.trim().toLowerCase();
      setPhase("collecting_sms");
      return LEAD_ALERT_SMS_PROMPT;
    }

    if (phase === "collecting_sms") {
      const sms = normalizeLeadAlertSms(text);
      if (!sms) {
        return LEAD_ALERT_SMS_PROMPT;
      }
      const current = businessRef.current;
      if (!current) {
        return "Your AI Sales Employee isn't ready yet. Please wait for analysis to finish.";
      }
      try {
        const saved = await persistProfile({
          ...current,
          leadNotificationEmail: pendingEmailRef.current,
          leadNotificationPhone: sms,
        });
        const email = saved.leadNotificationEmail || pendingEmailRef.current;
        const phone = saved.leadNotificationPhone || sms;
        setPhase("ready");
        setAssistantMessages((prev) => [...prev, INVITE_READY_MESSAGE]);
        return formatLeadAlertsConfigured(email, phone);
      } catch {
        return "I couldn't save those lead-alert details. Please try the email and mobile number again.";
      }
    }

    if (!businessRef.current) {
      return "Your AI Sales Employee isn't ready yet. Please wait for analysis to finish.";
    }

    if (!demoId) {
      return "I can't update the shared profile without a demo id.";
    }

    try {
      const response = await fetch("/api/update-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          demoId,
          business: businessRef.current,
          feedback: text,
        }),
      });

      const data = (await response.json()) as {
        reply?: string;
        profile?: BusinessProfile;
        persisted?: boolean;
        error?: string;
      };

      if (!response.ok || !data.profile) {
        throw new Error(data.error || "Unable to update knowledge.");
      }

      businessRef.current = data.profile;
      onUpdateRef.current?.(data.profile);

      if (data.persisted === false) {
        return (
          data.reply ||
          "I applied that on this demo session. It is not in durable storage yet, so it may not survive a new deployment."
        );
      }

      return (
        data.reply ||
        "Updated the shared business profile. The website chat and phone AI now use it."
      );
    } catch {
      return "I couldn't update the Sales Employee just now. Please try again in a moment.";
    }
  }

  return (
    <ChatAgentShell
      name={agentName}
      role={agentRole}
      avatar={agentAvatar}
      className={className}
    >
      <ChatWindow
        initialMessage={openingMessage}
        assistantMessages={assistantMessages}
        placeholder={
          phase === "collecting_email"
            ? "Enter the business email address..."
            : phase === "collecting_sms"
              ? "Enter the mobile number with country code..."
              : phase === "ready"
                ? "Share updates for your AI Sales Employee..."
                : phase === "error"
                  ? 'Type "retry" to try again...'
                  : "Analyzing your website..."
        }
        disabled={phase === "analyzing"}
        onUserMessage={handleUserMessage}
        statusSlot={
          showProgress && phase === "analyzing" ? (
            <AnalysisProgressIndicator
              progress={progress}
              label={getProgressLabel(progress)}
            />
          ) : null
        }
      />
    </ChatAgentShell>
  );
}
