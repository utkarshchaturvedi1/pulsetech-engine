import OpenAI from "openai";
import { BusinessProfile } from "../types/business";
import { createBusinessProfile } from "./businessProfile";

function openaiClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  return new OpenAI({ apiKey, timeout: 120000 });
}

export async function analyzeBusiness(
  website: string,
  html: string,
  additionalInfo: string = ""
): Promise<BusinessProfile> {
  const additionalInfoSection = additionalInfo
    ? `
Additional information provided by the business owner (treat this as authoritative and merge it into the profile):
${additionalInfo}
`
    : `
Additional information provided by the business owner:
None
`;

  const prompt = `
You are an expert business analyst building a BusinessProfile for an AI Sales Employee.

Analyze the following website and return ONLY valid JSON.

Website:
${website}

${additionalInfoSection}

HTML:
${html}

Return this JSON structure exactly:

{
  "businessName": "",
  "tagline": "",
  "logo": "",
  "siteIcon": "",
  "primaryColor": "#2563eb",
  "secondaryColor": "#0f172a",
  "phone": "",
  "email": "",
  "address": "",
  "services": [],
  "serviceAreas": [],
  "faqs": [
    {
      "question": "",
      "answer": ""
    }
  ],
  "leadQuestions": [],
  "systemPrompt": ""
}

Rules:

- Infer services whenever possible.
- Infer service areas whenever possible.
- Extract contact details, full logo URL, compact site icon/favicon URL, and brand colours when available.
- Prefer owner-provided additional information over conflicting website text when they disagree.
- Populate leadQuestions with natural discovery questions a sales employee would ask to understand customer needs (not an interrogation checklist).
- Write a detailed professional systemPrompt that:
  1. Describes the business clearly (name, what they offer, who they serve, service areas, tone).
  2. Establishes that the AI is a professional AI Sales Employee of this business — not a lead-collection chatbot.
  3. Instructs the AI to: understand customer needs, explain and recommend appropriate services, handle doubts and objections professionally, build confidence and trust, and guide the conversation toward a quote, booking, consultation, or purchase.
  4. Instructs the AI to capture lead information only at the appropriate point — after value and fit are established — never as the first or primary goal.
  5. Requires accurate answers based on the business profile; if something is unknown, say so honestly rather than inventing facts.
- Return JSON only.
`;

  let response;

  try {
    response = await openaiClient().responses.create({
      model: "gpt-5-mini",
      input: prompt,
      text: {
        format: {
          type: "json_object",
        },
      },
    });
  } catch (error) {
    console.error("OpenAI analyzeBusiness failed:", error);
    throw new Error("OpenAI analysis failed.");
  }

  const text = response.output_text?.trim();

  if (!text) {
    throw new Error("OpenAI returned an empty analysis response.");
  }

  const normalized = text
    .replace(/^\`\`\`json\s*/i, "")
    .replace(/^\`\`\`\s*/i, "")
    .replace(/\s*\`\`\`$/, "")
    .trim();

  let data: {
    businessName?: string;
    tagline?: string;
    logo?: string;
    siteIcon?: string;
    primaryColor?: string;
    secondaryColor?: string;
    phone?: string;
    email?: string;
    address?: string;
    services?: string[];
    serviceAreas?: string[];
    faqs?: { question: string; answer: string }[];
    leadQuestions?: string[];
    systemPrompt?: string;
  };

  try {
    data = JSON.parse(normalized);
  } catch {
    console.error("Failed to parse OpenAI analysis JSON:", text);
    throw new Error("OpenAI returned invalid analysis JSON.");
  }

  return createBusinessProfile({
    website,
    businessName: data.businessName ?? "",
    tagline: data.tagline ?? "",
    logo: data.logo ?? "",
    siteIcon: data.siteIcon ?? "",
    primaryColor: data.primaryColor ?? "#2563eb",
    secondaryColor: data.secondaryColor ?? "#0f172a",
    phone: data.phone ?? "",
    email: data.email ?? "",
    address: data.address ?? "",
    services: data.services ?? [],
    serviceAreas: data.serviceAreas ?? [],
    faqs: data.faqs ?? [],
    leadQuestions: data.leadQuestions ?? [],
    systemPrompt: data.systemPrompt ?? "",
  });
}
