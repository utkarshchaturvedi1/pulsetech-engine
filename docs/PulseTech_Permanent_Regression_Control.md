# PulseTech Permanent Regression Control

## 1 October 2026 — explicit business phone requests

The live question `What is your business phone number?` received generic consultation wording. The phone-request recognizer omitted business/office/telephone wording, so validation could reject the saved number. Explicit requests for the saved business phone must work without a model, preserve the next required contact/owner question, and never populate the customer's phone with the business number. Normal service inquiries must still follow name → customer phone → service address without unsolicited business-phone handoff. The owner/pricing regression covers business phone, office telephone, ordinary phone wording, interrupted capture, and pending owner qualification.

## 1 October 2026 — pricing checker clause scope

Expanded live testing found a generic fallback on the first EV-charger price question despite a relevant reply on the repeated question. A local `generateSalesReply` regression reproduces one confirmed cause: the checker rejects a valid total-price explanation and a separately labelled visit fee when both share one sentence. Price scope must follow the clause containing the amount. Preserve rejection of visit amounts asserted as total project prices, including claims split across conjunctions and currency amounts containing commas. The permanent owner/pricing suite covers the first question verbatim (`yes. How much will it cost though?`), semicolon/comma/conjunction separation, and unsafe total-price claims. This rule applies across services; never introduce an EV-charger or business-specific runtime exception.

This file is the in-repo source of truth for historical PulseTech failures and mandatory regression rules. Do not weaken, skip, or replace earlier rules when adding new ones.

**Provenance:** the original Word document (`PulseTech_Permanent_Regression_Control.docx`) was not found. This Markdown Guardian was reconstructed from the complete 19 Sep 2026 A–H Guardian report and later live-production failures. It is now the canonical in-repo source of truth.

## Mandatory rule for every change

Before any PulseTech product change, Cursor must read this file, identify affected rules, add regression coverage for any gap, run every required test, and report results before commit/push.

Do not redesign the UI, change landing-page content, change business logic deliberately, or change voice/alert providers unless a test proves it is necessary. Do not hardcode a business, service, customer name, or one test sentence as product behavior. Do not remove, weaken, skip, or replace earlier regression assertions. Do not commit or push unless the human explicitly asks after the required tests and report.

Preserve all existing chat functionality, business logic, recipient routing, after() background delivery, Twilio, and ElevenLabs behavior unless the approved change explicitly requires it.

Lead capture must not turn the AI Sales Employee into a robotic form. For website chat, once name + customer phone + service address (when relevant) + a concrete service need are captured, send one business-specific lead alert immediately. Do not wait for appointment time, calendar agreement, or extra owner qualification answers. Continue helpful, warm, sales-oriented service guidance and useful owner questions afterward. Direct customer questions—especially price—must be answered first, truthfully and without invented facts. Confirmation wording must match SENT, QUEUED, or FAILED delivery truthfully. The inbound voice handoff path remains unchanged.

**Permanent conversation-quality rule:** Lead protection must never turn the AI Sales Employee into a cold form. Before contact capture, acknowledge the customer’s stated situation with intent-appropriate emotion (empathy for problems, enthusiasm for projects, excitement for celebrations, confident help for consultations)—never a universal “I’m sorry” template. After the first website lead alert, provide expert, profile-aware help: answer the question first and ask at most one relevant diagnostic follow-up when it can improve the next step. Do not provide a full DIY solution, repeat captured details, or repeat the customer’s name mechanically.

---

## Canonical lead sequence (website chat)

Protect the opportunity first. A genuine high-intent need must not be lost to HVAC-style discovery, troubleshooting, or a premature business-phone handoff.

**Capture and alert order:**

1. Need already known (customer stated the service need)
2. Name
3. Customer phone (the visitor/caller’s number — never the scraped business number in place of this field)
4. Service address (where relevant)
5. As soon as the core details are captured, send exactly one lead alert to that business’s configured email/SMS recipients
6. Continue answering direct questions, offering brief expert guidance, and collecting useful owner-configured details
7. Discuss scheduling only if the customer asks; do not claim anything is booked or require timing to alert the business

The lead alert must not wait for preferred time, an explicit agreement to schedule, or owner-configured qualification questions. If those questions are useful, continue asking them after the first alert. A later answer must not trigger a duplicate email/SMS. Do not invent an email address or phone number; resolve recipients from the business profile and report delivery failure honestly.

