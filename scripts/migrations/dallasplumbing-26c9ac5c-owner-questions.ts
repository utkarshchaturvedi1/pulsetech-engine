import type { BusinessProfile } from "../../src/types/business";

/**
 * Reviewed configuration for saved demo dallasplumbing-26c9ac5c.
 * The saved record has no ownerLeadQuestions field and no configuration history.
 * These two lead questions are the owner's fee confirmation and the compound
 * access question. The other lead questions on that record stay optional.
 * This module is not used by the chat engine.
 */
export const REVIEWED_DEMO_ID = "dallasplumbing-26c9ac5c";

export const REVIEWED_OWNER_LEAD_QUESTIONS = [
  "Do you agree to the $20 visit charge, which will be waived if you proceed with our recommended service?",
  "Do you have any dogs or other pets, and can they be secured away from the technician during the visit?",
];

export const REMOVED_SYSTEM_PROMPT_LINES = [
  "Begin by quickly confirming whether this is an emergency or a scheduled service request.",
];

export type ReviewedOwnerConfiguration = {
  demoId: string;
  ownerLeadQuestions: string[];
  removeSystemPromptLines: string[];
};

export const reviewedOwnerConfiguration: ReviewedOwnerConfiguration = {
  demoId: REVIEWED_DEMO_ID,
  ownerLeadQuestions: REVIEWED_OWNER_LEAD_QUESTIONS,
  removeSystemPromptLines: REMOVED_SYSTEM_PROMPT_LINES,
};

/** Apply a reviewed owner-question list. Does not match a business name or website. */
export function applyReviewedOwnerConfiguration(
  profile: BusinessProfile,
  review: ReviewedOwnerConfiguration
): BusinessProfile {
  const required = review.ownerLeadQuestions.map((question) => question.trim()).filter(Boolean);
  if (!required.length) throw new Error("Reviewed owner configuration has no questions.");
  const lead = new Set((profile.leadQuestions || []).map((question) => question.trim()));
  for (const question of required) {
    if (!lead.has(question)) throw new Error("Reviewed owner question is not on this profile.");
  }
  if (profile.ownerLeadQuestions !== undefined) {
    const current = profile.ownerLeadQuestions.map((question) => question.trim());
    const same = current.length === required.length && current.every((question, index) => question === required[index]);
    if (same) return profile;
    throw new Error("This profile already has a different owner-question configuration.");
  }
  const remove = new Set(review.removeSystemPromptLines.map((line) => line.trim()).filter(Boolean));
  const systemPrompt = (profile.systemPrompt || "")
    .split("\n")
    .filter((line) => !remove.has(line.replace(/^[-*]\s*/, "").trim()))
    .join("\n");
  return {
    ...profile,
    ownerLeadQuestions: required,
    systemPrompt,
    configurationHistory: [
      ...(profile.configurationHistory || []),
      { source: "owner", leadQuestions: required },
    ],
  };
}
