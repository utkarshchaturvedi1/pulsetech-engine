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

const PART_START = /^(?:do|does|did|is|are|was|were|can|could|will|would|have|has|should|what|when|where|which|who|how)\b/i;

/**
 * Separate interrogative clauses joined by "and". An either/or choice stays one
 * question. A clause that does not itself ask something stays with the original.
 */
export function ownerQuestionParts(question: string): string[] {
  const text = question.trim();
  if (!text) return [];
  const pieces = text.replace(/[?]+$/g, "").trim().split(/\s*,?\s+\band\b\s+/i);
  if (pieces.length < 2) return [text];
  const parts: string[] = [];
  for (let index = 0; index < pieces.length; index += 1) {
    const clause = pieces[index].trim().replace(/[?.!]+$/g, "");
    if (!clause || !PART_START.test(clause)) return [text];
    const asked = clause.charAt(0).toUpperCase() + clause.slice(1);
    parts.push(asked.endsWith("?") ? asked : `${asked}?`);
  }
  return parts.length > 1 ? parts : [text];
}

function eitherOrOptions(question: string): [string, string] | null {
  if (!/\b(?:is|are|do|does|did|was|were)\b/i.test(question)) return null;
  const cleaned = question.replace(/[?]+$/g, "").trim();
  const orAt = cleaned.toLowerCase().lastIndexOf(" or ");
  if (orAt < 0) return null;
  let right = cleanOptionSide(cleaned.slice(orAt + 4));
  let left = cleanOptionSide(cleaned.slice(0, orAt));
  if (!left || !right) return null;
  if (/^(?:have|has|do|does|did)\b/.test(left)) return null;
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
  if (picks.size > 1) return null;
  return choiceByDistinctiveTerms(full, options);
}

const OPTION_TERM_STOP = /^(?:about|after|again|being|could|every|other|right|their|there|these|those|under|where|which|while|would)$/i;

function optionTerms(option: string): string[] {
  return [...new Set(option.toLowerCase().split(/[^a-z0-9-]+/).filter((word) => word.length > 4 && !OPTION_TERM_STOP.test(word)))];
}

function termPolarity(text: string, term: string): "positive" | "negated" | null {
  const word = escapeRegExp(term);
  if (new RegExp(`\\b(?:non[-\\s]?${word}|(?:not|no|isn'?t|aren'?t|rather than)\\s+(?:\\w+\\s+){0,3}${word})\\b`, "i").test(text)) return "negated";
  if (new RegExp(`\\b${word}\\b`, "i").test(text)) return "positive";
  return null;
}

/** Select the option named by a term that appears on only one side, including a negated term. */
function choiceByDistinctiveTerms(reply: string, options: [string, string]): string | null {
  if (isUncertainChoice(reply) || /[?]/.test(reply)) return null;
  const owner = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const option of options) {
    for (const term of optionTerms(option)) {
      counts.set(term, (counts.get(term) || 0) + 1);
      if (!owner.has(term)) owner.set(term, option);
    }
  }
  const distinctive = [...owner.entries()].filter(([term]) => counts.get(term) === 1);
  const positive = new Set<string>();
  const negated = new Set<string>();
  for (const clause of decisiveClauses(reply)) {
    for (const [term, option] of distinctive) {
      const polarity = termPolarity(clause, term);
      if (polarity === "positive") positive.add(option);
      if (polarity === "negated") negated.add(option);
    }
  }
  for (const option of positive) negated.delete(option);
  if (positive.size === 1) return [...positive][0];
  if (positive.size === 0 && negated.size === 1) return options.find((option) => !negated.has(option)) || null;
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
  if (previous.includes(question) || previous.trim() === ownerQuestionClarification(question)) return true;
  const parts = ownerQuestionParts(question);
  return parts.length > 1 && parts.some((part) => part !== question && previous.includes(part));
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

