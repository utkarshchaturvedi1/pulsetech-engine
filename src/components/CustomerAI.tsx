"use client";

import { useEffect, useRef } from "react";
import ChatWindow from "./Chat/ChatWindow";
import ChatAgentShell from "./Chat/ChatAgentShell";
import { BusinessProfile } from "../types/business";
import {
  CHAT_REQUEST_FAILURE_REPLY,
  createCustomerChatSession,
  type CustomerChatSession,
} from "../lib/customerChatClient";
import { businessIdentityKey } from "../lib/salesState";

const MAX_UPLOAD_BODY_BYTES = 3_800_000;

async function preparePhotoForUpload(file: File): Promise<File> {
  if (file.size <= MAX_UPLOAD_BODY_BYTES) return file;
  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This photo could not be prepared. Please choose another image.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.84, 0.74, 0.64, 0.54]) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
        if (blob && blob.size <= MAX_UPLOAD_BODY_BYTES) {
          return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
        }
      }
      scale *= 0.8;
    }
  } finally {
    bitmap.close();
  }
  throw new Error("This photo could not be reduced for upload. Please choose a smaller image.");
}

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
  const identityKey = businessIdentityKey(business, demoId);
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
    const uploadFile = await preparePhotoForUpload(file);
    const form = new FormData();
    form.set("demoId", demoId);
    form.set("conversationId", sessionRef.current.conversationId);
    form.set("slot", String(slot));
    form.set("photo", uploadFile);
    const response = await fetch("/api/chat/photo-upload", {
      method: "POST",
      body: form,
    });
    const upload = (await response.json()) as { error?: string; path?: string };
    if (!response.ok || !upload.path) {
      throw new Error(upload.error || "Could not prepare this photo for upload.");
    }
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
