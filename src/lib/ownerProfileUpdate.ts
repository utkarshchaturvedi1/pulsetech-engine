import { BusinessProfile, ConfigurationHistoryEvent } from "../types/business";
import { cloneBusinessProfile } from "./businessProfile";
import { recoverOwnerLeadQuestions } from "./ownerQuestions";

function appendConfigurationEvent(profile: BusinessProfile, event: ConfigurationHistoryEvent) {
  profile.configurationHistory = [...(profile.configurationHistory || []), event];
}

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
    | "ownerLeadQuestions"
    | "systemPrompt"
    | "agentName"
    | "agentIntroduction"
    | "businessHours"
    | "pricingRules"
    | "tone"
    | "leadNotificationEmail"
    | "leadNotificationPhone"
  >
> & {
  /** Explicit owner corrections/removals only; additions are merged by default. */
  removeValues?: Partial<Record<"leadQuestions" | "systemPrompt" | "pricingRules" | "services" | "serviceAreas" | "faqs", string[]>>;
};

const VISIT_FEE_POLICY = "There is no charge for site visits.";
const VISIT_FEE_REFERENCE = /\b(?:visit(?:ing)?|site visit|service call|diagnostic visit)\b.{0,60}\b(?:fee|charge|cost)s?\b|\b(?:fee|charge|cost)s?\b.{0,60}\b(?:visit(?:ing)?|site visit|service call)\b/i;
const VISIT_FEE_WAIVER = /\b(?:waiv\w*|credited back|applied toward|deducted from)\b/i;

function removeVisitFeeSentences(text: string): { remaining: string; removed: string[] } {
  const parts = text.split(/(?<=[.!?])\s+|\n+/u).map((part) => part.trim()).filter(Boolean);
  const kept: string[] = [];
  const removed: string[] = [];
  let feeWasJustRemoved = false;

  for (const part of parts) {
    if (VISIT_FEE_REFERENCE.test(part)) {
      removed.push(part);
      feeWasJustRemoved = true;
      continue;
    }
    if (feeWasJustRemoved && VISIT_FEE_WAIVER.test(part)) {
      removed.push(part);
      feeWasJustRemoved = false;
      continue;
    }
    feeWasJustRemoved = false;
    kept.push(part);
  }

  return { remaining: kept.join("\n").trim(), removed: [...new Set(removed)] };
}

/**
 * Recognize a clear owner instruction removing a visit fee without asking the
 * language model to reconstruct exact old strings for the targeted-removal API.
 */
export function buildNoVisitFeeRemovalPatch(
  current: BusinessProfile,
  feedback: string
): OwnerProfilePatch | null {
  const asksToRemoveFee = /\b(?:remove|delete|stop|waive|waive off|no longer charge|do not charge|don't charge|will not charge|won't charge|decided not to charge|decided to stop charging)\b/i.test(feedback);
  const mentionsVisitFee = VISIT_FEE_REFERENCE.test(feedback);
  if (!asksToRemoveFee || !mentionsVisitFee) return null;

  const oldPricing = typeof current.pricingRules === "string" ? current.pricingRules : "";
  const pricing = removeVisitFeeSentences(oldPricing);
  const prompt = removeVisitFeeSentences(current.systemPrompt || "");
  const oldVisitQuestions = current.leadQuestions.filter((question) => VISIT_FEE_REFERENCE.test(question));
  const remainingPricing = pricing.remaining
    ? `${pricing.remaining}\n${VISIT_FEE_POLICY}`
    : VISIT_FEE_POLICY;
  const remainingPrompt = prompt.remaining
    ? `${prompt.remaining}\n${VISIT_FEE_POLICY}`
    : VISIT_FEE_POLICY;

  const removeValues: NonNullable<OwnerProfilePatch["removeValues"]> = {};
  if (pricing.removed.length) removeValues.pricingRules = pricing.removed;
  if (prompt.removed.length) removeValues.systemPrompt = prompt.removed;
  if (oldVisitQuestions.length) removeValues.leadQuestions = oldVisitQuestions;

  return {
    ...(Object.keys(removeValues).length ? { removeValues } : {}),
    pricingRules: remainingPricing,
    systemPrompt: remainingPrompt,
  };
}

