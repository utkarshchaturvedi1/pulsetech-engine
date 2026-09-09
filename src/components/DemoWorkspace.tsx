"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import PulseTechEngineChat from "./PulseTechEngineChat";
import CustomerAI from "./CustomerAI";
import VoiceDemoCard from "./VoiceDemoCard";
import { BusinessProfile } from "../types/business";
import { demoIdFromWebsite, saveDemoLocal } from "../lib/demoStore";
import { DEMO_CHAT_LAYOUT } from "../lib/demoChatLayout";

type DemoWorkspaceProps = {
  initialProfile: BusinessProfile;
  demoId?: string;
};

const PETER_AVATAR =
  "https://pulsetechlabs.com/wp-content/uploads/2026/07/PulseTech-Labs-Logo-icon-2.webp";
const PULSETECH_LOGO =
  "https://pulsetechlabs.com/wp-content/uploads/2026/07/PulseTech-Labs-Logo-full-4.png";

async function persistDemo(id: string, profile: BusinessProfile) {
  saveDemoLocal({ id, profile, updatedAt: new Date().toISOString() });
  try {
    await fetch("/api/demo/" + encodeURIComponent(id), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile }),
    });
  } catch {
    // Local save is enough for the current session.
  }
}

function BrandLogo() {
  return <img src={PULSETECH_LOGO} alt="PulseTech Labs" className="pt-logo" />;
}

export function DemoStatusScreen({
  message,
  showHomeLink = false,
}: {
  message: string;
  showHomeLink?: boolean;
}) {
  return (
    <div className="pt-landing pt-demo min-h-screen">
      <div className="pt-shell min-h-screen">
        <div className="pt-content flex min-h-screen flex-col items-center justify-center px-6 py-12">
          <BrandLogo />
          <p className="mt-8 max-w-md text-center text-lg leading-8 text-slate-600">{message}</p>
          {showHomeLink ? (
            <Link href="/" className="pt-btn-primary mt-8 inline-flex">
              Back to Homepage
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function DemoWorkspace({
  initialProfile,
  demoId,
}: DemoWorkspaceProps) {
  const [business, setBusiness] = useState<BusinessProfile>(initialProfile);
  const resolvedDemoId = demoId || demoIdFromWebsite(business.website || "demo");

  const handleProfileUpdate = useCallback(
    (profile: BusinessProfile) => {
      setBusiness(profile);
      void persistDemo(resolvedDemoId, profile);
    },
    [resolvedDemoId]
  );

  useEffect(() => {
    saveDemoLocal({
      id: resolvedDemoId,
      profile: initialProfile,
      updatedAt: new Date().toISOString(),
    });
  }, [initialProfile, resolvedDemoId]);

  return (
    <div
      className="pt-landing pt-demo"
      style={
        {
          "--pt-demo-chat-height": `${DEMO_CHAT_LAYOUT.panelHeightPx}px`,
          "--pt-demo-customer-width": `${DEMO_CHAT_LAYOUT.customerPanelWidthPx}px`,
        } as CSSProperties
      }
    >
      <div className="pt-shell">
        <div className="pt-content flex min-h-screen min-w-0 flex-col overflow-x-hidden">
          <header className="pt-header shrink-0">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-4 sm:px-8 sm:py-5 lg:flex-row lg:items-center lg:justify-between">
              <BrandLogo />
              <div className="min-w-0 lg:max-w-xl lg:text-right">
                {business.businessName ? (
                  <p className="pt-kicker truncate">{business.businessName}</p>
                ) : null}
                <h1 className="mt-1 text-2xl font-extrabold tracking-[-0.03em] text-slate-950 sm:text-3xl">
                  Meet your AI Sales Employee
                </h1>
                <p className="mt-1.5 text-sm leading-6 text-slate-600 sm:text-base">
                  Guide your setup on the left. Test the customer experience on the right.
                </p>
              </div>
            </div>
          </header>

          <div className="pt-demo-workspace">
            <section
              className="pt-demo-panel pt-demo-panel-owner"
              data-demo-owner-panel
            >
              <div className="pt-demo-frame">
                <div className="pt-demo-caption">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-600">
                    Guide your setup
                  </p>
                  <p className="text-[11px] text-slate-500">PulseTech setup assistant</p>
                </div>
                <div className="pt-demo-chat">
                  <PulseTechEngineChat
                    website={business.website}
                    agentName="Peter"
                    agentRole="AI Sales Agent"
                    agentAvatar={PETER_AVATAR}
                    business={business}
                    demoId={resolvedDemoId}
                    skipAnalysis
                    onProfileUpdate={handleProfileUpdate}
                    className="h-full min-h-0 min-w-0 w-full"
                  />
                </div>
              </div>
            </section>

            <section
              className="pt-demo-panel pt-demo-panel-customer"
              data-demo-customer-panel
            >
              <div className="pt-demo-frame">
                <div className="pt-demo-caption">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-600">
                    Customer experience
                  </p>
                  <p className="text-[11px] text-slate-500">Live sales conversation</p>
                </div>
                <div className="pt-demo-chat">
                  <CustomerAI
                    business={business}
                    disabled={false}
                    className="h-full min-h-0 min-w-0 w-full"
                  />
                </div>
              </div>
            </section>
          </div>

          <div className="pt-voice-demo-wrap">
            <VoiceDemoCard demoId={resolvedDemoId} />
          </div>
        </div>
      </div>
    </div>
  );
}
