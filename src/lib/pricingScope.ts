import type { BusinessProfile } from "../types/business";
import { verifiedPricingRulesText } from "./businessProfile";

export const VISIT_SCOPE_RE = /\b(visit(?:ing)?|diagnostic|diagnosis|call[- ]?out|dispatch|inspection|assessment)\b/i;

/** Preserve fee conditions with their fee, never treat them as project prices. */
export function scopedPricing(business: BusinessProfile): { visit: string; service: string } {
  const raw = verifiedPricingRulesText(business.pricingRules) || "";
  const visit: string[] = [], service: string[] = [];
  let previousVisit = false;
  for (const part of raw.split(/(?<=[.!?])\s+|\n+/).filter(Boolean)) {
    const isVisit: boolean = VISIT_SCOPE_RE.test(part) || (previousVisit && /\b(waiv|waved|credit|deduct|appl|refund|proceed|continu)/i.test(part));
    (isVisit ? visit : service).push(part);
    previousVisit = isVisit;
  }
  return { visit: visit.join(" "), service: service.join(" ") };
}

export function asksVisitPrice(message?: string): boolean {
  return VISIT_SCOPE_RE.test(message || "") && !/\b(total|overall|entire|full|project|installation|repair|replacement)\b/i.test(message || "");
}

export function separateVisitFee(business: BusinessProfile): string {
  const { visit } = scopedPricing(business);
  return visit ? `Separately, the visit/diagnostic fee is not the total service or project price. ${visit}` : "";
}

export function feeOnlyPriceReply(reply: string, business: BusinessProfile, message?: string): boolean {
  const { visit, service } = scopedPricing(business);
  if (!visit || asksVisitPrice(message)) return false;
  const visitAmounts = visit.match(/\$\s?\d[\d,]*(?:\.\d+)?/g) || [];
  for (const sentence of reply.split(/(?<=[.!?])\s+/)) {
    if (/\b(total|overall|entire|full)\b/i.test(sentence) && !/\b(not|separate|only)\b/i.test(sentence) &&
      visitAmounts.some((amount) => sentence.includes(amount) && !service.includes(amount))) return true;
  }
  return VISIT_SCOPE_RE.test(reply) && !/\b(materials|equipment|labor|scope|requirements|extent|depends|varies|capacity|wiring|panel|site conditions)\b/i.test(reply) && !service;
}