**Hard bans on this path:**

- No “recorded”, “shared”, “I’ll alert,” “team will contact,” or equivalent unless a handoff is actually queued or scheduled. SENT vs QUEUED wording must stay truthful. Never imply the request was already delivered when status is only queued.
- No business phone unless the visitor explicitly asks for the number, explicitly states emergency / danger / immediate help, or delivery **failed**. Normal success close must never expose a scraped business phone or say “if you prefer to call”.
- Do not ask preferred time as a prerequisite for the website lead alert. The chatbot has no calendar booking integration.
- Preferred time is never described as booked or confirmed.
- Failed delivery: tell them to contact the business phone or email; never claim the team was alerted. Never expose internal delivery status to the customer.
- On failed delivery, direct the visitor to contact the business by phone/email if appropriate; never expose internal delivery status.

Before name, customer phone, and service address are secured, do not diagnose, interrogate, or sell the service first.

High-intent is a sales safety net, not a technician interrogation. Do not diagnose, ask residential vs commercial, or troubleshoot **before** name, customer phone, and service address. Ask one field at a time. After the lead is alerted, continue helping with concise, temporary guidance that supports a sale and leaves full diagnosis/repair to the business.

Inbound voice retains its previously approved handoff timing and provider behavior. Do not change voice handoff timing as part of this website-chat fix without separate regression evidence.

Low-intent browsing is different: answer helpfully; do not immediately demand contact information.

ANSWER FIRST: if the customer asks a direct question, answer it; do not refuse solely to force discovery. That does not authorize HVAC/service discussion **instead of** collecting the next missing lead field on a high-intent turn.

---

## Categories A–H

### A. Demo identity and persistence

- New generated demo must use a unique durable saved id.
- It must load from another device/browser.
- Failed save must show setup error, not a broken invitation.
- No Texas Solar / showcase leakage.
- Do not hardcode a business, service, customer name, or one test sentence as product behavior.

### B. Lead capture and state

- Fields remain sticky: name, customer phone, address, primary need, preferred time, agreement.
- Test short name, correction, time phrase not becoming a name, generic service need.
- Test combined messages:
  - “Tomorrow afternoon. How much will it cost?”
  - “Tommorow afternoon”
  - “Tomorrow morning works, but what do you charge?”
- Confirm preferred time stays saved after a pricing response and “Yes”.
- High-intent / ready-to-act: need already known → name → customer phone → service address, one field at a time. Do not discuss the service, diagnose, or ask residential/commercial or troubleshooting questions before those three fields are stored.
- After the core lead fields are captured, the website alert is sent once immediately. The bot can then resume a human sales conversation: acknowledge the need with intent-appropriate emotion, answer questions (price first), and offer concise, useful guidance. Do not stay in form-field mode.
- Before the name question, acknowledge the stated situation with intent-appropriate emotion. Do not use a cold “We can help with that. What’s your first name?” form. Do not use “I’m sorry” for aspirational projects, celebrations, or neutral consultations.
- Owner-configured qualification questions never block the initial website alert; preserve them and continue afterward when useful. Do not repeat the customer’s name mechanically.

### C. Handoff and customer wording

- For website chat, required initial alert data is name, customer phone, address when relevant, and a concrete service need. Send exactly one email/SMS alert without waiting for appointment timing, agreement, or additional owner questions.
- Missing preferred time does not block the website lead alert. Never claim an appointment is booked.
- No response may say “recorded”, “shared”, “I’ll alert,” “team will contact,” or imply alert delivery unless handoff is actually queued/scheduled.
- Use “shared with the team” only when delivery status is SENT. QUEUED wording must never imply completed delivery.
- On failed delivery, direct the visitor to contact the business by phone/email if appropriate; never expose internal delivery status.
- Normal success close must never expose scraped business phone or say “if you prefer to call”.
- Business phone is allowed only if the visitor explicitly asks, states emergency/danger/immediate help, or delivery failed.
- Preferred time must never be described as booked.
- Email and SMS must include the primary need and all captured contact details; include timing only when the customer volunteered it.

### D. Alert delivery

- Per-business recipients only; no PulseTech fallback for personalised demos.
- Email and SMS must work independently.
- `after()` must preserve non-blocking delivery.
- Duplicate/replay must result in one email task and one SMS task only.
- Assert safe logs show queued/sent/failed reason without customer PII.

### E. Voice

