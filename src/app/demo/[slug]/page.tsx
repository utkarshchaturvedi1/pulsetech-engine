"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import DemoWorkspace from "../../../components/DemoWorkspace";
import { BusinessProfile } from "../../../types/business";
import { loadDemoLocal, saveDemoLocal } from "../../../lib/demoStore";

type BootState =
  | { status: "loading" }
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
      if (local?.profile) {
        setBoot({
          status: "ready",
          demoId: slug,
          profile: local.profile,
        });
        return;
      }

      try {
        const response = await fetch(`/api/demo/${encodeURIComponent(slug)}`);
        if (!response.ok) {
          setBoot({
            status: "error",
            message:
              "This invitation link could not find a saved demo. Please ask PulseTech to regenerate it.",
          });
          return;
        }

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
      } catch {
        setBoot({
          status: "error",
          message:
            "Unable to load this demo right now. Please try again shortly.",
        });
      }
    }

    void load();
  }, [slug]);

  if (boot.status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="text-slate-500">Loading your demo...</div>
      </main>
    );
  }

  if (boot.status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
        <div className="max-w-md text-center">
          <p className="text-lg text-slate-700">{boot.message}</p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
          >
            Back to Homepage
          </Link>
        </div>
      </main>
    );
  }

  return (
    <DemoWorkspace
      demoId={boot.demoId}
      initialProfile={boot.profile}
    />
  );
}
