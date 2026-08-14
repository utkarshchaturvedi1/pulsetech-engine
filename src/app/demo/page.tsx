"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DemoWorkspace from "../../components/DemoWorkspace";
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
        const local = loadDemoLocal(id);
        if (local?.profile) {
          setBoot({
            status: "ready",
            demoId: id,
            profile: local.profile,
          });
          return;
        }

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
          // Fall through.
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
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="text-slate-500">Loading...</div>
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