- Correct code, wrong code, six-digit auto-submit, no `#` requirement.
- Access code never spoken.
- Dynamic agent name/pricing reaches the call session.
- Completed transcript queues one email + one SMS; incomplete transcript queues none.
- Replay same ElevenLabs conversation id does not duplicate alerts.
- Same capture order as chat: need → name → customer phone → service address; do not ask appointment / preferred visit time until those are captured.
- Preserve Twilio code entry, ElevenLabs personalised voice profile, and existing voice safety. Do not change voice/alert providers unless a test proves it is necessary.

### F. Mobile UI

- At 375px, chat shell remains fixed, only transcript scrolls, no horizontal overflow.
- Customer outgoing text is readable.
- Peter header is readable.
- Phone-test card remains reachable.
- Do not alter colour design except to fix measurable contrast failures.
- Do not change mobile layout, transcript scrolling, or landing visual design as part of unrelated lead-capture repairs.

### G. Performance

- Completed-lead deterministic turn must not call OpenAI unnecessarily.
- Record timing fields.
- Ensure no final handoff path waits for SMTP/SMS.

### H. Public launch / legal and contact

- Public Privacy Policy at `/privacy`.
- Public Terms of Service at `/terms`.
- Contact & Support: `mailto:contact@pulsetechlabs.com`.
- Homepage footer: Privacy Policy → `/privacy`, Terms of Service → `/terms`, Contact & Support → `mailto:contact@pulsetechlabs.com`.
- Language must stay accurate for PulseTech: AI Sales Employee on website chat and inbound phone calls; lead information may include name, phone, service address, and service need; lead alerts may be sent to the relevant business by email and SMS; no guarantee of leads, bookings, revenue, message delivery, or third-party service uptime; AI/call/chat disclosure and privacy contact details.
- Do not add pricing anywhere on the public website.
- Do not touch untracked branding or agent image files.
- Do not change legal pages as part of unrelated chat/voice/alert repairs.

---

## Automated-test mapping

| Rule area | Existing coverage | Gap |
|---|---|---|
| **A** Demo identity and persistence | `scripts/test-demo-chat.ts`: `testPersonalizedDemoSaveAndLoad`, `testPersonalizedDemoFailedSave`, `testHomepageDoesNotHardcodeTexasSolar`, `testTexasSolarLogo` | None identified for the HVAC live failure |
| **B** Sticky fields, combined time+price, primary need | `scripts/test-demo-chat.ts`: `testRajaNameCaptureAndPreferredTime`, `testGenericPreferredTimeLeadCapture`, `testCompoundPriceAndPreferredTime`, `testStickyPrimaryNeedInAlerts`, `testVisitPreferenceNoDuplicateAddress`; `scripts/test-handoff-timing.ts` TEST10–16 | **Missing:** high-intent service need → COLLECT_NAME; forbid residential/commercial, troubleshooting, and service discussion before name, customer phone, and service address |
| **C** Handoff, truthful wording, time after lead, no phone on success close | `scripts/test-demo-chat.ts`: `testCustomerFacingHandoffWording`, `testGenericPreferredTimeLeadCapture`; `scripts/test-handoff-timing.ts` TEST4, TEST13, TEST16 | Phone block is **QUEUED/SENT success close only**. **Missing:** business phone forbidden before the lead is secured unless ask / emergency / danger / immediate help / delivery failed. **Missing:** preferred-time question forbidden while name, customer phone, or address is still missing |
| **D** Alert delivery | `scripts/test-demo-chat.ts`: `testPerBusinessLeadAlerts`; handoff-timing duplicate/idempotency; PII-safe `publicHandoffDecisionLog` | Not the HVAC root cause; preserve when fixing capture order |
| **E** Voice | `scripts/test-voice-demo.ts` (code, session, post-call, replay); `scripts/test-inbound-voice.ts`: `testLeadFlowUnchanged` (order + no time until name/phone/address **in prompt text**) | Prompt-string coverage only; does not stop website chat from asking time or discussing HVAC early |
| **F** Mobile UI | `scripts/test-demo-chat.ts`: `testLayoutConstraints` | Do not touch for lead-capture repairs |
| **G** Performance | Timing / OpenAI / non-blocking paths in demo-chat and handoff-timing | Do not add SMTP waits |
| **H** Public legal/contact | Routes exist as static `/privacy` and `/terms`; footer mailto | No dedicated legal-page test; do not edit those pages for the HVAC bug |

