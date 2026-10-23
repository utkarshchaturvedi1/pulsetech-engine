import type { Metadata } from "next";
import type { CSSProperties } from "react";
import CustomerAI from "../../../components/CustomerAI";
import { createBusinessProfile } from "../../../lib/businessProfile";
import { sanitizeDemoId } from "../../../lib/demoRepository";
import { loadSharedProfile } from "../../../lib/sharedProfileStore";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI Sales Employee",
  robots: { index: false, follow: false },
};

export default async function EmbeddedChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = sanitizeDemoId(rawId);
  const saved = id ? await loadSharedProfile(id) : null;

  if (!saved?.profile?.businessName) {
    return (
      <main className="flex h-dvh min-h-[460px] w-full items-center justify-center bg-white p-6 text-center font-sans text-slate-700">
        This chat is not available. Please contact the business directly.
      </main>
    );
  }

  // The browser only needs the visible brand identity. The server reloads the
  // authoritative profile by demoId before generating replies or lead alerts.
  const publicBusiness = createBusinessProfile({
    website: saved.profile.website,
    businessName: saved.profile.businessName,
    tagline: saved.profile.tagline,
    logo: saved.profile.logo,
    siteIcon: saved.profile.siteIcon,
    primaryColor: saved.profile.primaryColor,
    secondaryColor: saved.profile.secondaryColor,
    agentName: saved.profile.agentName,
  });
  const accentColor = /^#[\da-f]{3,8}$/i.test(publicBusiness.primaryColor)
    ? publicBusiness.primaryColor
    : "#2563eb";
  const theme = { "--pt-accent": accentColor } as CSSProperties;

  return (
    <main style={theme} className="h-dvh min-h-[460px] w-full overflow-hidden bg-transparent p-0 font-sans">
      <CustomerAI business={publicBusiness} demoId={id} disabled={false} />
    </main>
  );
}
