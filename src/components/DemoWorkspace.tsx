"use client";

import { useCallback, useEffect, useState } from "react";
import PulseTechEngineChat from "./PulseTechEngineChat";
import CustomerAI from "./CustomerAI";
import { BusinessProfile } from "../types/business";
import {
  demoIdFromWebsite,
  saveDemoLocal,
} from "../lib/demoStore";

type DemoWorkspaceProps = {
  initialProfile: BusinessProfile;
  demoId?: string;
};

const PETER_AVATAR =
  "http://pulsetechlabs.com/wp-content/uploads/2026/07/PulseTech-Labs-Logo-icon-2.webp";
const PULSETECH_LOGO =
  "http://pulsetechlabs.com/wp-content/uploads/2026/07/PulseTech-Labs-Logo-full-4.png";

async function persistDemo(id: string, profile: BusinessProfile) {
  saveDemoLocal({
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
    // Local save is enough for the current session.
  }
}

export default function DemoWorkspace({
  initialProfile,
  demoId,
}: DemoWorkspaceProps) {
  const [business, setBusiness] = useState<BusinessProfile>(initialProfile);

  const resolvedDemoId =
    demoId || demoIdFromWebsite(business.website || "demo");

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
    <main className="flex h-screen flex-col overflow-hidden bg-slate-100">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 md:px-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <img
            src={PULSETECH_LOGO}
            alt="PulseTech Labs"
            className="h-10 w-auto object-contain"
          />
          <div className="min-w-0 sm:text-right">
            <h1 className="truncate text-xl font-bold text-slate-900 md:text-2xl">
              {business.businessName}&apos;s AI Sales Employee Is Ready.
            </h1>
            <p className="mt-1 text-sm text-slate-600 md:text-base">
              Test it. Challenge it. Tell me what&apos;s missing. I&apos;ll fix
              it instantly.
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-4 p-4 md:flex-row md:gap-6 md:p-6">
        <section className="flex h-[min(50%,420px)] min-h-0 w-full flex-col md:h-full md:w-5/12">
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
        </section>

        <section className="flex h-[min(50%,420px)] min-h-0 w-full flex-col items-center justify-center md:h-full md:flex-1">
          <div className="mx-auto flex h-full min-h-0 w-full max-w-[420px] flex-col overflow-hidden sm:max-w-[420px]">
            <CustomerAI
              business={business}
              disabled={false}
              className="h-full min-h-0 max-w-none"
            />
          </div>
        </section>
      </div>
    </main>
  );
}
