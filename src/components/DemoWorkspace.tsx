"use client";

import { useCallback, useEffect, useState } from "react";
import PulseTechEngineChat from "./PulseTechEngineChat";
import CustomerAI from "./CustomerAI";
import { BusinessProfile } from "../types/business";
import { demoIdFromWebsite, saveDemoLocal } from "../lib/demoStore";

type DemoWorkspaceProps = {
  initialProfile: BusinessProfile;
  demoId?: string;
};

const PETER_AVATAR =
  "http://pulsetechlabs.com/wp-content/uploads/2026/07/PulseTech-Labs-Logo-icon-2.webp";
const PULSETECH_LOGO =
  "http://pulsetechlabs.com/wp-content/uploads/2026/07/PulseTech-Labs-Logo-full-4.png";

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
    <main className="marketing-shell flex min-h-screen flex-col overflow-x-hidden lg:h-screen lg:overflow-hidden">
      <header className="shrink-0 border-b border-slate-200/80 bg-white/85 px-4 py-4 backdrop-blur-xl md:px-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <img
            src={PULSETECH_LOGO}
            alt="PulseTech Labs"
            className="h-9 w-auto object-contain sm:h-10"
          />
          <div className="min-w-0 sm:text-right">
            <h1 className="truncate text-xl font-semibold tracking-tight text-slate-950 md:text-2xl">
              {business.leadNotificationEmail
                ? business.businessName + "'s AI Sales Employee Is Ready."
                : business.businessName + "'s AI Sales Employee"}
            </h1>
            <p className="mt-1 text-sm text-slate-600 md:text-base">
              {business.leadNotificationEmail ? (
                <>
                  Test it. Challenge it. Tell me what&apos;s missing. I&apos;ll
                  fix it instantly.
                </>
              ) : (
                <>
                  One more step: tell Peter the{" "}
                  <strong className="font-bold text-slate-900">
                    Email address
                  </strong>{" "}
                  for new lead notifications before customer testing.
                </>
              )}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-5 overflow-x-hidden p-4 sm:p-5 lg:flex-row lg:items-stretch lg:gap-6 lg:p-6">
        <section className="flex min-h-0 w-full flex-1 flex-col lg:h-full">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">1 · Customize</p>
            <p className="text-xs text-slate-500">PulseTech setup assistant</p>
          </div>
          <div className="flex h-[520px] min-h-0 w-full flex-col overflow-hidden lg:h-full">
            <PulseTechEngineChat
              website={business.website}
              agentName="Peter"
              agentRole="AI Sales Agent"
              agentAvatar={PETER_AVATAR}
              business={business}
              skipAnalysis
              onProfileUpdate={handleProfileUpdate}
              className="h-full min-h-0"
            />
          </div>
        </section>

        <section className="flex min-h-0 w-full flex-1 flex-col lg:h-full">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">2 · Test as a customer</p>
            <p className="text-xs text-slate-500">Live sales conversation</p>
          </div>
          <div className="flex h-[520px] min-h-0 w-full flex-col overflow-hidden lg:h-full">
            <CustomerAI
              business={business}
              disabled={false}
              className="h-full min-h-0"
            />
          </div>
        </section>
      </div>
    </main>
  );
}
