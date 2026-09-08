import { BusinessProfile } from "../types/business";
import { cloneBusinessProfile } from "./businessProfile";

export type OwnerProfilePatch = Partial<
  Pick<
    BusinessProfile,
    | "businessName"
    | "tagline"
    | "phone"
    | "email"
    | "address"
    | "services"
    | "serviceAreas"
    | "faqs"
    | "leadQuestions"
    | "systemPrompt"
    | "agentName"
    | "agentIntroduction"
    | "businessHours"
    | "pricingRules"
    | "tone"
    | "leadNotificationEmail"
    | "leadNotificationPhone"
  >
>;

const PATCH_KEYS: (keyof OwnerProfilePatch)[] = [
  "businessName",
  "tagline",
  "phone",
  "email",
  "address",
  "services",
  "serviceAreas",
  "faqs",
  "leadQuestions",
  "systemPrompt",
  "agentName",
  "agentIntroduction",
  "businessHours",
  "pricingRules",
  "tone",
  "leadNotificationEmail",
  "leadNotificationPhone",
];

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function mergeOwnerProfileUpdate(
  current: BusinessProfile,
  patch: OwnerProfilePatch
): BusinessProfile {
  const next = cloneBusinessProfile(current);

  for (const key of PATCH_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    const value = patch[key];
    if (value === undefined) continue;
    (next as Record<string, unknown>)[key] = value;
  }

  next.website = current.website;
  if (current.isTestData) next.isTestData = true;

  return next;
}

export function summarizeOwnerProfileChanges(
  before: BusinessProfile,
  after: BusinessProfile
): string[] {
  const changes: string[] = [];
  const labels: Record<string, string> = {
    businessName: "business name",
    tagline: "tagline",
    phone: "business phone",
    email: "business email",
    address: "business address",
    services: "services",
    serviceAreas: "service areas",
    faqs: "FAQs",
    leadQuestions: "qualifying questions",
    systemPrompt: "business rules",
    agentName: "agent name",
    agentIntroduction: "agent introduction",
    businessHours: "business hours",
    pricingRules: "pricing / visit-charge rules",
    tone: "tone",
    leadNotificationEmail: "lead-notification email",
    leadNotificationPhone: "lead-notification phone",
  };

  for (const key of PATCH_KEYS) {
    if (!sameJson(before[key], after[key])) {
      changes.push(labels[key] || key);
    }
  }

  return changes;
}

export function buildOwnerUpdateReply(
  changes: string[],
  persisted: boolean
): string {
  if (!changes.length) {
    return persisted
      ? "I didn't find a new business fact to add. Tell me the correction and I'll update the shared profile."
      : "I didn't find a new business fact to add.";
  }

  const list =
    changes.length === 1
      ? changes[0]
      : changes.slice(0, -1).join(", ") + ", and " + changes[changes.length - 1];

  if (!persisted) {
    return `I applied ${list} on this demo session. It is not in durable storage yet, so it may not survive a new deployment.`;
  }

  return `Updated ${list}. The website chat and phone AI now use this shared profile.`;
}