Controller already **selects** `COLLECT_NAME` → phone → address on HIGH / READY_TO_ACT when fields are missing (`selectObjective` in `src/lib/salesController.ts`). `validateSalesReply` does **not** reject HVAC discovery, residential/commercial questions, or early business-phone exposure on that path. Master Sales Command in `src/lib/salesChat.ts` states the intended behavior; production still violated it.

---

## Newly discovered production failure (HVAC / premature discovery)

**Live failure:**

- AI discussed HVAC service before collecting lead details.
- It asked residential/commercial and troubleshooting questions before name, customer phone, and service address.
- It exposed the business phone number even though the customer did not explicitly say emergency/danger/immediate help or ask for the number.
- It asked preferred time before the lead was secured.
- This can cause a customer lead to be lost and an alert not to be sent.

**Map:** primarily **B** (capture order / premature discovery) and **C** (business phone; preferred time before name/phone/address). Voice **E** has the same order rule in the inbound prompt and must not be weakened. A, D, F, G, H are preserve-only for this repair.

**Likely implementation notes (for a later repair — not an instruction to edit now):**

- Tighten website-chat sales control/validation so high-intent turns only ask the next missing field among name → customer phone → service address.
- Reject replies that discuss the service, ask residential vs commercial, or troubleshoot before those three are stored.
- Allow business number only on explicit ask, emergency/danger/immediate help, or FAILED delivery; keep the success-close ban for QUEUED/SENT.
- Keep preferred day/time only on `ADVANCE_TO_NEXT_STEP` after name, customer phone, and address.
- Do not weaken “missing time → no handoff, ask once.”
- Preserve sticky extractors, combined time+price, truthful queued vs sent copy, per-business routing, `after()` delivery, voice tests, 375px layout, PII-safe logs, legal pages.
- Add **generic** regression tests (not HVAC-only, not one hardcoded brand): high-intent service request → COLLECT_NAME; reject residential/commercial and troubleshooting; reject business phone without ask/emergency/failed delivery; reject preferred-time ask before the three lead fields.
- Likely later files: `src/lib/salesController.ts` (`validateSalesReply` / possibly `detectIntent` if wording is classified LOW); `src/lib/salesChat.ts` only if a prompt line is required. Tests: `scripts/test-demo-chat.ts` and/or `scripts/test-handoff-timing.ts`. Avoid inbound voice / Twilio / ElevenLabs unless a test proves the same leak there.

---

## Newly discovered production failure (cold-form sales conversation)

**Live failure:**

- High-intent capture still used a cold form: “We can help with that. What’s your first name?”
- Phone and address turns repeated “Thanks, {name}” mechanically.
- After name + customer phone + service address, the AI jumped to preferred day/time instead of a helpful, profile-aware next-step explanation.
- Price answers used “I don’t have a verified price to quote from here” and treated price as a reason to force a time question.
- A preferred time without prior agreement could still be treated as a completed-handoff claim.

**Map:** primarily **B** (lead capture must stay human after the three contact fields) and **C** (no recorded/shared/team-contact wording before a queued handoff). Preserve A, D, E, F, G, H. Do not hardcode plumbing or any one vertical as product behavior.

**Coverage:** `scripts/test-demo-chat.ts` `testProfileAwareSalesConversationQuality` plus existing high-intent / post-contact / pre-queue tests. Representative plumbing, HVAC, electrical, roofing, and consultation-style profiles. Do not weaken earlier HVAC discovery, phone, or capture-order assertions.

---

## Required test commands

Run this set **before** and **after** any product repair. On Windows:

```text
npm.cmd run test:demo-chat
npm.cmd run test:handoff-timing
npm.cmd run test:inbound-voice
npm.cmd run test:voice-demo
npm.cmd run build
```

Optional extra if the patch touches owner/profile save: `npm.cmd run test:owner-profile-update`.

Report PASS/FAIL for each command, any new coverage added, and that earlier assertions were not removed or weakened. Do not commit or push until the human asks.

---

## Preservation checklist for any repair

### Owner configuration and price-scope regression (30 Sep 2026)

#### Production regression: repeated project-description question (30 Sep 2026)

