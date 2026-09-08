import OpenAI from "openai";
import { BusinessProfile } from "../types/business";
import {
  buildOwnerUpdateReply,
  mergeOwnerProfileUpdate,
  summarizeOwnerProfileChanges,
  type OwnerProfilePatch,
} from "./ownerProfileUpdate";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60000,
});

export async function applyOwnerFeedbackToProfile(
  business: BusinessProfile,
  feedback: string
): Promise<{ profile: BusinessProfile; reply: string; changes: string[] }> {
  const prompt = `
You are helping a business owner correct the shared BusinessProfile used by website chat and inbound phone.

Current BusinessProfile JSON:
${JSON.stringify(business, null, 2)}

Owner feedback / correction:
${feedback}

Return ONLY valid JSON with this shape:
{
  "reply": "short confirmation of what changed",
  "patch": { ...only fields the owner explicitly added or corrected... }
}

Rules:
- Identify explicit corrections or additions only.
- Allowed patch fields: businessName, tagline, phone, email, address, services, serviceAreas, faqs, leadQuestions, systemPrompt, agentName, agentIntroduction, businessHours, pricingRules, tone, leadNotificationEmail, leadNotificationPhone.
- Do not remove existing accurate information unless the owner clearly corrects it.
- Do not invent prices, visit charges, free estimates, or promises. Set pricingRules only if the owner explicitly stated them.
- Put hours into businessHours, tone into tone, qualifying questions into leadQuestions, lead-alert recipients into leadNotificationEmail / leadNotificationPhone, agent intro/name into agentName / agentIntroduction.
- Also fold the new facts into systemPrompt so the sales employee knows them.
- Never change website.
- reply must be a short confirmation of the actual change.
- Return JSON only.
`;

  const response = await openai.responses.create({
    model: "gpt-5-mini",
    input: prompt,
    text: {
      format: {
        type: "json_object",
      },
    },
  });

  const text = response.output_text?.trim();

  if (!text) {
    throw new Error("Empty profile update response.");
  }

  const normalized = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const data = JSON.parse(normalized) as {
    reply?: string;
    patch?: OwnerProfilePatch;
    profile?: OwnerProfilePatch;
  };

  const patch = data.patch || data.profile || {};
  const profile = mergeOwnerProfileUpdate(business, patch);
  const changes = summarizeOwnerProfileChanges(business, profile);
  const reply =
    data.reply?.trim() ||
    buildOwnerUpdateReply(changes, true);

  return { profile, reply, changes };
}