function questionKey(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * When ownerLeadQuestions was never saved, use recorded website and owner
 * events. Questions the history does not mention stay required.
 * Returns undefined when there is no usable history, so callers keep the
 * legacy "every lead question is required" behavior instead of guessing.
 */
export function recoverOwnerLeadQuestions(business: BusinessProfile): string[] | undefined {
  if (business.ownerLeadQuestions !== undefined) return [...business.ownerLeadQuestions];
  const history = business.configurationHistory;
  if (!Array.isArray(history)) return undefined;
  const origin = new Map<string, "website" | "owner">();
  let sawOrigin = false;
  for (const event of history) {
    if (!event || (event.source !== "website" && event.source !== "owner")) continue;
    sawOrigin = true;
    for (const raw of event.removedLeadQuestions || []) {
      if (typeof raw === "string" && raw.trim()) origin.delete(questionKey(raw));
    }
    for (const raw of event.leadQuestions || []) {
      if (typeof raw === "string" && raw.trim()) origin.set(questionKey(raw), event.source);
    }
  }
  if (!sawOrigin) return undefined;
  const required: string[] = [];
  const seen = new Set<string>();
  for (const raw of business.leadQuestions || []) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const trimmed = raw.trim();
    const key = questionKey(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    if (origin.get(key) === "website") continue;
    required.push(trimmed);
  }
  return required;
}

export function ownerRequiredQuestions(business: BusinessProfile): string[] {
  const source = recoverOwnerLeadQuestions(business) ?? business.leadQuestions ?? [];
  return [...new Set(source.map((q) => q.trim()).filter((q) => q && !CORE_QUESTION.test(q)))];
}

export function websiteDiscoveryQuestions(business: BusinessProfile): string[] {
  const required = new Set(ownerRequiredQuestions(business));
  return [...new Set((business.leadQuestions || []).map((q) => q.trim()).filter((q) => q && !CORE_QUESTION.test(q) && !required.has(q)))];
}

function parentOwnerQuestion(state: SalesState, pending: string): string {
  if ((state.requiredOwnerQuestions || []).includes(pending)) return pending;
  return (state.requiredOwnerQuestions || []).find((question) => ownerQuestionParts(question).includes(pending)) || pending;
}

export function ownerQuestionSatisfied(state: SalesState, question: string): boolean {
  const parts = ownerQuestionParts(question);
  if (parts.length <= 1) return !!state.ownerQuestionAnswers?.[question];
  return parts.every((part) => !!state.ownerQuestionAnswers?.[part]);
}

export function synchronizeOwnerQuestions(state: SalesState, business: BusinessProfile): SalesState {
  const required = ownerRequiredQuestions(business);
  const pending = state.pendingOwnerQuestion;
  const pendingStillOpen = !!pending && required.some((question) => question === pending || ownerQuestionParts(question).includes(pending));
  return {
    ...state,
    ownerQuestionAnswers: { ...(state.ownerQuestionAnswers || {}) },
    requiredOwnerQuestions: required,
    pendingOwnerQuestion: pendingStillOpen ? pending : null,
  };
}

export function missingOwnerQuestions(state: SalesState): string[] {
  return (state.requiredOwnerQuestions || []).filter((question) => !ownerQuestionSatisfied(state, question));
}

/** Answered owner instructions, with each part of a compound instruction kept separately. */
export function recordedOwnerAnswerLines(state: SalesState): string[] {
  const lines: string[] = [];
  for (const question of state.requiredOwnerQuestions || []) {
    const parts = ownerQuestionParts(question);
    if (parts.length <= 1) {
      const answer = state.ownerQuestionAnswers?.[question];
      if (answer) lines.push(`${question} ${answer}`);
      continue;
    }
    for (const part of parts) {
      const answer = state.ownerQuestionAnswers?.[part];
      if (answer) lines.push(`${part} ${answer}`);
    }
  }
  return lines;
}

function storeOwnerAnswer(state: SalesState, question: string, latest: string): void {
  state.ownerQuestionAnswers[question] = recognizedEitherOrAnswer(question, latest) || preservedYesNoAnswer(question, latest) || latest.trim();
  if (state.pendingOwnerQuestion === question) state.pendingOwnerQuestion = null;
}

function partContentTerms(part: string): string[] {
  return part
    .replace(/[?.!]/g, "")
    .split(/\s+/)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 3 && !YES_NO_STOP.test(word) && !PART_START.test(word));
}

function sentenceCoveringPart(part: string, reply: string): string | null {
  const terms = partContentTerms(part);
  if (!terms.length || eitherOrOptions(part)) return null;
  const hit = sentenceList(reply).find((sentence) =>
    !/[?]$/.test(sentence)
    && !isUncertainChoice(sentence)
    && terms.every((term) => new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(sentence))
  );
  return hit || null;
}

function inflectionKey(word: string): string {
  return word.toLowerCase().replace(/(?:ing|ed|s)$/, "").replace(/e$/, "");
}

