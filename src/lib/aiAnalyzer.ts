import OpenAI from "openai";
import { BusinessProfile } from "../types/business";
import { createBusinessProfile } from "./businessProfile";

function openaiClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  return new OpenAI({ apiKey, timeout: 120000 });
}

function hostFallbackName(website: string): string {
  try {
    const host = new URL(
      /^https?:\/\//i.test(website) ? website : "https://" + website
    ).hostname.replace(/^www\./i, "");
    const label = host.split(".")[0] || host;
    return label
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (ch) => ch.toUpperCase())
      .trim();
  } catch {
    return "";
  }
}

function nameFromHtml(html: string): string {
  const og = html.match(
    /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i
  );
  if (og?.[1]?.trim()) return og[1].trim();
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (title?.[1]?.trim()) {
    return title[1].replace(/\s*[|\-–].*$/, "").trim();
  }
  return "";
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

Analyze ONLY the website below. Return ONLY valid JSON.
The profile must describe this exact business. Never substitute a sample, default, showcase, or unrelated company.

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

- Infer services whenever possible from THIS website.
- Infer service areas whenever possible from THIS website.
- Extract contact details, a usable logo or favicon URL, and brand colours when available.
- Prefer owner-provided additional information over conflicting website text when they disagree.
- Populate leadQuestions with natural discovery questions a sales employee would ask.
- Write a detailed professional systemPrompt that:
  1. Describes this business clearly (name, what they offer, who they serve, service areas, tone).
  2. Establishes that the AI is a professional AI Sales Employee of this business.
  3. Instructs the AI to understand needs, recommend services, handle objections, and guide toward a quote, booking, or consultation.
  4. Captures lead information only after value and fit are established.
  5. Requires accurate answers; if something is unknown, say so rather than inventing facts.
- Never set isTestData.
- Never copy another company's name, services, or contact details.
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
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
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

  const businessName =
    (data.businessName || "").trim() ||
    nameFromHtml(html) ||
    hostFallbackName(website);

  if (!businessName) {
    throw new Error("Website analysis did not produce a business name.");
  }

  return createBusinessProfile({
    website,
    businessName,
    tagline: data.tagline ?? "",
    logo: (data.logo || data.siteIcon || "").trim(),
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
    isTestData: false,
  });
}