- Customer stated a garage charger installation, completed name → phone → address, then answered the requested project-description question. The AI repeated that same question.
- Root cause: generic service-request rejection ran after a question-specific checker had accepted the answer. The checker prompt also labelled service requests unrelated without considering what question was asked. Earlier tests covered pet answers but missed this interaction; passing those tests did not establish natural conversation compliance.
- Question-specific verified answers must override generic interruption heuristics. Service descriptions answer service-description questions; dates answer timing questions. Bare yes/no must not automatically complete an open-ended description question when semantic verification is available.
- Audit all prompt layers for conflicting owner-question defaults; an exception in one layer is insufficient if another still prohibits an owner-required question.
- Required regression: run the exact repeated-description reply through generateSalesReply with the semantic checker enabled; assert the answer persists, the next required question appears, and remaining unanswered questions still prevent handoff. Also test unrelated replies, explicit refusals, timing answers, and bare acknowledgements against their actual question.
- Preserve every previous regression assertion. Document new failures here and exercise the conflicting paths together, rather than checking only prompt text or helpers in isolation.
- Mocked checker success is insufficient: run the description loop against the deployed API. Narrow explicit service descriptions and refusals must remain answerable during checker failure; unrelated questions must still block handoff.
- Complete conversation coverage in `scripts/test-owner-pricing-regression.ts` replays the in-repo sink/emergency lines and the charger-description lines from the first customer message through name, phone, and address, then the owner-question answer. An explicit description or a single either/or selection still counts when the checker fails. A phone-only reply, a bare price question, or both options with no choice stays unanswered even if a checker would accept it. Compound clauses can answer more than one required question in the same turn. Stored answers are not asked again.
- The same suite replays owner question `Is this an emergency?` and customer reply `This is an emergency.` after name, phone, and address, including when the checker returns false or throws. The answer is stored. An uncertain reply such as `I'm not sure if this is an emergency.` gets a specific clarification and does not repeat the original question. Mentioning one either/or option inside a question or an uncertain statement does not select it, even if the checker would accept that reply. Contact fields stay, and handoff stays unsent while another required question remains.
- The same suite keeps that exact emergency reply when it is one clear sentence inside a longer compound reply, stores a full either/or alternative such as `scheduled service tomorrow`, and rejects an out-of-range ordinal such as `The third one.` on a two-choice question. Under checker failure each of those replies is stored or answered with a specific clarification. The original question is not repeated.
- Under checker failure, `Is this an emergency that needs immediate attention, or can we schedule a convenient time for a service visit?` followed by `yes. My kitchen sink is clogged and I can't use it.` records a supported answer or asks a specific clarification and does not repeat that question. `Do you have dogs at the property?` followed by `No. Is your property insured?` keeps `No` and answers insurance from saved facts, or says the information is absent. Contacts stay, another owner question stays outstanding, and handoff stays unsent.
- Ambiguous `Yes` does not select an either/or alternative because that alternative is a longer phrase. Compound negatives such as `No, we don't.`, `No; we do not.`, `No — we don't.`, `No: we don't.`, and `We don’t have dogs.` stay recorded. A business-fact reply must cover the complete question; one shared keyword such as protective covers or insurance is not enough to answer a different question.
- A relevant FAQ supplies its saved answer, including a short answer such as `Yes.` The FAQ question itself is never returned as the factual answer.
- The complete website-derived profile, after the saved Peter additions and the targeted approval correction, is the profile used for one `generateSalesReply` conversation. Website identity, services, FAQs, hours, and accumulated instructions stay in place. An explicit emergency still asks for the name and may include the saved business phone. A visiting-fee question confirms the saved fee and waiver and does not turn that fee into the project total. `No. Is there a security system?` keeps the dogs answer and answers the security question from saved facts, including when no further owner question remains.
- Website-generated discovery questions are not a handoff gate. Explicit Peter questions remain required, including the visiting-fee terms and whether dogs are present and can be secured during the visit. Website facts stay. The reported sink sequence is `my kitchen sink is clogged`, `TRE`, `2145550101`, `1500 Marilla St, Dallas TX 75201`, then `Are you calling about an emergency right now or scheduling a non-urgent service?`, then `Its and emergency`. That reply records the emergency option and does not repeat the question. `This is a non-emergency` records the non-urgent option and does not select emergency.
- An owner instruction with more than one interrogative part keeps each part’s answer separately. A partial reply stays recorded, and the next question asks only for the parts still missing. The regression uses the saved compound question wording from the demo fixture.
- A saved profile that has no `ownerLeadQuestions` field is reloaded from its recorded configuration history. Website-generated questions in that history are not forced. Owner questions recorded in that history stay required. A lead question with no recorded origin stays required. A saved profile with neither the field nor history still requires every lead question. The chat engine does not special-case a business or an emergency phrase. The saved `dallasplumbing-26c9ac5c` demo is updated only by `scripts/migrations/dallasplumbing-26c9ac5c-owner-questions.ts`, which records that profile’s fee-confirmation and dog/security questions as owner-required and removes the generated instruction to begin by checking emergency status. Website facts, waiver terms, and the saved pet instruction stay.

