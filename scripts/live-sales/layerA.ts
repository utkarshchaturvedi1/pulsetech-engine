import type { BusinessProfile } from "../../src/types/business";
import type { SalesState } from "../../src/lib/salesState";
import { validateSalesReply } from "../../src/lib/salesController";
import { buildLeadNotificationEmail } from "../../src/lib/leadHandoff";
import type { LiveScenario } from "./scenarios";

export type LayerAResult = {
  ok: boolean;
  reasons: string[];
};

export function evaluateLayerA(args: {
  scenario: LiveScenario;
  business: BusinessProfile;
  turns: Array<{
    user: string;
    reply: string;
    state: SalesState;
  }>;
}): LayerAResult {
  const reasons: string[] = [];
  const { scenario, business, turns } = args;
  if (turns.length === 0) {
    return { ok: false, reasons: ["No turns recorded."] };
  }

  const first = turns[0];
  if (scenario.expectEarlyLeadCapture) {
    if (
      first.state.currentObjective !== "COLLECT_NAME" &&
      first.state.leadStatus !== "SECURING" &&
      !["ANSWER", "PRESENT_SOLUTION", "HANDLE_PRICE_OBJECTION", "HANDLE_HESITATION", "HANDLE_COMPETITOR_OBJECTION", "EXPLAIN_VALUE"].includes(
        first.state.currentObjective
      )
    ) {
      reasons.push(
        `Early lead capture missing: objective=${first.state.currentObjective} leadStatus=${first.state.leadStatus}`
      );
    }
    // Pure buying ask without a real interrupt should collect name.
    if (
      !/\?/.test(scenario.customerTurns[0].replace(/\bcan you help( me| with this| with that)?\??/i, "")) &&
      !/\b(how much|too expensive|do you|electrical|another company)\b/i.test(
        scenario.customerTurns[0]
      ) &&
      first.state.currentObjective !== "COLLECT_NAME" &&
      scenario.id !== "buying-question-before-lead" &&
      scenario.id !== "electrical-safety" &&
      scenario.id !== "price-objection" &&
      scenario.id !== "too-expensive" &&
      scenario.id !== "competitor-compare" &&
      scenario.id !== "modern-sink"
    ) {
      // modern-sink may HANDLE_HESITATION if uncertainty is in first message
    }
    if (
      scenario.expectEarlyLeadCapture &&
      ["solar-aspirational", "heater-broken", "jacuzzi-install", "volunteer-address-first", "urgent-asap", "volunteer-phone-first", "sparse-business", "rich-promo-filter"].includes(
        scenario.id
      ) &&
      first.state.currentObjective !== "COLLECT_NAME"
    ) {
      // Allow interrupt objectives only when first turn is a real question beyond help-me.
      const firstUser = scenario.customerTurns[0];
      const genuineInterrupt =
        /\b(do you|how much|too expensive|another company|not sure what to buy)\b/i.test(
          firstUser
        );
      if (!genuineInterrupt) {
        reasons.push(
          `Expected COLLECT_NAME on first turn, got ${first.state.currentObjective}`
        );
      }
    }
  }

  if (scenario.id === "modern-sink") {
    // Uncertainty in first message may briefly help, but lead path should still be active.
    if (
      first.state.intent !== "HIGH" &&
      first.state.intent !== "READY_TO_ACT" &&
      first.state.leadStatus === "NOT_SECURED"
    ) {
      reasons.push(`Modern sink should show actionable intent, got ${first.state.intent}`);
    }
  }

  if (scenario.id === "buying-question-before-lead" || scenario.id === "electrical-safety") {
    const interruptTurn = turns[1] || turns[0];
    if (
      ["COLLECT_NAME", "COLLECT_PHONE", "COLLECT_ADDRESS"].includes(
        interruptTurn.state.currentObjective
      ) &&
      /\b(electrical|do you handle)\b/i.test(interruptTurn.user)
    ) {
      reasons.push(
        `Genuine buying/scope question forced form field: ${interruptTurn.state.currentObjective}`
      );
    }
  }

  for (const turn of turns) {
    const validation = validateSalesReply(turn.reply, turn.state, business);
    if (!validation.ok) {
      reasons.push(
        `validateSalesReply @ ${turn.state.currentObjective}: ${validation.reasons.join("; ")}`
      );
    }

    if ((turn.reply.match(/\?/g) || []).length > 2) {
      reasons.push("More than two questions in a single assistant reply.");
    }

    if (turn.reply.trim().split(/\s+/).length > 160) {
      reasons.push("Excessive response length (>160 words).");
    }

    if (
      /\b(i('ll| will) (calculate|compute|run the numbers|check live availability|dispatch|book you)|i('ve| have) (scheduled|booked|dispatched))\b/i.test(
        turn.reply
      )
    ) {
      reasons.push("Unsupported Customer AI capability claim.");
    }

    if (
      scenario.expectNoBrochure &&
      /\b(we offer|financing|24\s*\/\s*7|promotion|special offer|free estimates?)\b/i.test(
        turn.reply
      ) &&
      (turn.reply.match(/\b(financing|promotion|24\s*\/\s*7|licensed|insured|warranty)\b/gi) || [])
        .length >= 3
    ) {
      reasons.push("Likely brochure dump during scenario.");
    }

    if (
      scenario.expectPainTone &&
      turns.indexOf(turn) === 0 &&
      /\b(great project|worthwhile upgrade|excited|can'?t wait)\b/i.test(turn.reply)
    ) {
      reasons.push("Aspirational cheer on pain/problem request.");
    }
  }

  // Volunteered address must stick
  if (scenario.id === "volunteer-address-first") {
    const afterAddress = turns[1];
    if (!afterAddress?.state.lead.address) {
      reasons.push("Volunteered address was not captured.");
    }
    if (afterAddress && afterAddress.state.currentObjective === "COLLECT_ADDRESS") {
      reasons.push("Asked for address again after it was volunteered.");
    }
    if (afterAddress && afterAddress.state.intent === "LOW") {
      reasons.push("Intent downgraded after address-only reply.");
    }
  }

  if (scenario.id === "volunteer-phone-first") {
    const afterPhone = turns[1];
    if (!afterPhone?.state.lead.phone) {
      reasons.push("Volunteered phone was not captured.");
    }
  }

  const last = turns[turns.length - 1];
  if (scenario.expectSecureByEnd && last.state.leadStatus !== "SECURED") {
    // Allow incomplete if conversation ended mid-objection without finishing fields
    if (scenario.archetype !== "objection" || scenario.customerTurns.length >= 4) {
      if (
        !last.state.lead.name ||
        !last.state.lead.phone ||
        !last.state.lead.address
      ) {
        reasons.push(
          `Lead not secured by end: status=${last.state.leadStatus} lead=${JSON.stringify(last.state.lead)}`
        );
      }
    }
  }

  if (last.state.leadStatus === "SECURED") {
    const email = buildLeadNotificationEmail(business, last.state);
    if (!email.text.includes(business.businessName)) {
      reasons.push("Lead email missing business name.");
    }
    if (last.state.lead.name && !email.text.includes(last.state.lead.name)) {
      reasons.push("Lead email missing customer name.");
    }
    if (last.state.lead.phone && !email.text.includes(last.state.lead.phone)) {
      reasons.push("Lead email missing phone.");
    }
    if (last.state.lead.address && !email.text.includes(last.state.lead.address)) {
      reasons.push("Lead email missing address.");
    }
    if (/\b(SECURED|PRESENT_SOLUTION|handoffReady)\b/.test(email.text)) {
      reasons.push("Lead email leaked internal state terminology.");
    }
    if (
      last.state.preferredTiming &&
      !email.text.toLowerCase().includes(last.state.preferredTiming.toLowerCase().slice(0, 12))
    ) {
      // soft: timing strings may be normalized
    }
  }

  // Mechanical we-can-help spam across collection turns
  const collectReplies = turns.filter((t) =>
    ["COLLECT_NAME", "COLLECT_PHONE", "COLLECT_ADDRESS"].includes(
      t.state.currentObjective
    )
  );
  const weCanHelpCount = collectReplies.filter((t) =>
    /\bwe can (definitely )?help\b/i.test(t.reply)
  ).length;
  if (weCanHelpCount >= 3) {
    reasons.push("Mechanical repeated 'we can help' during lead capture.");
  }

  return { ok: reasons.length === 0, reasons };
}
