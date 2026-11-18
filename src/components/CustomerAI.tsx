"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import ChatWindow from "./Chat/ChatWindow";
import ChatAgentShell from "./Chat/ChatAgentShell";
import { BusinessProfile } from "../types/business";
import {
  CHAT_REQUEST_FAILURE_REPLY,
  createCustomerChatSession,
  type CustomerChatSession,
} from "../lib/customerChatClient";
import { businessIdentityKey } from "../lib/salesState";
import { CUSTOMER_CHAT_PHOTO_BUCKET } from "../lib/customerChatPhotos";

function businessIconUrl(website: string): string | undefined {
  try {
    const normalized = website.startsWith("http://") || website.startsWith("https://") ? website : `https://${website}`;
    return new URL("/favicon.ico", normalized).toString();
  } catch {
    return undefined;
  }
}

type CustomerAIProps = {
  business: BusinessProfile;
  demoId?: string;
  className?: string;
};

const INITIAL_MESSAGE = "👋 Hi! How can I help you today?";

function profileContentSignature(business: BusinessProfile): string {
  return JSON.stringify({
    businessName: business.businessName,
    tagline: business.tagline,
    phone: business.phone,
    email: business.email,
    address: business.address,
    services: business.services,
    serviceAreas: business.serviceAreas,
    faqs: business.faqs,
    leadQuestions: business.leadQuestions,
    systemPrompt: business.systemPrompt,
    agentName: business.agentName,
    agentIntroduction: business.agentIntroduction,
    businessHours: business.businessHours,
    pricingRules: business.pricingRules,
    tone: business.tone,
    leadNotificationEmail: business.leadNotificationEmail,
    leadNotificationPhone: business.leadNotificationPhone,
  });
}

export default function CustomerAI({
  business,
  demoId,
  className = "",
}: CustomerAIProps) {
  const sessionRef = useRef<CustomerChatSession | null>(null);
  const identityKey = businessIdentityKey(business);
  const contentKey = profileContentSignature(business);

  useEffect(() => {
    sessionRef.current?.destroy();
    sessionRef.current = createCustomerChatSession(business, INITIAL_MESSAGE, demoId);

    return () => {
      sessionRef.current?.destroy();
      sessionRef.current = null;
    };
    // Recreate only when business identity (website) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- identityKey is the isolation boundary
  }, [identityKey, demoId]);

  // Owner knowledge updates: rebind BusinessProfile, keep conversationId + SalesState.
  useEffect(() => {
    if (!sessionRef.current?.isActive()) return;
    sessionRef.current.updateBusiness(business);
  }, [contentKey, business]);

  async function handleCustomerMessage(message: string): Promise<string> {
    if (!sessionRef.current || !sessionRef.current.isActive()) {
      sessionRef.current = createCustomerChatSession(business, INITIAL_MESSAGE, demoId);
    } else {
      sessionRef.current.updateBusiness(business);
    }

    try {
      return await sessionRef.current.send(message);
    } catch {
      return CHAT_REQUEST_FAILURE_REPLY;
    }
  }

  async function handlePhotoUpload(file: File, slot: number): Promise<string> {
    if (!demoId || !sessionRef.current?.isActive()) {
      throw new Error("Photo uploads are unavailable in this chat.");
    }
    const response = await fetch("/api/chat/photo-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        demoId,
        conversationId: sessionRef.current.conversationId,
        slot,
        contentType: file.type,
      }),
    });
    const upload = (await response.json()) as {
      error?: string;
      token?: string;
      supabaseUrl?: string;
      anonKey?: string;
      path?: string;
    };
    if (!response.ok || !upload.token || !upload.supabaseUrl || !upload.anonKey || !upload.path) {
      throw new Error(upload.error || "Could not prepare this photo for upload.");
    }

    const storage = createClient(upload.supabaseUrl, upload.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await storage.storage
      .from(CUSTOMER_CHAT_PHOTO_BUCKET)
      .uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type });
    if (error) throw new Error(error.message || "Photo upload failed. Please try again.");

    if (!sessionRef.current.addPhotoPath(upload.path)) {
      throw new Error("You can attach up to three photos in a chat.");
    }
    return upload.path;
  }

  return (
    <ChatAgentShell
      name={business.agentName || business.businessName || "AI Sales Employee"}
      role="AI Sales Employee"
      avatar={businessIconUrl(business.website)}
      fallbackLabel={business.businessName || business.agentName || "AI"}
      className={`min-h-0 min-w-0 w-full ${className}`.trim()}
    >
      <ChatWindow
        key={identityKey}
        initialMessage={INITIAL_MESSAGE}
        placeholder="Ask me anything..."
        onUserMessage={handleCustomerMessage}
        onPhotoUpload={handlePhotoUpload}
      />
    </ChatAgentShell>
  );
}
