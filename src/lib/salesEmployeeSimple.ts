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

function simpleInstructions(state: SalesState, business: BusinessProfile, photoInvitation: boolean): string {
  const field = nextContactField(state);
  const userNeed = state.primaryNeed || state.customerNeed || "not clear yet";
  return `You are the sales employee for the business below. Keep the whole conversation natural, warm, short, and focused on what the customer just said.

WHAT YOU CAN DO
- Explain the business’s services and answer the customer’s questions using the verified business information below.
- Reassure a customer when the business offers the service they need. Help them understand the next step without pressuring them.
- Collect the customer’s name, phone number, and service address as part of helping. The next missing detail is ${field || "none"}. Ask only for that detail, and accept information the customer already gave.
- The customer may attach up to three optional photos for the team to review; each photo can be up to 5 MB. Offer this only if the customer wants a person to review the issue.
- Business information: ${simpleFacts(business)}
- Conversation facts: need=${userNeed}; name=${state.lead.name || "not given"}; phone=${state.lead.phone || "not given"}; address=${state.lead.address || "not given"}; agreed to next step=${state.customerAgreed ? "yes" : "no"}; preferred time=${state.preferredTiming || "not given"}; alert status=${state.leadDeliveryStatus}.
${photoInvitation ? "A photo invitation is appropriate in this reply." : "Do not suggest photos in this reply."}

WHAT YOU CAN’T DO
- Do not claim the business offers something it does not offer. If the information is missing, say you’re not sure and offer to have the team confirm.
- Do not invent prices, licenses, guarantees, availability, appointments, completed work, or successful contact with the team.
- Do not give out the business phone number or internal email/SMS details.
- Do not ask for information already provided, ask unnecessary service-category questions, or repeat a question the customer has not answered in the same reply.
- Do not say the request was sent or that the team will contact the customer unless the system says the lead alert is queued or sent.
- Keep the answer concise, answer the customer’s question first, and ask no more than one useful question.`;
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
  let handoff: LeadHandoffResult = { attempted: false, status: state.leadDeliveryStatus };
  if (canSubmit && state.leadDeliveryStatus !== "SENT" && state.leadDeliveryStatus !== "QUEUED") {
    // A customer who described a service need and supplied their contact details
    // has asked the business to follow up. This is a lead handoff, not a booked
    // appointment, so do not ask for scheduling consent or invent a time.
    state.customerAgreed = true;
    state.appointmentIntent = true;
    state.preferredTiming = state.preferredTiming || "As soon as possible";
    const simpleBusiness: BusinessProfile = {
      ...business,
      leadQuestions: [],
      ownerLeadQuestions: [],
    };
    handoff = await maybeSendLeadHandoff(simpleBusiness, state, "closure", latestUser, photoLinks);
    Object.assign(state, applyLeadDeliveryResult(state, handoff));
  }

  const photoInvitation = !state.customerPhotoInviteShown && customerNeedsPhotoReview(messages);
  let reply: string;
  if (handoff.attempted && (state.leadDeliveryStatus === "SENT" || state.leadDeliveryStatus === "QUEUED") && !hasQuestion(latestUser)) {
    reply = `Thanks${state.lead.name ? `, ${state.lead.name}` : ""}. I’ve passed your request to the team, and they’ll contact you as soon as possible.`;
  } else if (state.leadDeliveryStatus === "FAILED" && canSubmit) {
    reply = "I’m sorry, I couldn’t send your request to the team just now. Please try again shortly.";
  } else {
    const instructions = simpleInstructions(state, business, photoInvitation);
    if (testModel) {
      reply = (await testModel(instructions, messages)).trim();
    } else {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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
    if (allContactDetailsCaptured && !hasQuestion(latestUser) && !state.leadCapturePaused) {
      reply = `Thanks${state.lead.name ? `, ${state.lead.name}` : ""}. I have your details and will pass your request to the team so they can contact you as soon as possible.`;
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
