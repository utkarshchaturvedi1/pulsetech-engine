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
const PULSETECH_LOGO = "/branding/pulsetech-logo-color.svg";

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
        } as CSSProperties
      }
    >
      <div className="pt-shell">
        <div className="pt-content flex min-h-screen min-w-0 flex-col overflow-x-hidden">
          <header className="pt-header shrink-0">
            <div className="pt-demo-header-inner">
              <BrandLogo />
              <div className="pt-demo-header-copy min-w-0">
                {business.businessName ? (
                  <p className="pt-kicker truncate">{business.businessName}</p>
                ) : null}
                <h1 className="pt-demo-header-title">
                  Meet your AI Sales Employee
                </h1>
                <p className="pt-demo-header-lead">
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
                  <p className="pt-demo-label pt-demo-label-setup">1 · Customize</p>
                  <p className="pt-demo-caption-note">PulseTech setup assistant</p>
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
              style={
                {
                  "--pt-accent": business.primaryColor || "#209EBB",
                  "--pt-accent-secondary": business.secondaryColor || "#023047",
                } as CSSProperties
              }
            >
              <div className="pt-demo-frame">
                <div className="pt-demo-caption">
                  <p className="pt-demo-label pt-demo-label-customer">
                    2 · Test as a customer
                  </p>
                  <p className="pt-demo-caption-note">Live sales conversation</p>
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