Affected categories: A (saved configuration and cross-browser identity), B (sticky qualification state), C (required owner questions before handoff), D (answers in existing business alerts), G (deterministic closure and safe response fallbacks). E, F and H remain preserve-only.

- Peter additions accumulate; no small owner-instruction cap. Corrections remove exact targeted old values and retain unrelated rules. Invalid field shapes cannot be saved.
- Existing personalised chat and inactivity requests load the current saved profile; stale onboarding saves cannot erase or revive owner rules. Durable updates compare the database version; concurrent changes must return a conflict rather than silently overwrite.
- Core contact order remains name → phone → service address. Owner-required questions follow contact capture, one at a time, and block final/inactivity handoff until answered or explicitly declined. A qualification answer is not appointment agreement. Direct pricing interruptions are answered first and cannot falsely complete a qualification question.
- Visit/diagnostic/call-out fees never answer the total service/project price. Preserve verified fee and waiver terms separately, explain relevant price drivers without invented amounts, and address repeated total-price questions directly.
- Invalid model price answers retry once, then use a scoped fallback. A model/checker error must not bypass required questions or expose an invalid answer.
- Additional required coverage: `npm.cmd run test:owner-pricing-regression` and `npm.cmd run test:owner-profile-update`. Keep every earlier test and assertion intact.

Preserve all existing chat functionality, business logic, recipient routing, after() background delivery, Twilio, and ElevenLabs behavior unless the approved change explicitly requires it.

When fixing one failure, preserve every other category:

- Demo identity and persistence
- Lead state / sticky fields
- Handoff readiness and truthful customer wording
- Email/SMS routing, content, idempotency, and background delivery
- Voice behavior and ElevenLabs/Twilio safety
- Mobile layout, colour contrast, and transcript scrolling
- Performance and PII-safe logs
- Public legal/contact pages

## 1 October owner-question repair verification

- Required question origin is business configuration, not a business-name or question-wording exception in the chat engine. Existing unclassified profiles require reviewed migration; never invent historical origin.
- Compound answers retain independently answered parts. Verify the actual saved wording, short presence answers, modal capability answers, negative existence with pronoun-dependent followups, and independent compound questions.
- Semantic checking must recognize the pending part of a required instruction. Deterministic explicit answers survive checker rejection or outage.
- Owner-requested classification selects exact existing question strings and preserves discovery questions and other website facts. Unknown questions are rejected.
- Independent check: all six required suites and production build passed. Exact saved Dallas Plumbing profile replayed locally after reviewed configuration migration, with contact order and fee waiver preserved. Live verification is still required before calling production repaired.

## 26 November 2026 — recurring lead-capture and release failures

This is the current incident record and prevention checklist. Add each newly confirmed failure here with its observed behavior, root cause, code or operational correction, and a regression that fails before the fix. Do not label an incident resolved based only on a code review: record the test command or live evidence that verifies it.

