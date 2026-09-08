"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import DemoWorkspace, { DemoStatusScreen } from "../../../components/DemoWorkspace";
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

      try {
        const response = await fetch(`/api/demo/${encodeURIComponent(slug)}`);
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
      } catch {
        // Fall through to local cache.
      }

      if (local?.profile) {
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