const PATCH_KEYS: Array<Exclude<keyof OwnerProfilePatch, "removeValues">> = [
  "businessName",
  "tagline",
  "phone",
  "email",
  "address",
  "services",
  "serviceAreas",
  "faqs",
  "leadQuestions",
  "ownerLeadQuestions",
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

  // Only exact targeted values can be removed; no LLM-generated whole-field replacement.
  for (const [key, values] of Object.entries(patch.removeValues || {})) {
    if (!Array.isArray(values) || !values.every((v) => typeof v === "string" && v.trim())) throw new Error("Invalid removal operation");
    if (key === "systemPrompt" || key === "pricingRules") {
      let text = next[key] || "";
      for (const value of values) {
        if (!text.includes(value)) throw new Error("Owner correction targets an unknown rule");
        text = text.split(value).join("");
      }
      next[key] = text.trim();
    } else if (key === "leadQuestions" || key === "services" || key === "serviceAreas") {
      for (const value of values) if (!next[key].includes(value)) throw new Error("Owner correction targets an unknown item");
      next[key] = next[key].filter((v) => !values.includes(v));
      if (key === "leadQuestions") {
        if (next.ownerLeadQuestions) next.ownerLeadQuestions = next.ownerLeadQuestions.filter((v) => !values.includes(v));
        appendConfigurationEvent(next, { source: "owner", removedLeadQuestions: values });
      }
    } else if (key === "faqs") {
      for (const value of values) if (!next.faqs.some((f) => f.question === value)) throw new Error("Unknown FAQ correction");
      next.faqs = next.faqs.filter((f) => !values.includes(f.question));
    } else throw new Error("Unsupported removal field");
  }
  for (const key of PATCH_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    const value = patch[key];
    if (value === undefined) continue;
    if (key === "ownerLeadQuestions") {
      if (!Array.isArray(value) || !value.every(item => typeof item === "string" && next.leadQuestions.includes(item))) {
        throw new Error("Required questions must be selected from saved lead questions");
      }
      next.ownerLeadQuestions = [...new Set(value as string[])];
    } else if (key === "leadQuestions" || key === "services" || key === "serviceAreas") {
      if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim())) throw new Error(`Invalid owner configuration: ${key}`);
      const added = value as string[];
      next[key] = [...new Map([...next[key], ...added].map((item) => [item.trim().toLowerCase(), item.trim()])).values()];
      if (key === "leadQuestions") {
        const recorded = current.ownerLeadQuestions !== undefined
          ? current.ownerLeadQuestions
          : recoverOwnerLeadQuestions(current);
        const requiredBase = (recorded ?? current.leadQuestions).filter((item) => !(patch.removeValues?.leadQuestions || []).includes(item));
        next.ownerLeadQuestions = [...new Map([...requiredBase, ...added].map((item) => [item.trim().toLowerCase(), item.trim()])).values()];
        appendConfigurationEvent(next, { source: "owner", leadQuestions: added.map((item) => item.trim()) });
      }
    } else if (key === "systemPrompt" || key === "pricingRules") {
      if (typeof value !== "string") throw new Error(`Invalid owner configuration: ${key}`);
      const old = typeof next[key] === "string" ? next[key]!.trim() : "";
      const added = value.trim();
      next[key] = !added || old.includes(added) ? old : added.includes(old) ? added : [old, added].filter(Boolean).join("\n");
    } else if (key === "faqs") {
      if (!Array.isArray(value) || !value.every((f) => f && typeof f === "object" && "question" in f && "answer" in f && typeof f.question === "string" && typeof f.answer === "string")) throw new Error("Invalid FAQs");
      // Additions cannot silently overwrite an older FAQ answer.
      const additions = value as BusinessProfile["faqs"];
      for (const faq of additions) {
        const existing = next.faqs.find((f) => f.question.toLowerCase() === faq.question.toLowerCase());
        if (existing && existing.answer !== faq.answer) throw new Error("FAQ changes require an explicit targeted removal");
        if (!existing) next.faqs.push({ ...faq });
      }
    } else {
      if (typeof value !== "string") throw new Error(`Invalid owner configuration: ${key}`);
      (next as Record<string, unknown>)[key] = value;
    }
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
    ownerLeadQuestions: "required owner questions",
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