| Observed failure | Root cause / correction | Prevention guard |
|---|---|---|
| Customer gave solar cost/benefit/savings questions after the bot had asked for a name; some turns repeated the name prompt or answered only part of a compound question. | The answer-first controller must treat a substantive question as the current objective and answer each part before resuming lead capture. The tested staging flow now does this. | `testSolarQuestionBeforeLeadCapture` asserts both cost/benefit and savings phrasing remain `ANSWER` and do not fall back to the deterministic name prompt. Keep the compound-answer prompt constraint. |
| Solar installation phrasing such as “solar installation” or “I want solar panels installed” received generic consultation price drivers. | The shared aspirational-intent matcher missed noun and passive/continuous forms. Recognize the general variants `install`, `installation`, `installed`, and `installing`; do not special-case solar. | `testSolarQuestionBeforeLeadCapture` and `testCrossBusinessBallparkFollowUp` assert installation intent and profile-appropriate pricing across all seven verticals. |
| “Can you give me a ballpark figure?” after the first solar answer received a generic consultation invitation. | `messageAsksPricingOrBilling` did not recognize “ballpark,” so the deterministic price scope guard did not run on that follow-up. Add the general price-intent terms “ballpark,” “rough/approximate price, cost, estimate,” and “price/cost estimate”; preserve the sticky project need. | Solar regression asserts the exact ballpark wording maps to `HANDLE_PRICE_OBJECTION` and returns project-specific cost drivers, not generic consultation copy. |
| Pest-control lead wording “I found termites in my home and need treatment” fell into generic consultation price copy during cross-business testing. | The shared problem classifier recognized some pest nouns only in singular form and did not recognize treatment wording, so this common plural request was classified as CONSULTATION. Add general plural forms and treatment cues in the shared need classifier; do not branch on business name. | `testCrossBusinessBallparkFollowUp` asserts the termite request classifies as PROBLEM and receives site/treatment price drivers, with no invented amount. |
| Cross-business coverage gap: the new ballpark-price guard had only been exercised with the solar fixture, so the shared flow was not verified across other business profiles. | The guard and response builder are shared conversation logic; do not add vertical-specific pricing triggers or templates. Add table-driven coverage that uses each business profile's own needs and service facts. | `testCrossBusinessBallparkFollowUp` runs ballpark, rough-cost, and approximate-price follow-ups across plumbing, HVAC, roofing, pest control, electrical, landscaping, and solar. It checks answer-first routing, relevant cost drivers, no invented amounts, and no solar copy leakage. |
| A prospective solar customer asked for price/savings before giving contact details; the response asked an unrelated product question, then repeated that same question after a ballpark follow-up. An earlier unanswered name/phone/address prompt could also stop being captured after the price interruption. | The pre-contact pricing path accepted arbitrary model follow-up questions, and state extraction trusted only the immediately previous assistant turn for an unanswered name/address request. Normalize pre-contact pricing replies to keep the useful answer, remove trailing discovery/booking questions, and ask only the next missing contact field once. Keep unanswered field prompts pending across answer-first turns. | Cross-business regression covers all seven verticals: first price question asks the next missing contact field, later price questions do not repeat it, and the pending name, phone, and address are captured after an interruption. Run the exact solar cost/savings/ballpark transcript against the deployed API before release. |
| An owner’s number entered to correct lead-alert SMS could be treated as a free-form Peter instruction, resulting in “I couldn't update the Sales Employee just now.” | Parse a standalone valid email or phone as a destination update before submitting free-form instructions. Keep natural-language instructions on the owner-instruction path. | Unit regression covers bare international phone, bare email, and a sentence containing a number; only standalone values are parsed as recipient corrections. Profile persistence and per-business routing tests remain required. |
| Lead-alert setup displayed an internal SMS destination the owner did not provide, or both alerts could fail when destinations were placeholders/unconfigured. | Never treat example/fallback destinations as a business’s saved recipients. Require valid business email and internal phone; persist and reload the owner’s values before confirming setup. | `testPerBusinessLeadAlerts` checks recipient validation, persistence, reload, tenant isolation, and routing. Live alert success may only be claimed after provider logs confirm each channel. |
| Customer was told the request had been sent although alert delivery failed (or delivery could not be verified). | Distinguish queued, sent, and failed delivery; preserve the lead and report truthfully. Provider outages cannot be fixed by pretending success. | Handoff tests assert customer copy matches delivery state, idempotency, and no duplicate alerts. Operational verification checks SMTP/Twilio logs and never logs lead PII. |
| Staging, preview, and production were assumed to be the same despite different branch aliases and environment variables. | Verify the deployment’s source commit, branch, alias, and required variable names/scopes before testing or release. Keep Production-only secrets scoped to Production unless the owner explicitly authorizes expansion. | Release checklist records commit and deployment IDs for each environment; smoke tests are run against the actual assigned alias. A preview result is not presented as production evidence. |
| Candidate preview chat returned “I’m having trouble responding right now” because its branch did not have the required `OPENAI_API_KEY` environment entry. | The preview was built from the correct source, but its branch environment was incomplete; missing runtime configuration must not be mistaken for a code fix or silently supplied from Production. | Before live smoke tests, verify required variable names and targets for the exact preview branch. Use the approved isolated staging configuration; never copy Production secrets into another environment without explicit authorization. |
| Production captured a website lead's name, phone, and address, then continued discovery and asked for a preferred appointment time; no alert was sent until time/agreement conditions were met. | The website handoff was coupled to scheduling despite the product only having lead-alert delivery. Send the first alert as soon as core contact fields and a concrete need are saved. Do not wait for scheduling or extra owner questions; continue helpful, brief qualification after the alert and never send duplicates. Do not claim calendar/booking capability or provide a full DIY repair. Answer direct questions first, then ask at most one useful profile-aware diagnostic question (for example, fully blocked vs. slow drainage for a clogged sink). Keep inbound voice handoff behavior unchanged. | `test:demo-chat` and `test:owner-pricing-regression` cover capture without scheduling across seven profiles, gating for missing/paused core fields, owner questions continuing after the first alert, idempotency, direct answers, and temporary expert diagnostic guidance. Verify a production synthetic lead reaches the configured alert destination before release. |
| Production public showcase collected a synthetic lead, but handoff failed because the bundled test profile has no business-specific alert recipients and no showcase inbox fallback was configured. | Configure a PulseTech-owned showcase inbox through `LEAD_NOTIFICATION_EMAIL`. For the shared showcase only, permit email-only delivery without an SMS destination; never invent a phone number or reuse one from another business. Real business profiles still require their own email and internal mobile number. | `test:demo-chat` verifies showcase email-only routing and confirms no SMS is attempted without a verified destination. Customer profiles without both owner-provided destinations remain blocked in setup. Production smoke must confirm inbox delivery. |
| Website pricing and payment validation can drift from the live payment provider catalog, causing customers to see one price while billing webhooks reject the real charge. | Update the website, account checkout copy, provider amount validation, database billing procedure, provider product catalog, and payment operations record as one pricing release. For the approved plan, setup and first month are `$497` each (`99400` USD cents combined), with renewals at `$497` (`49700` cents). | `test:dodo-billing`, `test:client-billing`, and `test:client-billing-sql` must accept the new amounts and reject below-threshold charges. Before production promotion, independently verify the Dodo Live product prices, Vercel production product IDs, and applied production database procedure. |
| Vercel project inspection returned 403 while using a team slug where an internal team ID was required. | Resolve the account/team identifier from Vercel’s team/project listing and use the expected identifier for that endpoint. | Retry after reading project/team metadata; do not interpret a 403 as an application failure or guess at the team. |
| A blank page or “couldn’t load” preview was mistaken for an application regression. | Confirm deployment status and runtime/build logs before attributing a browser load failure to chat code. | Record the deployment’s READY/ERROR state and check build/runtime logs before changing product code. |

