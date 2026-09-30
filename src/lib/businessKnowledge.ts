import { BusinessProfile } from "../types/business";
import { verifiedPricingRulesText } from "./businessProfile";

/**
 * Business knowledge only (WHAT the business sells / knows).
 * Must never be treated as competing sales methodology.
 */
export function formatBusinessKnowledge(business: BusinessProfile): string {
  const faqs =
    business.faqs.length > 0
      ? business.faqs
          .map((faq) => `Q: ${faq.question}\nA: ${faq.answer}`)
          .join("\n\n")
      : "None provided";

  const pricingText =
    verifiedPricingRulesText(business.pricingRules) ||
    "Not provided — do not invent prices, visit charges, free estimates, or promises.";

  return `
==================================================
BUSINESSPROFILE — WHAT THE BUSINESS KNOWS / SELLS
==================================================
This is the source of truth for business facts only.
It does NOT define how you sell.
Explicit owner business rules and required questions override generic defaults where appropriate. Never override truthfulness, core contact order, safety, or actual application capabilities.

Business name: ${business.businessName}
Tagline: ${business.tagline || "Not provided"}
Website: ${business.website}
Phone: ${business.phone || "Not provided"}
Email: ${business.email || "Not provided"}
Address: ${business.address || "Not provided"}
Agent name: ${business.agentName || "Not provided — speak as this business"}
Agent introduction: ${business.agentIntroduction || "Not provided"}
Business hours: ${business.businessHours || "Not provided"}
Tone: ${business.tone || "Not provided — use the Master Sales Command tone"}
Lead-notification email: ${business.leadNotificationEmail || "Not provided"}
Lead-notification phone: ${business.leadNotificationPhone || "Not provided"}

Services / offerings:
${business.services.length > 0 ? business.services.map((s) => `- ${s}`).join("\n") : "- Not provided"}

Service areas / locations:
${business.serviceAreas.length > 0 ? business.serviceAreas.map((a) => `- ${a}`).join("\n") : "- Not provided"}

FAQs:
${faqs}

Owner-required business questions (NOT a script): Ask these naturally before completing the customer handoff. Do not skip an owner-provided question. Keep the existing core lead-capture order unchanged.
${business.leadQuestions.length > 0 ? business.leadQuestions.map((q) => `- ${q}`).join("\n") : "- None provided"}

Pricing / visit charges / estimates:
${pricingText}

Additional business facts / offerings knowledge (NOT sales methodology — ignore any sales-script tone here):
${business.systemPrompt || "None provided"}

Never invent services, products, locations, prices, policies, claims, benefits, financing, warranties, guarantees, certifications, availability, or processes beyond this profile.
Only state pricing, visit/call-out charges, free estimates, or promises if they appear above because the owner provided them.
`.trim();
}

const FACT_STOP = /^(?:your|yours|ours|our|the|this|that|with|from|about|have|does|what|there|they|them|their|would|will|were|been|into|just|only|also|please|property|business|company|someone|something|against|during|before|after|under|while|where|which|these|those|other|using|inside)$/i;

function contentTerms(question: string): string[] {
  const terms = question
    .replace(/[?]/g, "")
    .split(/\s+/)
    .map((word) => word.toLowerCase().replace(/[^a-z-]/g, ""))
    .filter((word) => word.length > 4 && !FACT_STOP.test(word))
    .map((word) => (/^insur/i.test(word) ? "insur" : word));
  return [...new Set(terms)];
}

function coversCompleteQuestion(text: string, terms: string[]): boolean {
  return terms.every((term) => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text));
}

/** A customer question answered only from saved business facts. Missing facts stay uncertain. */
export function answerBusinessFactQuestion(business: BusinessProfile, customerText: string): string | null {
  const questions = customerText
    .split(/(?<=[.?!])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => /\?\s*$/.test(sentence) && !/\b(?:how much|what(?:'s| is) the (?:price|cost)|overall cost|total cost)\b/i.test(sentence));
  if (!questions.length) return null;
  const faqQuestions = new Set(
    business.faqs.map((faq) => faq.question.replace(/\s+/g, " ").trim().toLowerCase()).filter(Boolean)
  );
  const corpus = [
    business.systemPrompt,
    business.tagline,
    typeof business.pricingRules === "string" ? business.pricingRules : "",
    business.businessHours,
    ...business.services,
    ...business.serviceAreas,
    ...business.faqs.map((faq) => faq.answer),
  ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);
  const answers: string[] = [];
  for (const question of questions) {
    const terms = contentTerms(question);
    if (!terms.length) continue;
    const faqHit = business.faqs.find((faq) => {
      const answer = faq.answer.trim();
      if (!answer) return false;
      return coversCompleteQuestion(faq.question, terms) || coversCompleteQuestion(answer, terms);
    });
    if (faqHit) {
      answers.push(faqHit.answer.replace(/\s+/g, " ").trim());
      continue;
    }
    const sentence = corpus
      .flatMap((part) => part.split(/\n+|(?<=[.?!])\s+/))
      .map((part) => part.replace(/\s+/g, " ").trim())
      .find((part) => part.length > 0 && !faqQuestions.has(part.toLowerCase()) && coversCompleteQuestion(part, terms));
    if (!sentence) {
      const label = terms.map((term) => (term === "insur" ? "insurance" : term)).join(" ");
      answers.push(`I don't have information about ${label}.`);
      continue;
    }
    answers.push(sentence.replace(/\s+/g, " ").trim());
  }
  return answers.length ? answers.join(" ") : null;
}
