import OpenAI from "openai";
import type { BusinessProfile } from "../../src/types/business";
import type { LiveScenario } from "./scenarios";

export type SalesDimension =
  | "customerUnderstanding"
  | "humanNaturalTone"
  | "appropriateEmotion"
  | "trustBuilding"
  | "eagernessToServe"
  | "salesValue"
  | "questionObjectionHandling"
  | "relevance"
  | "momentum"
  | "closureQuality"
  | "conciseness"
  | "commercialCredibility";

export type LayerBResult = {
  ok: boolean;
  scores: Record<SalesDimension, number>;
  average: number;
  passFail: "PASS" | "FAIL";
  strongest: string;
  weakest: string;
  failureTurns: string;
  generalizedReason: string;
  diagnosis: string;
  raw?: string;
};

const DIMENSIONS: SalesDimension[] = [
  "customerUnderstanding",
  "humanNaturalTone",
  "appropriateEmotion",
  "trustBuilding",
  "eagernessToServe",
  "salesValue",
  "questionObjectionHandling",
  "relevance",
  "momentum",
  "closureQuality",
  "conciseness",
  "commercialCredibility",
];

function clampScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(5, Math.round(n)));
}

export async function evaluateLayerB(args: {
  openai: OpenAI;
  scenario: LiveScenario;
  business: BusinessProfile;
  transcript: string;
}): Promise<LayerBResult> {
  const { openai, scenario, business, transcript } = args;

  const instructions = `You are an independent PulseTech Sales Quality Evaluator.
You did NOT write the salesperson replies. Judge commercial human sales quality only.
Do not reward fake promises, invented pricing, invented availability, or fake urgency.

Score each dimension 1-5 using this rubric:
1 customerUnderstanding — understands what customer wants
2 humanNaturalTone — human sales/service rep, not form/script
3 appropriateEmotion — aspirational=positive interest; pain=empathy once then competence; urgent=calm action-oriented handoff WITHOUT inventing ETA/dispatch/availability
4 trustBuilding — one relevant grounded trust/value fact when helpful, not credential dump every turn
5 eagernessToServe — business wants the work; no indifference; no fake urgency
6 salesValue — increases confidence/desire vs a web form
7 questionObjectionHandling — answers real buying questions then progresses
8 relevance — no brochure dump / unrelated services
9 momentum — useful next step without pressure or stall
10 closureQuality — clear complete/end when appropriate (or natural mid-progress if incomplete by design). For urgent: calm confirmation that the request is flagged/sent for the team is enough — do NOT require timeslots or ETAs
11 conciseness — short useful conversational; penalize repeating the same apology/credential every turn
12 commercialCredibility — would make customer MORE likely to hire

CRITICAL SCORING RULES:
- Do NOT penalize the absence of ETA, dispatch, live availability, or "someone today" promises. Those capabilities are NOT connected in V1.
- DO penalize invented ETAs, invented dispatch, or fake urgency promises.
- For urgent ASAP after lead is complete: reward calm acknowledgment + truthful handoff language.

FAIL if ANY score < 3 OR average < 4.0 OR salesValue < 4 OR commercialCredibility < 4 OR eagernessToServe < 4.

Return ONLY valid JSON with no markdown fences:
{
  "scores": {
    "customerUnderstanding": 1,
    "humanNaturalTone": 1,
    "appropriateEmotion": 1,
    "trustBuilding": 1,
    "eagernessToServe": 1,
    "salesValue": 1,
    "questionObjectionHandling": 1,
    "relevance": 1,
    "momentum": 1,
    "closureQuality": 1,
    "conciseness": 1,
    "commercialCredibility": 1
  },
  "strongest": "...",
  "weakest": "...",
  "failureTurns": "turn numbers or none",
  "generalizedReason": "rule-level reason or none",
  "diagnosis": "one sentence"
}`;

  const input = `Archetype: ${scenario.archetype}
Scenario: ${scenario.title} (${scenario.id})

Scoring guidance for this archetype:
${
  scenario.archetype === "interrupt"
    ? `- This turn sequence includes a genuine buying/scope question. Answering it before or while securing the lead is CORRECT.
- Do not require emergency/pain empathy unless the customer described an active hazard (sparking, burning, shock, gas leak).
- Prefer clear capability answer + confident next step.`
    : scenario.archetype === "urgent"
      ? `- Urgent/ASAP: reward calm action and truthful handoff. Do NOT require ETA/dispatch promises.`
      : scenario.archetype === "pain"
        ? `- Pain/problem: reward brief empathy once, then competence. Penalize cheerfulness and credential spam every turn.`
        : scenario.archetype === "aspirational"
          ? `- Aspirational: reward genuine positive interest and commercial confidence without brochure dumps.`
          : `- Judge commercial quality for this archetype fairly.`
}

Business facts available to salesperson:
- name: ${business.businessName}
- services: ${business.services.join("; ")}
- areas: ${business.serviceAreas.join("; ")}
- knowledge: ${business.systemPrompt}
- faqs: ${business.faqs.map((f) => `${f.question} => ${f.answer}`).join(" | ") || "none"}

Transcript:
${transcript}
`;

  async function requestOnce(extra?: string): Promise<string> {
    const response = await openai.responses.create({
      model: "gpt-5-mini",
      instructions: extra ? `${instructions}\n\n${extra}` : instructions,
      input,
    });
    return response.output_text?.trim() || "";
  }

  function parseScores(raw: string): Record<string, unknown> | null {
    try {
      const cleaned = raw
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      return JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
    } catch {
      return null;
    }
  }

  let raw = await requestOnce();
  let parsed = parseScores(raw);
  if (!parsed) {
    raw = await requestOnce(
      "Your previous reply was not valid JSON. Reply again with ONLY the JSON object. No markdown."
    );
    parsed = parseScores(raw);
  }

  if (!parsed) {
    return {
      ok: false,
      scores: Object.fromEntries(DIMENSIONS.map((d) => [d, 1])) as Record<
        SalesDimension,
        number
      >,
      average: 1,
      passFail: "FAIL",
      strongest: "n/a",
      weakest: "evaluator parse failure",
      failureTurns: "n/a",
      generalizedReason: "Sales quality evaluator returned non-JSON.",
      diagnosis: "Independent evaluator output could not be parsed.",
      raw,
    };
  }

  const scoreBag = (parsed.scores || {}) as Record<string, unknown>;
  const scores = Object.fromEntries(
    DIMENSIONS.map((d) => [d, clampScore(scoreBag[d])])
  ) as Record<SalesDimension, number>;
  const average =
    DIMENSIONS.reduce((sum, d) => sum + scores[d], 0) / DIMENSIONS.length;

  const hardFail =
    DIMENSIONS.some((d) => scores[d] < 3) ||
    average < 4.0 ||
    scores.salesValue < 4 ||
    scores.commercialCredibility < 4 ||
    scores.eagernessToServe < 4;

  return {
    ok: !hardFail,
    scores,
    average: Number(average.toFixed(2)),
    passFail: hardFail ? "FAIL" : "PASS",
    strongest: String(parsed.strongest || ""),
    weakest: String(parsed.weakest || ""),
    failureTurns: String(parsed.failureTurns || ""),
    generalizedReason: String(parsed.generalizedReason || ""),
    diagnosis: String(parsed.diagnosis || ""),
    raw,
  };
}
