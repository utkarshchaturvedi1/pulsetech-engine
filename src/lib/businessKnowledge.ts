import { BusinessProfile } from "../types/business";

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

  return `
==================================================
BUSINESSPROFILE — WHAT THE BUSINESS KNOWS / SELLS
==================================================
This is the source of truth for business facts only.
It does NOT define how you sell.
It MUST NOT override the Master Sales Command methodology below.

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

Optional business process context (NOT a script. NOT a checklist. Ask only if needed for the next sales move):
${business.leadQuestions.length > 0 ? business.leadQuestions.map((q) => `- ${q}`).join("\n") : "- None provided"}

Pricing / visit charges / estimates:
${business.pricingRules || "Not provided — do not invent prices, visit charges, free estimates, or promises."}

Additional business facts / offerings knowledge (NOT sales methodology — ignore any sales-script tone here):
${business.systemPrompt || "None provided"}

Never invent services, products, locations, prices, policies, claims, benefits, financing, warranties, guarantees, certifications, availability, or processes beyond this profile.
Only state pricing, visit/call-out charges, free estimates, or promises if they appear above because the owner provided them.
`.trim();
}
