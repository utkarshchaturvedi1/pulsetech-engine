"use client";

import { useEffect, useState } from "react";
import DemoWorkspace, { DemoStatusScreen } from "../../components/DemoWorkspace";
import { BusinessProfile } from "../../types/business";
import {
  consumePendingDemo,
  loadDemoLocal,
} from "../../lib/demoStore";

type BootState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      demoId: string;
      profile: BusinessProfile;
    };

export default function DemoPage() {
  const [boot, setBoot] = useState<BootState>({ status: "loading" });

  useEffect(() => {
    async function bootDemo() {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("id")?.trim() ?? "";

      const pending = consumePendingDemo();
      if (pending?.profile) {
        setBoot({
          status: "ready",
          demoId: pending.id,
          profile: pending.profile,
        });
        if (pending.id && window.location.pathname === "/demo") {
          window.history.replaceState(
            null,
            "",
            `/demo/${encodeURIComponent(pending.id)}`
          );
        }
        return;
      }

      if (id) {
        try {
          const response = await fetch(`/api/demo/${encodeURIComponent(id)}`);
          if (response.ok) {
            const data = (await response.json()) as {
              profile: BusinessProfile;
              id: string;
            };
            setBoot({
              status: "ready",
              demoId: data.id || id,
              profile: data.profile,
            });
            return;
          }
        } catch {
          const local = loadDemoLocal(id);
          if (local?.profile) {
            setBoot({
              status: "ready",
              demoId: id,
              profile: local.profile,
            });
            return;
          }
        }

        setBoot({
          status: "error",
          message:
            "This invitation link could not find a saved demo. Please ask PulseTech to regenerate it.",
        });
        return;
      }

      setBoot({
        status: "error",
        message:
          "No demo was found. Please start from the homepage to create your AI Sales Employee.",
      });
    }

    void bootDemo();
  }, []);

  if (boot.status === "loading") {
    return <DemoStatusScreen message="Loading..." />;
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
