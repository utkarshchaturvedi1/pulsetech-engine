"use client";

import { useEffect, useRef, useState } from "react";
import ChatWindow from "./Chat/ChatWindow";
import ChatAgentShell from "./Chat/ChatAgentShell";
import AnalysisProgressIndicator from "./AnalysisProgressIndicator";
import { analyzeWebsite } from "../lib/websiteAnalyzer";
import {
  demoIdFromWebsite,
  savePendingDemo,
} from "../lib/demoStore";
import { BusinessProfile } from "../types/business";

type Props = {
  agentName?: string;
  agentRole?: string;
  agentAvatar?: string;
};

type Phase = "intake" | "analyzing" | "error";

const DEFAULT_AGENT_NAME = "Peter";
const DEFAULT_AGENT_ROLE = "AI Sales Agent";
const DEFAULT_AGENT_AVATAR =
  "http://pulsetechlabs.com/wp-content/uploads/2026/07/PulseTech-Labs-Logo-icon-2.webp";

const CREATING_MESSAGE =
  "I'm creating your AI Sales Employee around your business. Give me a moment...";

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

async function persistAndOpenDemo(profile: BusinessProfile) {
  const id = demoIdFromWebsite(profile.website);

  savePendingDemo({
    id,
    profile,
    updatedAt: new Date().toISOString(),
  });

  try {
    await fetch(`/api/demo/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ profile }),
    });
  } catch {
    // Local/session persistence is enough to open the demo.
  }

  window.location.href = `/demo/${encodeURIComponent(id)}`;
}

export default function PulseTechSalesAssistant({
  agentName = DEFAULT_AGENT_NAME,
  agentRole = DEFAULT_AGENT_ROLE,
  agentAvatar = DEFAULT_AGENT_AVATAR,
}: Props) {
  const [phase, setPhase] = useState<Phase>("intake");
  const [website, setWebsite] = useState("");
  const [retryToken, setRetryToken] = useState(0);
  const [assistantMessages, setAssistantMessages] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [showProgress, setShowProgress] = useState(false);

  const websiteRef = useRef("");
  const progressRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const analysisKeyRef = useRef("");
  const analysisPromiseRef = useRef<Promise<BusinessProfile> | null>(null);
  const completionHandledRef = useRef(false);

  useEffect(() => {
    if (phase !== "analyzing") return;

    let active = true;
    const analysisKey = `${website}::${retryToken}`;

    if (analysisKeyRef.current !== analysisKey) {
      analysisKeyRef.current = analysisKey;
      analysisPromiseRef.current = null;
      completionHandledRef.current = false;
      progressRef.current = 0;
      setProgress(0);
      setShowProgress(true);
    }

    if (!analysisPromiseRef.current) {
      analysisPromiseRef.current = analyzeWebsite(website);
    }

    const startedAt =
      performance.now() - elapsedForProgress(progressRef.current);

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
          return;
        }

        completionHandledRef.current = true;
        stopProgressAnimation();
        updateProgress(100);
        setShowProgress(false);

        setAssistantMessages((prev) => [
          ...prev,
          "🎉 Your AI Sales Employee is ready. Opening your demo...",
        ]);

        await persistAndOpenDemo(profile);
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

        setAssistantMessages((prev) => [
          ...prev,
          `${message}

You can reply "retry" to try again.`,
        ]);
        setPhase("error");
      }
    }

    void runAnalysis();

    return () => {
      active = false;
      stopProgressAnimation();
    };
  }, [phase, website, retryToken]);

  async function handleMessage(message: string): Promise<string> {
    const text = message.trim();

    if (phase === "analyzing") {
      return "I'm still creating your AI Sales Employee. Please give me a moment.";
    }

    if (phase === "error") {
      if (/retry|try again|again/i.test(text)) {
        setPhase("analyzing");
        setShowProgress(true);
        setProgress(0);
        progressRef.current = 0;
        setRetryToken((value) => value + 1);
        return CREATING_MESSAGE;
      }

      return `Analysis failed. Reply "retry" to try again.`;
    }

    if (websiteRef.current) {
      return "I'm already working with the website you shared. Please wait while I create your AI Sales Employee.";
    }

    websiteRef.current = text;
    setWebsite(text);
    setPhase("analyzing");
    setShowProgress(true);
    setProgress(0);
    progressRef.current = 0;

    return CREATING_MESSAGE;
  }

  return (
    <ChatAgentShell
      name={agentName}
      role={agentRole}
      avatar={agentAvatar}
      className="h-full min-h-0"
    >
      <ChatWindow
        initialMessage={`Hi, I'm Peter, PulseTech's AI Sales Agent.

I specialize in creating AI Sales Employees customized and trained around your business.

Before you make any decision, see what yours can actually do.

What's your website?`}
        assistantMessages={assistantMessages}
        placeholder={
          phase === "analyzing"
            ? "Creating your AI Sales Employee..."
            : phase === "error"
              ? 'Type "retry" to try again...'
              : "Enter your website..."
        }
        disabled={phase === "analyzing"}
        onUserMessage={handleMessage}
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
