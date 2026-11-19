import OpenAI from "openai";
import type { BusinessProfile } from "../types/business";
import {
  applyLeadDeliveryResult,
  maybeSendLeadHandoff,
  type LeadHandoffResult,
} from "./leadHandoff";
import { updateSalesStateFromTurn, type ChatTurnMessage } from "./salesController";
import type { SalesState } from "./salesState";

export type SimpleSalesMessage = ChatTurnMessage;
export type SimpleSalesModel = (
  instructions: string,
  messages: SimpleSalesMessage[]
) => Promise<string>;

let testModel: SimpleSalesModel | null = null;

export function setSimpleSalesTestModel(model: SimpleSalesModel | null): void {
  testModel = model;
}

function nextContactField(state: SalesState): "name" | "phone" | "address" | null {
  for (const field of ["name", "phone", "address"] as const) {
    if (!state.lead[field] && !state.refusedLeadFields.includes(field)) return field;
  }
  return null;
}

function questionFor(field: "name" | "phone" | "address"): string {
  if (field === "name") return "What name should I use?";
  if (field === "phone") return "What’s the best phone number for the team to reach you?";
  return "What’s the service address?";
}

function asksFor(reply: string, field: "name" | "phone" | "address"): boolean {
  const patterns = {
    name: /\b(your name|what name should i use|what should i call you|first name)\b/i,
    phone: /\b(phone number|best number|number to reach you|number should the team)\b/i,
    address: /\b(service address|property address|what(?:'s| is) the address)\b/i,
  };
  return patterns[field].test(reply);
}

function removeCapturedFieldQuestions(reply: string, state: SalesState): string {
  const captured = (["name", "phone", "address"] as const).filter(
    (field) => !!state.lead[field] || state.refusedLeadFields.includes(field)
  );
  return reply
    .split(/(?<=[.!?])\s+|\n+/u)
    .filter((part) => !(
      part.trim().endsWith("?") && captured.some((field) => asksFor(part, field))
    ))
    .join(" ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
}

function recoverAcknowledgedName(messages: SimpleSalesMessage[]): string | null {
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    const match = message.content.match(
      /\bthanks,?\s+([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,3})\s*(?:—|–|-)\s*(?:got your name|i(?:'|’)ve got your name|i have your name)\b/i
    );
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function simpleFacts(business: BusinessProfile): string {
  return [
    `Business name: ${business.businessName}`,
    business.tagline ? `About: ${business.tagline}` : "",
    business.services.length ? `Services: ${business.services.join("; ")}` : "",
    business.serviceAreas.length ? `Service area: ${business.serviceAreas.join("; ")}` : "",
    business.pricingRules ? `Verified pricing information: ${business.pricingRules}` : "",
    business.faqs.length
      ? `Verified answers: ${business.faqs.map(({ question, answer }) => `${question} ${answer}`).join("; ")}`
      : "",
  ].filter(Boolean).join("\n");
}

function simpleInstructions(state: SalesState, business: BusinessProfile, photoInvitation: boolean, messages: SimpleSalesMessage[]): string {
  const field = nextContactField(state);
  const userNeed = state.primaryNeed || state.customerNeed || "not clear yet";
  const reassuranceAlreadyGiven = messages.some(
    (message) => message.role === "assistant" && /\b(right place|come to the right place)\b/i.test(message.content)
  );
  return `You are the sales employee for the business below. Keep the whole conversation natural, warm, short, and focused on what the customer just said.

WHAT YOU CAN DO
- Explain the business’s services and answer the customer’s questions using the verified business information below.
- When the business offers the service they need, begin the first substantive reply with a brief assurance that they have come to the right place. Say it only once. ${reassuranceAlreadyGiven ? "The reassurance has already been given; do not repeat it." : "Give the reassurance now."}
- Every answer must be specific to the assigned business and the customer’s stated need. Use only that business’s verified services, policies, pricing, and FAQs. Do not carry facts, terminology, price drivers, claims, or examples from another industry or business. Answer only what the customer asked. Keep the reply to at most two short sentences and 45 words; do not add unrelated prices, service areas, or sales details.
- For price questions, use the active business’s verified pricing information. If no exact price is provided, say an accurate quote requires reviewing the requested work or project. Mention cost factors only when the active business facts support them. Never say a quote or visit is free, paid, waived, or discounted unless that exact policy is verified below; missing fee information does not mean the service is free.
- If a customer compares another provider, respond naturally to that comparison using only this business’s verified information. Do not claim to be cheaper, use a scripted industry-specific comparison, or change the subject; answer the question and continue the conversation.
- Collect the customer’s name, phone number, and service address as part of helping. The next missing detail is ${field || "none"}. Ask only for that detail, and accept information the customer already gave.
- The customer may attach up to three optional photos for the team to review; each photo can be up to 5 MB. Offer this only if the customer wants a person to review the issue.
- Uploaded photos are for the business team to review; this chat model cannot inspect their contents. Never claim to see, identify, diagnose, or evaluate an image. If asked, say the team can review the attached photo and answer from the customer's text and verified business facts.
- Business information: ${simpleFacts(business)}
- Conversation facts: need=${userNeed}; name=${state.lead.name || "not given"}; phone=${state.lead.phone || "not given"}; address=${state.lead.address || "not given"}; agreed to next step=${state.customerAgreed ? "yes" : "no"}; preferred time=${state.preferredTiming || "not given"}; alert status=${state.leadDeliveryStatus}.
${photoInvitation ? "A photo invitation is appropriate in this reply." : "Do not suggest photos in this reply."}

WHAT YOU CAN’T DO
- Do not claim the business offers something it does not offer. If the information is missing, say you’re not sure and offer to have the team confirm.
- Do not invent prices, fees, free offers, discounts, licenses, guarantees, availability, appointments, completed work, or successful contact with the team.
- Do not give out the business phone number or internal email/SMS details.
- Do not ask for information already provided, ask unnecessary service-category questions, or repeat a question the customer has not answered in the same reply.
- Do not say the request was sent or that the team will contact the customer unless the system says the lead alert is queued or sent.
- Keep the answer concise and ask no more than one useful question.`;
}

function fallbackReply(state: SalesState, business: BusinessProfile, lastAssistant: string): string {
  const field = nextContactField(state);
  const need = state.primaryNeed || state.customerNeed || "";
  const serviceText = business.services.join(" ").toLowerCase();
  const supported = !!need && serviceText && need.toLowerCase().split(/\W+/).some((word) => word.length > 4 && serviceText.includes(word));
  const reassurance = supported
    ? "Don’t worry—you’ve come to the right place. "
    : "I’m here to help. ";
  if (field && !asksFor(lastAssistant, field)) return `${reassurance}${questionFor(field)}`;
  return `${reassurance}What would you like to know?`;
}

function customerNeedsPhotoReview(messages: SimpleSalesMessage[]): boolean {
  const latest = [...messages].reverse().find((message) => message.role === "user")?.content || "";
  return /\b(talk to (?:a )?(?:person|human|someone)|speak to (?:a )?(?:person|human|someone)|real person|technician|someone (?:come|look|check)|have (?:someone|a technician) (?:look|check)|can i send (?:a )?photo|picture|image)\b/i.test(latest);
}

function lastAssistantText(messages: SimpleSalesMessage[]): string {
  return [...messages].reverse().find((message) => message.role === "assistant")?.content || "";
}

function hasQuestion(text: string): boolean {
  return text.includes("?") || /\b(how much|what(?:'s| is)|how do|how can|can you|does it|do you|is it|will it|which|when)\b/i.test(text);
}

function isDirectPriceQuestion(text: string): boolean {
  return /\b(how much|what(?:'s| is| will be) (?:the |this |our )?(?:total |system )?(?:cost|price)|what will .{0,40} cost|how much does .{0,40} cost|price list|pricing)\b/i.test(text);
}

function isServiceTimingQuestion(text: string): boolean {
  return /\b(how (?:fast|soon|quickly|long)|when can (?:you|someone|the team)|how long (?:will|does)|can (?:you|someone) come|send (?:someone|a technician)|dispatch|available (?:today|now|this weekend)|emergency)\b/i.test(text);
}

function hasUnsupportedOperationalClaim(reply: string, business: BusinessProfile): boolean {
  const verified = simpleFacts(business).toLowerCase();
  const claimGroups: Array<{ pattern: RegExp; fact: RegExp }> = [
    { pattern: /\b(24\s*\/\s*7|24 hours a day|around the clock|immediately|right away|same[- ]day|within (?:\d+|one|two|three) (?:minutes?|hours?)|respond immediately|available today|available tonight|emergency service)\b/i, fact: /\b(24\s*\/\s*7|24 hours a day|around the clock|immediately|right away|same[- ]day|within (?:\d+|one|two|three) (?:minutes?|hours?)|emergency service)\b/i },
    { pattern: /\b(licensed|licen[cs]ed|certified|insured|bonded)\b/i, fact: /\b(licensed|licen[cs]ed|certified|insured|bonded)\b/i },
    { pattern: /\b(guarantee(?:d|s)?|warrant(?:y|ies)|free estimate|no charge|waived|discount(?:ed)?|cheapest|lowest price)\b/i, fact: /\b(guarantee(?:d|s)?|warrant(?:y|ies)|free estimate|no charge|waived|discount(?:ed)?|cheapest|lowest price)\b/i },
    { pattern: /\b(dispatch|send (?:a|our|the) (?:technician|tech|crew|team)|we(?:'ll| will) be there|appointment (?:is )?(?:confirmed|booked)|i(?:'ve| have) scheduled|we(?:'ve| have) scheduled)\b/i, fact: /\b(dispatch|send (?:a|our|the) (?:technician|tech|crew|team)|appointment (?:is )?(?:confirmed|booked)|scheduled)\b/i },
  ];

  return claimGroups.some(({ pattern, fact }) => {
    const match = reply.match(pattern);
    return Boolean(match && !fact.test(verified));
  });
}

function isMalformedReply(reply: string): boolean {
  const text = reply.trim();
  if (!text || /\bthanks,?\s+[\w'-]+\.?\s+how\.?\s*(?:i have|i['’]ve)?\s+your details\b/i.test(text)) return true;
  if (/\b(?:how|what|when|where|why|can|could|would|will|do|does|is|are)\s*[.!]$/i.test(text)) return true;
  return false;
}

function isSimpleAffirmation(text: string): boolean {
  return /^(?:yes(?:,?\s+please)?|yeah|yep|yup|sure|please do|go ahead|that works|sounds good)[.!\s]*$/i.test(text.trim());
}

function groundedOperationsReply(
  state: SalesState,
  latestUser: string,
  lastAssistant: string,
  handoffIsReady: boolean
): string {
  if (handoffIsReady && (isSimpleAffirmation(latestUser) || !hasQuestion(latestUser))) {
    return `Thanks${state.lead.name ? `, ${state.lead.name}` : ""}. Your request is with the team, and they’ll contact you as soon as possible.`;
  }
  if (isServiceTimingQuestion(latestUser)) {
    const leadStatus = state.leadDeliveryStatus === "SENT" || state.leadDeliveryStatus === "QUEUED";
    const update = leadStatus ? " Your request is with the team, and they’ll confirm timing." : "";
    const field = nextContactField(state);
    const followUp = field && !asksFor(lastAssistant, field) ? ` ${questionFor(field)}` : "";
    return `I can’t confirm availability or completion time from this chat.${update}${followUp}`;
  }
  if (handoffIsReady) {
    return `I’ve passed your request to the team, and they’ll contact you as soon as possible. Is there anything else you’d like to ask?`;
  }
  const field = nextContactField(state);
  const followUp = field && !asksFor(lastAssistant, field) ? ` ${questionFor(field)}` : "";
  return `I don’t have verified information to confirm that. The business team can clarify it.${followUp}`;
}

export async function generateSimpleSalesReply(
  business: BusinessProfile,
  messages: SimpleSalesMessage[],
  previousState: SalesState,
  photoLinks: string[] = []
): Promise<{ reply: string; salesState: SalesState; leadDelivery?: () => Promise<void> }> {
  const latestUser = [...messages].reverse().find((message) => message.role === "user")?.content || "";
  const state = updateSalesStateFromTurn(previousState, messages, business);
  if (!state.lead.name) state.lead.name = recoverAcknowledgedName(messages);

  // Business-specific qualification questionnaires are deliberately excluded
  // from this simple customer chat. Customer need + contact details are enough.
  state.requiredOwnerQuestions = [];
  state.pendingOwnerQuestion = null;

  const missing = nextContactField(state);
  const lastAssistant = lastAssistantText(messages);
  const allContactDetailsCaptured = !missing;
  const canSubmit = allContactDetailsCaptured && !!(state.primaryNeed || state.customerNeed) && !state.leadCapturePaused;
  const directPriceQuestion = isDirectPriceQuestion(latestUser);
  let handoff: LeadHandoffResult = { attempted: false, status: state.leadDeliveryStatus };
  if (canSubmit && !directPriceQuestion && state.leadDeliveryStatus !== "SENT" && state.leadDeliveryStatus !== "QUEUED") {
    // Captured contact details allow a business follow-up. They do not mean the
    // customer accepted an appointment or confirmed a preferred time.
    const simpleBusiness: BusinessProfile = {
      ...business,
      leadQuestions: [],
      ownerLeadQuestions: [],
    };
    handoff = await maybeSendLeadHandoff(simpleBusiness, state, "closure", latestUser, photoLinks, {
      allowContactCaptureOnly: true,
    });
    Object.assign(state, applyLeadDeliveryResult(state, handoff));
  }

  const photoInvitation = photoLinks.length === 0 && !state.customerPhotoInviteShown && customerNeedsPhotoReview(messages);
  let reply: string;
  const handoffIsReady = state.leadDeliveryStatus === "SENT" || state.leadDeliveryStatus === "QUEUED";
  if (handoffIsReady && (!hasQuestion(latestUser) || isSimpleAffirmation(latestUser))) {
    reply = `Thanks${state.lead.name ? `, ${state.lead.name}` : ""}. Your request is with the team, and they’ll contact you as soon as possible.`;
  } else if (state.leadDeliveryStatus === "FAILED" && canSubmit) {
    reply = "I’m sorry, I couldn’t send your request to the team just now. Please try again shortly.";
  } else if (isServiceTimingQuestion(latestUser)) {
    reply = groundedOperationsReply(state, latestUser, lastAssistant, handoffIsReady);
  } else {
    const instructions = simpleInstructions(state, business, photoInvitation, messages);
    if (testModel) {
      reply = (await testModel(instructions, messages)).trim();
    } else {
      // Bound provider latency so a slow upstream model cannot leave the chat
      // request open until the serverless function times out.
      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: 8_000,
        maxRetries: 0,
      });
      const response = await client.responses.create({
        model: "gpt-5-mini",
        instructions,
        input: messages.map((message) => ({ role: message.role, content: message.content })),
      });
      reply = response.output_text?.trim() || "";
    }
    if (!reply) throw new Error("Sales employee returned an empty reply.");

    if (missing && asksFor(lastAssistant, missing)) {
      reply = reply.split(/(?<=[.!?])\s+|\n+/u).filter((part) => !(part.trim().endsWith("?") && asksFor(part, missing))).join(" ").trim();
    }
    if (missing && !state.leadCapturePaused && !asksFor(lastAssistant, missing) && !asksFor(reply, missing)) {
      const actionable = state.intent === "HIGH" || state.intent === "READY_TO_ACT" || !!(state.primaryNeed || state.customerNeed);
      if (actionable) reply = `${reply.replace(/\s+$/, "")} ${questionFor(missing)}`;
    }
    reply = removeCapturedFieldQuestions(reply, state);
    if (hasUnsupportedOperationalClaim(reply, business) || isMalformedReply(reply)) {
      reply = groundedOperationsReply(state, latestUser, lastAssistant, handoffIsReady);
    }
    if (allContactDetailsCaptured && !hasQuestion(latestUser) && !state.leadCapturePaused) {
      reply = handoffIsReady
        ? `Thanks${state.lead.name ? `, ${state.lead.name}` : ""}. Your request is with the team, and they’ll contact you as soon as possible.`
        : groundedOperationsReply(state, latestUser, lastAssistant, handoffIsReady);
    }
  }

  if (photoInvitation) {
    if (!/\b(photos?|pictures?|images?)\b/i.test(reply)) {
      reply = `${reply.replace(/\s+$/, "")} If helpful, attach up to three optional photos (max 5 MB each) for the team to review.`;
    }
    state.customerPhotoInviteShown = true;
  }
  const businessPhoneDigits = (business.phone || "").replace(/\D/g, "");
  if (businessPhoneDigits.length >= 7 && reply.replace(/\D/g, "").includes(businessPhoneDigits)) {
    reply = fallbackReply(state, business, lastAssistant);
  }
  return { reply: reply.replace(/\s+/g, " ").trim(), salesState: state, leadDelivery: handoff.delivery };
}

export function buildSimpleSalesFallback(state: SalesState, business: BusinessProfile, lastAssistant = ""): string {
  return fallbackReply(state, business, lastAssistant);
}