### Self-healing and safe failure policy

- Known input-shape failures should resolve deterministically: validate an email or E.164/normalizable number, keep invalid values in the correct setup step, and recognize standalone recipient corrections before routing owner feedback.
- Known response-generation failures should use the existing validated fallback once; never repeat a lead question when the user asked a substantive question, and never drop already captured lead fields.
- Provider delivery failures must preserve the lead, avoid duplicate sends, and show a truthful failure message. Retry only when the delivery path is idempotent and the retry is bounded. Do not invent recipients or claim delivery.
- A saved-profile write failure must not report success. Keep the current conversation state and offer a clear retry path; refresh/reload verification is required for persistence claims.
- Unknown failures cannot be guaranteed to self-correct. Capture a privacy-safe diagnostic, identify the failing layer, and prevent promotion until the regression is understood. Never log names, phone numbers, addresses, alert-recipient values, or secrets.

### Release gate for this incident family

Before promoting a chat/lead change, run all of the following from the candidate commit and retain the result with the deployment record:

```text
npm run test:demo-chat
npm run test:handoff-timing
npm run test:owner-pricing-regression
npm run test:owner-profile-update
npm run test:inbound-voice
npm run test:voice-demo
npm run build
```

Also run repository account/billing suites when the change touches those areas. Verify the exact chat scenarios recorded above, owner-provided alert email and SMS (including correction), per-business routing, failed delivery copy, phone/address collection order, and that answer-first follow-ups do not ask for name/phone/address twice. Do not send test calls/SMS to customer contacts. Confirm public UI changes are intentional and preserve the currently deployed production presentation. The checklist is a regression control, not a promise that software can fix every novel defect without investigation.
