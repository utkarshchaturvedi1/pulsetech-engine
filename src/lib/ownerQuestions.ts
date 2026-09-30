import type { BusinessProfile } from "../types/business";
import type { SalesState } from "./salesState";

const CORE_QUESTION = /^(?:what(?:'s| is)|may i (?:have|get)|can i (?:have|get))\s+(?:(?:your|the|best)\s+)*(?:first name|full name|name|phone(?: number)?|number to reach you|service address|address)\b/i;
const PRICE_CLAUSE = /\?|\b(?:how much|overall cost|total cost|what.*\bcost\b|what.*\bprice\b)\b/i;
const DESCRIPTION_ANSWER = /\b(?:i|we)\s+(?:need|want|would like)\s+(?:to\s+)?(?:install|repair|replace|fix|build|renovate|upgrade|remove|clean|service)\b/i;
const YES_NO_QUESTION = /^(?:do|does|did|is|are|was|were|have|has|will|would)\b/i;
const BARE_YES_NO = /^(?:yes|no|yep|nope|yeah|sure|yes please)[.!]?$/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clausesOf(reply: string): string[] {
  const parts = reply
    .split(/\s*(?:—|–|\n|;|\?|\.|,|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts : [reply.trim()];
}

function isPriceOnlyMessage(reply: string): boolean {
  const clauses = clausesOf(reply);
  return clauses.length > 0 && clauses.every((clause) => PRICE_CLAUSE.test(clause));
}

function isPhoneOnly(reply: string): boolean {
  return /^(?:\+?1[\s.-]*)?(?:\(\d{3}\)|\d{3})[\s.-]*\d{3}[\s.-]*\d{4}[.!?]?$/.test(reply.trim());
}

function cleanOptionSide(side: string): string {
  const value = side
    .replace(/[?.!,;:]+$/g, "")
    .trim()
    .replace(
      /^(?:(?:do|does|did|is|are|was|were|can|could|will|would|should|have|has)\s+)+(?:(?:you|we|they|i)\s+)?(?:(?:need|want|like|prefer)\s+)?(?:(?:a|an|the|this|that|to)\s+)*/i,
      ""
    )
    .trim()
    .replace(/^(?:a|an|the)\s+/i, "")
    .trim()
    .toLowerCase();
  return value;
}

function eitherOrOptions(question: string): [string, string] | null {
  if (!/\b(?:is|are|do|does|did|was|were)\b/i.test(question)) return null;
  const cleaned = question.replace(/[?]+$/g, "").trim();
  const orAt = cleaned.toLowerCase().lastIndexOf(" or ");
  if (orAt < 0) return null;
  let right = cleanOptionSide(cleaned.slice(orAt + 4));
  let left = cleanOptionSide(cleaned.slice(0, orAt));
  if (!left || !right) return null;
  const leftWords = left.split(/\s+/).filter(Boolean);
  const rightWords = right.split(/\s+/).filter(Boolean);
  if (rightWords.length === 1 && leftWords.length > 1) left = leftWords[leftWords.length - 1];
  if (leftWords.length === 1 && rightWords.length > 1) right = rightWords[rightWords.length - 1];
  if (!/^[a-z][a-z\s-]*$/i.test(left) || !/^[a-z][a-z\s-]*$/i.test(right) || left === right) return null;
  return [left, right];
}

const ORDINAL_LABEL = /^(?:the\s+)?(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|sixth|6th|last)(?:\s+one)?$/i;

/** Null means the reply is not an ordinal. An ordinal whose index is null is outside the option list. */
function ordinalReplyIndex(reply: string, count: number): { index: number | null } | null {
  const text = reply.trim().toLowerCase().replace(/[.!?]+$/g, "").trim();
  const match = text.match(ORDINAL_LABEL);
  if (!match) return null;
  const label = match[1];
  if (label === "last") return { index: count > 0 ? count - 1 : null };
  const ranks = [["first", "1st"], ["second", "2nd"], ["third", "3rd"], ["fourth", "4th"], ["fifth", "5th"], ["sixth", "6th"]];
  const index = ranks.findIndex((names) => names.includes(label));
  if (index < 0 || index >= count) return { index: null };
  return { index };
}

function outOfRangeOrdinal(question: string, reply: string): boolean {
  const options = eitherOrOptions(question);
  if (!options) return false;
  const ordinal = ordinalReplyIndex(reply, options.length);
  return !!ordinal && ordinal.index === null;
}

function selectsOption(clause: string, options: string[], allowOrdinal: boolean): string | null {
  const text = clause.trim().toLowerCase().replace(/[.!?]+$/g, "");
  if (!text) return null;
  if (allowOrdinal) {
    const ordinal = ordinalReplyIndex(text, options.length);
    if (ordinal) return ordinal.index === null ? null : options[ordinal.index];
  }
  const negated = options.filter((option) =>
    new RegExp(`\\b(?:not|no|isn'?t|aren'?t|rather than)\\s+(?:a\\s+|an\\s+|the\\s+)?${escapeRegExp(option)}\\b`, "i").test(text)
  );
  const present = options.filter((option) => new RegExp(`\\b${escapeRegExp(option)}\\b`, "i").test(text));
  const positive = present.filter((option) => !negated.includes(option));
  return positive.length === 1 ? positive[0] : null;
}

const UNCERTAIN_CHOICE = /\b(?:not sure|unsure|uncertain|don'?t know|do not know|maybe|perhaps|might|possibly|not certain|i think|hard to say)\b/i;

function isUncertainChoice(reply: string): boolean {
  return UNCERTAIN_CHOICE.test(reply);
}

function sentenceList(reply: string): string[] {
  const parts = reply.split(/(?<=[.?!])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
  return parts.length ? parts : [reply.trim()];
}

/** Clauses that can decide a choice. Questions and uncertain clauses cannot. */
function decisiveClauses(reply: string): string[] {
  const clauses: string[] = [];
  for (const sentence of sentenceList(reply)) {
    if (/[?]$/.test(sentence) || /^(?:is|are|do|does|did|can|could|would|will|what|which|how|why)\b/i.test(sentence)) continue;
    for (const clause of clausesOf(sentence)) {
      if (!isUncertainChoice(clause)) clauses.push(clause);
    }
  }
  return clauses;
}

/**
 * The chosen either/or side. The whole reply is judged first: uncertainty, or an
 * option mentioned only inside a question, is not a selection. A clear clause
 * still counts when another clause is uncertain. An ordinal past the last option does not.
 */
export function recognizedEitherOrAnswer(question: string, reply: string, allowOrdinal = true): string | null {
  const options = eitherOrOptions(question);
  const full = reply.trim();
  if (!options || !full) return null;
  if (allowOrdinal) {
    const ordinal = ordinalReplyIndex(full, options.length);
    if (ordinal) return ordinal.index === null ? null : options[ordinal.index];
  }
  const picks = new Set<string>();
  for (const clause of decisiveClauses(full)) {
    if (PRICE_CLAUSE.test(clause)) continue;
    const selected = selectsOption(clause, options, allowOrdinal);
    if (selected) picks.add(selected);
  }
  if (picks.size === 1) return [...picks][0];
  return null;
}

const YES_NO_STOP = /^(?:this|that|your|with|have|does|what|there|from|about|they|them|their|would|will|were|been|into|onto|just|only|also|please|property|customer|someone|something)$/i;

function yesNoTopicWords(question: string): string[] {
  if (!YES_NO_QUESTION.test(question.trim())) return [];
  return question
    .replace(/[?.!]/g, "")
    .split(/\s+/)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 3 && !YES_NO_STOP.test(word));
}

function normalizePunctuation(value: string): string {
  return value
    .replace(/[\u2018\u2019\u2032`]/g, "'")
    .replace(/[—–]/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

const COMPOUND_NEGATIVE = /^(?:no|nope|nah)\b\s*[,;:.\-]*\s*(?:we|i|there|they)\s+(?:do not|don't|does not|doesn't|have not|haven't|are not|aren't|is not|isn't|cannot|can't)\b/i;

function isCompoundNegativeSentence(sentence: string): boolean {
  const text = normalizePunctuation(sentence).replace(/[.!]+$/g, "").trim();
  if (!text || /[?]$/.test(sentence.trim()) || isUncertainChoice(text)) return false;
  return COMPOUND_NEGATIVE.test(text);
}

function clauseRestatesYesNo(question: string, clause: string): boolean {
  const text = normalizePunctuation(clause);
  if (isUncertainChoice(text)) return false;
  const topics = yesNoTopicWords(question);
  if (!topics.length) return false;
  const mentioned = topics.some((topic) => new RegExp(`\\b${escapeRegExp(topic)}\\b`, "i").test(text));
  if (!mentioned) return false;
  return /\b(?:yes|no|not|nope|don'?t|do not|doesn'?t|isn'?t|aren'?t|haven'?t|this is|it is|it'?s|we do|we have|we don'?t|we do not)\b/i.test(text);
}

function bareYesNoSentence(reply: string): string | null {
  const bare = sentenceList(reply).filter((sentence) => !/[?]$/.test(sentence) && !isUncertainChoice(sentence) && BARE_YES_NO.test(sentence));
  return bare.length === 1 ? bare[0] : null;
}

/** A yes/no question answered by restating its topic, including inside one clear sentence of a compound reply. */
function restatesYesNo(question: string, reply: string): boolean {
  return sentenceList(reply).some((sentence) => {
    if (/[?]$/.test(sentence) || /^(?:is|are|do|does|did|can|could|would|will|what|which|how|why)\b/i.test(sentence)) return false;
    return clauseRestatesYesNo(question, sentence) || clausesOf(sentence).some((clause) => clauseRestatesYesNo(question, clause));
  });
}

/** The clear yes/no sentence when a compound reply also contains other material. */
function preservedYesNoAnswer(question: string, reply: string): string | null {
  if (!YES_NO_QUESTION.test(question.trim()) || eitherOrOptions(question)) return null;
  const full = reply.trim();
  const clear = sentenceList(full).filter((sentence) =>
    !/[?]$/.test(sentence) && (BARE_YES_NO.test(sentence) || isCompoundNegativeSentence(sentence) || clauseRestatesYesNo(question, sentence) || clausesOf(sentence).some((clause) => clauseRestatesYesNo(question, clause)))
  );
  if (clear.length !== 1 || clear[0].toLowerCase() === full.toLowerCase()) return null;
  const sentence = clear[0];
  if (!isUncertainChoice(sentence) && (BARE_YES_NO.test(sentence) || clauseRestatesYesNo(question, sentence))) return sentence;
  const clauses = clausesOf(sentence).filter((clause) => !isUncertainChoice(clause) && (BARE_YES_NO.test(clause) || clauseRestatesYesNo(question, clause)));
  return clauses.length === 1 ? clauses[0].replace(/^(?:but|and)\s+/i, "").trim() : sentence;
}

function bothOptionsWithoutChoice(question: string, reply: string): boolean {
  const options = eitherOrOptions(question);
  if (!options || recognizedEitherOrAnswer(question, reply)) return false;
  return options.every((option) => new RegExp(`\\b${escapeRegExp(option)}\\b`, "i").test(reply));
}

/** A certain non-answer. Semantic verification must not override this. */
export function deterministicOwnerRejection(question: string, reply: string): boolean {
  if (isPhoneOnly(reply)) return true;
  if (outOfRangeOrdinal(question, reply)) return true;
  if (explicitOwnerAnswer(question, reply)) return false;
  const choiceQuestion = !!eitherOrOptions(question) || YES_NO_QUESTION.test(question.trim());
  if (choiceQuestion && isUncertainChoice(reply)) return true;
  if (eitherOrOptions(question) && /\?/.test(reply) && !recognizedEitherOrAnswer(question, reply)) return true;
  if (bothOptionsWithoutChoice(question, reply)) return true;
  return isPriceOnlyMessage(reply);
}

export function ownerQuestionClarification(question: string): string {
  const options = eitherOrOptions(question);
  if (options) return `Which one applies, ${options[0]} or ${options[1]}?`;
  if (YES_NO_QUESTION.test(question.trim())) return "Should I take that as yes or no?";
  return "Could you tell me which part applies?";
}

export function assistantPromptedOwnerQuestion(previous: string | undefined, question: string): boolean {
  if (!previous || !question) return false;
  return previous.includes(question) || previous.trim() === ownerQuestionClarification(question);
}

/** An attempted answer whose meaning is still not a choice. Price and phone interruptions stay on their own path. */
export function replyNeedsOwnerClarification(question: string, reply: string): boolean {
  const text = reply.trim();
  if (!text || isPhoneOnly(text) || isPriceOnlyMessage(text) || explicitOwnerAnswer(question, text)) return false;
  if (outOfRangeOrdinal(question, text) || isUncertainChoice(text)) return true;
  if (!eitherOrOptions(question) || recognizedEitherOrAnswer(question, text)) return false;
  const ambiguousYesNo = decisiveClauses(text).filter((clause) => BARE_YES_NO.test(clause)).length === 1;
  return /\?/.test(text) || ambiguousYesNo;
}

/** Narrow, explicit answers that do not require a remote classifier. */
export function explicitOwnerAnswer(question: string, reply: string): boolean {
  const text = reply.trim();
  if (!text) return false;
  if (/\b(prefer not to answer|do not want to answer|don'?t want to answer|rather not say)\b/i.test(text)) return true;
  if (eitherOrOptions(question)) return recognizedEitherOrAnswer(question, text) !== null;
  if (isPriceOnlyMessage(text)) return false;
  if (YES_NO_QUESTION.test(question.trim()) && (BARE_YES_NO.test(text) || bareYesNoSentence(text) || restatesYesNo(question, text) || sentenceList(text).some(isCompoundNegativeSentence))) return true;
  const descriptionQuestion = /\b(?:describe|what)\b.*\b(?:problem|project|work|service|help)\b/i.test(question);
  return descriptionQuestion && clausesOf(text).some((clause) => !PRICE_CLAUSE.test(clause) && DESCRIPTION_ANSWER.test(clause));
}

export function ownerRequiredQuestions(business: BusinessProfile): string[] {
  return [...new Set((business.leadQuestions || []).map((q) => q.trim()).filter((q) => q && !CORE_QUESTION.test(q)))];
}

export function synchronizeOwnerQuestions(state: SalesState, business: BusinessProfile): SalesState {
  const required = ownerRequiredQuestions(business);
  return {
    ...state,
    ownerQuestionAnswers: { ...(state.ownerQuestionAnswers || {}) },
    requiredOwnerQuestions: required,
    pendingOwnerQuestion: required.includes(state.pendingOwnerQuestion || "") ? state.pendingOwnerQuestion : null,
  };
}

export function missingOwnerQuestions(state: SalesState): string[] {
  return (state.requiredOwnerQuestions || []).filter((q) => !state.ownerQuestionAnswers?.[q]);
}

function storeOwnerAnswer(state: SalesState, question: string, latest: string): void {
  state.ownerQuestionAnswers[question] = recognizedEitherOrAnswer(question, latest) || preservedYesNoAnswer(question, latest) || latest.trim();
  if (state.pendingOwnerQuestion === question) state.pendingOwnerQuestion = null;
}

/** Only consume an answer to the question the server actually asked. */
export function captureOwnerQuestionAnswer(state: SalesState, latest: string, previousAssistant?: string, verified?: boolean): void {
  const pending = state.pendingOwnerQuestion;
  if (!pending || !assistantPromptedOwnerQuestion(previousAssistant, pending)) return;
  if (explicitOwnerAnswer(pending, latest)) verified = true;
  if (deterministicOwnerRejection(pending, latest)) return;
  if (verified === false) return;
  // Semantic verification is question-specific; generic interruption patterns must
  // not veto a valid description, requested day, or other natural answer.
  if (verified === true && latest.trim()) {
    storeOwnerAnswer(state, pending, latest);
    return;
  }
  if (!latest.trim() || /\?|\b(how much|overall cost|total cost|what.*cost|what.*price|instead|why do you|why are you)\b/i.test(latest)) return;
  // An unrelated explicit service/timing request must not count as a qualification answer.
  if (/\b(can you come|please (?:schedule|book)|i (?:need|want) to (?:install|repair|replace))\b/i.test(latest)) return;
  if (/^(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(?:morning|afternoon|evening))?[.!]?$/i.test(latest.trim()) && !/\b(when|day|time)\b/i.test(pending)) return;
  storeOwnerAnswer(state, pending, latest);
}

/**
 * A compound message can explicitly answer other required questions in the
 * same turn. Unrelated text still cannot complete a question that was not asked.
 */
export function captureExplicitOwnerAnswers(state: SalesState, latest: string): void {
  if (!state.lead.name || !state.lead.phone || !state.lead.address || !latest.trim()) return;
  if (isPhoneOnly(latest) || isPriceOnlyMessage(latest)) return;
  // A refusal or a bare yes/no completes only the question that was asked.
  if (/\b(prefer not to answer|do not want to answer|don'?t want to answer|rather not say)\b/i.test(latest)) return;
  for (const question of missingOwnerQuestions(state)) {
    if (deterministicOwnerRejection(question, latest)) continue;
    const selected = recognizedEitherOrAnswer(question, latest, false);
    const described =
      /\b(?:describe|what)\b.*\b(?:problem|project|work|service|help)\b/i.test(question) &&
      clausesOf(latest).some((clause) => !PRICE_CLAUSE.test(clause) && DESCRIPTION_ANSWER.test(clause));
    if (!selected && !described) continue;
    storeOwnerAnswer(state, question, latest);
  }
}

export function ownerQuestionReply(state: SalesState): string | null {
  if (!state.lead.name || !state.lead.phone || !state.lead.address) return null;
  if (state.leadDeliveryStatus === "QUEUED" || state.leadDeliveryStatus === "SENT") return null;
  const question = missingOwnerQuestions(state)[0];
  if (!question) return null;
  state.pendingOwnerQuestion = question;
  return question;
}
