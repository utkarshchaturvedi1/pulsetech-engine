"use client";

import PulseTechSalesAssistant from "../components/PulseTechSalesAssistant";

const PETER_AVATAR =
  "http://pulsetechlabs.com/wp-content/uploads/2026/07/PulseTech-Labs-Logo-icon-2.webp";

export default function Home() {
  return (
    <main className="flex h-screen items-center justify-center overflow-hidden bg-slate-100 p-4">
      <div className="h-[calc(100vh-2rem)] w-full max-w-md overflow-hidden">
        <PulseTechSalesAssistant
          agentName="Peter"
          agentRole="AI Sales Agent"
          agentAvatar={PETER_AVATAR}
        />
      </div>
    </main>
  );
}
