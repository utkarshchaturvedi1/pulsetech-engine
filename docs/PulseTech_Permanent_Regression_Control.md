# PulseTech Permanent Regression Control

This file is the in-repo source of truth for historical PulseTech failures and mandatory regression rules. Do not weaken, skip, or replace earlier rules when adding new ones.

**Provenance:** the original Word document (`PulseTech_Permanent_Regression_Control.docx`) was not found. This Markdown Guardian was reconstructed from the complete 19 Sep 2026 A–H Guardian report and later live-production failures. It is now the canonical in-repo source of truth.

## Mandatory rule for every change

Before any PulseTech product change, Cursor must read this file, identify affected rules, add regression coverage for any gap, run every required test, and report results before commit/push.

Do not redesign the UI, change landing-page content, change business logic deliberately, or change voice/alert providers unless a test proves it is necessary. Do not hardcode a business, service, customer name, or one test sentence as product behavior. Do not remove, weaken, skip, or replace earlier regression assertions. Do not commit or push unless the human explicitly asks after the required tests and report.

Preserve all existing chat functionality, business logic, recipient routing, after() background delivery, Twilio, and ElevenLabs behavior unless the approved change explicitly requires it.

Lead capture must not turn the AI Sales Employee into a robotic form. After name + customer phone + service address are secured, the conversation must return to helpful, warm, sales-oriented service guidance. Direct customer questions—especially price—must be answered first, truthfully and without invented facts. Do not promise an alert/team contact before a ready handoff has actually queued.

**Permanent conversation-quality rule:** Lead protection must never turn the AI Sales Employee into a cold form. Before contact capture, acknowledge the customer’s stated situation with intent-appropriate emotion (empathy for problems, enthusiasm for projects, excitement for celebrations, confident help for consultations)—never a universal “I’m sorry” template. After required contact details are secured, provide a helpful, profile-aware explanation and ask for agreement before asking preferred time. Do not repeat the customer’s name mechanically.

---

## Canonical lead sequence (website chat and inbound voice)

Protect the opportunity first. A genuine high-intent need must not be lost to HVAC-style discovery, troubleshooting, or a premature business-phone handoff.

**Capture order (only this order):**

1. Need already known (customer stated the service need)
2. Name
3. Customer phone (the visitor/caller’s number — never the scraped business number in place of this field)
4. Service address (where relevant)
5. Details / price (only after the three lead fields above, and only as needed; answer a direct customer question when asked)
6. Helpful, profile-aware next-step explanation
7. Explicit agreement to arrange that next step
8. Preferred day/time
9. Exactly one truthful handoff (email + SMS to that business’s recipients)

**Combined request exception:** After name, customer phone, and service address are secured, an explicit combined request such as “Can you come tomorrow morning?” counts as agreement plus preferred time and may queue exactly one handoff.

**Hard bans on this path:**

- No “recorded”, “shared”, “I’ll alert,” “team will contact,” or equivalent unless a handoff is actually queued or scheduled. SENT vs QUEUED wording must stay truthful. Never imply the request was already delivered when status is only queued.
- No business phone unless the visitor explicitly asks for the number, explicitly states emergency / danger / immediate help, or delivery **failed**. Normal success close must never expose a scraped business phone or say “if you prefer to call”.
- No preferred-time question before name, customer phone, and service address are captured.
- Missing preferred time → queue **no** handoff; ask **once** for day/time.
- Preferred time is never described as booked or confirmed.
- Failed delivery: tell them to contact the business phone or email; never claim the team was alerted. Never expose internal delivery status to the customer.
- On failed delivery, direct the visitor to contact the business by phone/email if appropriate; never expose internal delivery status.

Before name, customer phone, and service address are secured, do not diagnose, interrogate, or sell the service first.

High-intent is a sales safety net, not a technician interrogation. Do not diagnose, ask residential vs commercial, or troubleshoot **before** name, customer phone, and service address. Ask one field at a time. After the lead is secured, continue helping.

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
- Preferred time is asked only after name, customer phone, and service address, and only after the customer has explicitly agreed to arrange the next step (unless they give an explicit combined arrange+time request such as “Can you come tomorrow morning?”).
- After those three fields, resume a human sales conversation: acknowledge the need with intent-appropriate emotion, answer questions (price first), explain the sensible next step, get agreement to arrange it, then ask preferred day/time. Do not stay in form-field mode.
- Before the name question, acknowledge the stated situation with intent-appropriate emotion. Do not use a cold “We can help with that. What’s your first name?” form. Do not use “I’m sorry” for aspirational projects, celebrations, or neutral consultations.
- After the three contact fields, give a helpful profile-aware next-step explanation and get explicit agreement to arrange it before asking preferred time. Do not repeat the customer’s name mechanically.

### C. Handoff and customer wording

- Required details plus agreement must queue exactly one handoff.
- Required details include name, customer phone, service address, preferred time, and explicit agreement to arrange (or an explicit combined arrange+time request after contacts are secured), following the canonical sequence above.
- Missing preferred time must queue none and ask only once for day/time.
- No response may say “recorded”, “shared”, “I’ll alert,” “team will contact,” or imply alert delivery unless handoff is actually queued/scheduled.
- Use “shared with the team” only when delivery status is SENT. QUEUED wording must never imply completed delivery.
- On failed delivery, direct the visitor to contact the business by phone/email if appropriate; never expose internal delivery status.
- Normal success close must never expose scraped business phone or say “if you prefer to call”.
- Business phone is allowed only if the visitor explicitly asks, states emergency/danger/immediate help, or delivery failed.
- Preferred time must never be described as booked.
- Email and SMS must include primary need and preferred time.

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
