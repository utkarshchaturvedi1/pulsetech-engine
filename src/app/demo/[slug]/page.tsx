"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import DemoWorkspace, { DemoStatusScreen } from "../../../components/DemoWorkspace";
import { BusinessProfile } from "../../../types/business";
import { loadDemoLocal, saveDemoLocal } from "../../../lib/demoStore";

type BootState =
  | { status: "loading" }
  | { status: "auth" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      demoId: string;
      profile: BusinessProfile;
    };

export default function DemoSlugPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const [boot, setBoot] = useState<BootState>({ status: "loading" });

  useEffect(() => {
    async function load() {
      if (!slug) {
        setBoot({
          status: "error",
          message: "Invalid invitation link.",
        });
        return;
      }

      const local = loadDemoLocal(slug);

      try {
        const response = await fetch(`/api/demo/${encodeURIComponent(slug)}`);
        if (response.status === 401) {
          // Do not fall back to locally cached business data for an unauthenticated visitor.
          setBoot({ status: "auth" });
          return;
        }
        if (response.status === 403) {
          setBoot({
            status: "error",
            message: "This account does not have access to this business profile. Contact PulseTech for help.",
          });
          return;
        }
        if (response.ok) {
          const data = (await response.json()) as {
            id: string;
            profile: BusinessProfile;
          };
          saveDemoLocal({
            id: data.id || slug,
            profile: data.profile,
            updatedAt: new Date().toISOString(),
          });
          setBoot({
            status: "ready",
            demoId: data.id || slug,
            profile: data.profile,
          });
          return;
        }
        if (response.status === 404) {
          setBoot({
            status: "error",
            message:
              "This invitation link could not find a saved demo. Please ask PulseTech to regenerate it.",
          });
          return;
        }
      } catch {
        // Fall through to local cache only when the network request fails.
      }

      if (local?.profile?.businessName) {
        setBoot({
          status: "ready",
          demoId: slug,
          profile: local.profile,
        });
        return;
      }

      setBoot({
        status: "error",
        message:
          "This invitation link could not find a saved demo. Please ask PulseTech to regenerate it.",
      });
    }

    void load();
  }, [slug]);

  if (boot.status === "loading") {
    return <DemoStatusScreen message="Loading your demo..." />;
  }

  if (boot.status === "auth") {
    const returnPath = `/demo/${encodeURIComponent(slug)}`;
    return (
      <main className="pt-landing pt-demo pt-demo-status min-h-screen">
        <div className="pt-shell min-h-screen">
          <div className="pt-content flex min-h-screen flex-col items-center justify-center px-6 py-12">
            <img src="/branding/pulsetech-logo-color.svg" alt="PulseTech Labs" className="pt-logo" />
            <h1 className="mt-8 text-center text-2xl font-bold">Sign in to open your business setup</h1>
            <p className="pt-demo-status-message mt-4 max-w-md text-center text-lg leading-8">
              This saved business setup is private. Sign in with the email connected to your client account.
            </p>
            <Link
              href={`/login?next=${encodeURIComponent(returnPath)}`}
              className="pt-btn-primary mt-8 inline-flex"
            >
              Continue to sign in
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (boot.status === "error") {
    return <DemoStatusScreen message={boot.message} showHomeLink />;
  }

  return (
    <DemoWorkspace
      demoId={boot.demoId}
      initialProfile={boot.profile}
    />
  );
}
