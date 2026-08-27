import OpenAI from "openai";
import { BusinessProfile } from "../types/business";
import { createBusinessProfile } from "./businessProfile";
import { handleLeadNotificationOwnerText } from "./leadNotificationConfig";

let openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 60000,
    });
  }
  return openai;
}

export async function applyOwnerFeedbackToProfile(
  business: BusinessProfile,
  feedback: string
): Promise<{ profile: BusinessProfile; reply: string }> {
  const notificationUpdate = handleLeadNotificationOwnerText(
    business.leadNotificationEmail,
    feedback
  );
  if (notificationUpdate.kind === "ask") {
    return {
      profile: business,
      reply: notificationUpdate.reply,
    };
  }
  if (notificationUpdate.kind === "saved") {
    const profile = createBusinessProfile({
      ...business,
      leadNotificationEmail: notificationUpdate.email,
    });
    return {
      profile,
      reply: notificationUpdate.reply,
    };
  }
  const prompt = `
You are Peter, PulseTech's AI Sales Agent helping a business owner improve their AI Sales Employee.

Current BusinessProfile JSON:
${JSON.stringify(business, null, 2)}

Owner feedback / correction:
${feedback}

Return ONLY valid JSON with this shape:
{
  "reply": "short conversational response confirming what you updated",
  "profile": { ...updated BusinessProfile fields... }
}

Rules:
- Merge the owner's feedback into the profile (services, serviceAreas, faqs, leadQuestions, systemPrompt, contact details, etc.).
- Do not remove existing accurate information unless the owner clearly corrects it.
- Update systemPrompt so the AI Sales Employee knows the new information.
- leadNotificationEmail is internal routing configuration, not customer knowledge. Never put it in systemPrompt, FAQs, services, or the reply unless the owner is explicitly setting it.
- reply should sound like Peter confirming the update and inviting continued testing.
- Return JSON only.
`;

  const response = await getOpenAI().responses.create({
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
    profile?: Partial<BusinessProfile>;
  };

  const requestedEmail = data.profile?.leadNotificationEmail;
  const profile = createBusinessProfile({
    ...business,
    ...(data.profile || {}),
    website: data.profile?.website || business.website,
    leadNotificationEmail:
      typeof requestedEmail === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(requestedEmail.trim())
        ? requestedEmail.trim().toLowerCase()
        : business.leadNotificationEmail,
  });

  const reply =
    data.reply?.trim() ||
    "I've updated your AI Sales Employee with that information. Please test it again on the right.";

  return { profile, reply };
}