function modalAnswer(part: string, reply: string): string | null {
  if (!/^(?:can|could|will|would|should)\b/i.test(part)) return null;
  const terms = partContentTerms(part).map(inflectionKey);
  return sentenceList(reply).find(sentence => !/[?]/.test(sentence) && !isUncertainChoice(sentence) &&
    /\b(?:can|cannot|can't|will|won't|would|wouldn't|able|unable)\b/i.test(sentence) &&
    sentence.toLowerCase().split(/[^a-z]+/).some(word => terms.includes(inflectionKey(word)))) || null;
}

function partAnswerText(part: string, reply: string): string | null {
  const selected = recognizedEitherOrAnswer(part, reply);
  if (selected) return selected;
  const modal = modalAnswer(part, reply);
  if (modal) return modal;
  const covered = sentenceCoveringPart(part, reply);
  if (covered) return covered;
  if (restatesYesNo(part, reply)) {
    const preserved = preservedYesNoAnswer(part, reply);
    if (preserved) return preserved;
    const sentences = sentenceList(reply).filter((sentence) =>
      !/[?]$/.test(sentence) && (clauseRestatesYesNo(part, sentence) || clausesOf(sentence).some((clause) => clauseRestatesYesNo(part, clause)))
    );
    return sentences.length === 1 ? sentences[0] : reply.trim();
  }
  const descriptionQuestion = /\b(?:describe|what)\b.*\b(?:problem|project|work|service|help)\b/i.test(part);
  if (descriptionQuestion && clausesOf(reply).some((clause) => !PRICE_CLAUSE.test(clause) && DESCRIPTION_ANSWER.test(clause))) return reply.trim();
  return null;
}

/** Attribute a reply to the parts it actually addresses. A bare yes or no fills only the first open part. */
function assignPartAnswers(parts: string[], reply: string): Array<[string, string]> {
  const assigned: Array<[string, string]> = [];
  const used = new Set<string>();
  for (const part of parts) {
    const text = partAnswerText(part, reply);
    if (!text || (BARE_YES_NO.test(text) && !restatesYesNo(part, reply) && !recognizedEitherOrAnswer(part, reply))) continue;
    assigned.push([part, text]);
    used.add(part);
  }
  const bare = bareYesNoSentence(reply);
  if (bare) {
    const open = parts.find((part) => !used.has(part) && /^(?:do|does|did|is|are|was|were|can|could|will|would|should|have|has)\b/i.test(part.trim()) && !eitherOrOptions(part));
    if (open) assigned.push([open, bare]);
  }
  return assigned;
}

function storePartAnswers(state: SalesState, assigned: Array<[string, string]>): void {
  for (const [part, answer] of assigned) state.ownerQuestionAnswers[part] = answer;
  // A pronoun-dependent capability question does not apply when its antecedent
  // explicitly does not exist. Independent compound questions stay outstanding.
  for (const parent of state.requiredOwnerQuestions || []) {
    const parts = ownerQuestionParts(parent);
    if (parts.length < 2 || !/^(?:do you have|are there|is there|have you got)\b/i.test(parts[0])) continue;
    const existence = state.ownerQuestionAnswers[parts[0]] || "";
    if (!/^(?:no|none|we (?:don't|do not) have|i (?:don't|do not) have|there (?:are no|is no))\b/i.test(existence.trim())) continue;
    for (const part of parts.slice(1)) {
      if (/^(?:can|could|will|would)\s+(?:they|it|these|those)\b/i.test(part) && !state.ownerQuestionAnswers[part]) {
        state.ownerQuestionAnswers[part] = `Not applicable: ${existence}`;
      }
    }
  }
  state.pendingOwnerQuestion = null;
}

/** Only consume an answer to the question the server actually asked. */
export function captureOwnerQuestionAnswer(state: SalesState, latest: string, previousAssistant?: string, verified?: boolean): void {
  const pending = state.pendingOwnerQuestion;
  if (!pending || !assistantPromptedOwnerQuestion(previousAssistant, pending)) return;
  const parent = parentOwnerQuestion(state, pending);
  const parts = ownerQuestionParts(parent);
  if (parts.length > 1) {
    if (isPhoneOnly(latest) || isPriceOnlyMessage(latest)) return;
    if (/\b(prefer not to answer|do not want to answer|don'?t want to answer|rather not say)\b/i.test(latest)) {
      storePartAnswers(state, parts.filter((part) => !state.ownerQuestionAnswers[part]).map((part) => [part, latest.trim()]));
      return;
    }
    const open = parts.filter((part) => !state.ownerQuestionAnswers[part]);
    const focus = pending === parent ? open : open.filter((part) => part === pending);
    const assigned = assignPartAnswers(focus.length ? focus : open, latest);
    if (!assigned.length && pending !== parent && verified === true && !deterministicOwnerRejection(pending, latest)) {
      assigned.push([pending, latest.trim()]);
    }
    if (!assigned.length) return;
    storePartAnswers(state, assigned);
    return;
  }
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
    const parts = ownerQuestionParts(question);
    if (parts.length > 1) {
      const open = parts.filter((part) => !state.ownerQuestionAnswers[part]);
      for (const [part, answer] of assignPartAnswers(open, latest)) {
        if (BARE_YES_NO.test(answer)) continue;
        state.ownerQuestionAnswers[part] = answer;
      }
      continue;
    }
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
  const parts = ownerQuestionParts(question);
  const missing = parts.filter((part) => !state.ownerQuestionAnswers?.[part] && !state.ownerQuestionAnswers?.[question]);
  const ask = missing.length === parts.length || missing.length === 0 ? question : missing.join(" ");
  state.pendingOwnerQuestion = missing.length === 1 ? missing[0] : question;
  return ask;
}
