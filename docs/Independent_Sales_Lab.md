# Independent sales conversation experiment

Page: `/sales-lab`. Development branch: `experiment/independent-sales-lab`.

This experiment has its own UI, Peter configuration agent, conversation prompt, and API routes. It does not import the existing sales controller, owner-question engine, voice system, or notification system. The six rules requested for the experiment are in `src/lib/salesLab/policy.ts`.

## Runtime configuration

Reuse the existing server-side `OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in the test deployment. Configure `SALES_LAB_MODEL` to an available OpenAI Responses model. Configure a random, private `SALES_LAB_OWNER_KEY` of at least 32 characters for Peter. Never put a secret in a public environment variable. This page fails closed when configuration is missing.

No schema migration is required: it uses separate `saleslab-<random UUID>` rows in the existing `business_profiles` table, marked `independent-sales-lab-v1`. All reads and writes require this ID format; reads also require the kind marker. Existing records are never edited. No real customer data should be entered for this experiment. Customer transcripts remain in browser memory and are submitted as context; model storage is disabled. The unguessable customer test link grants conversation access and must be treated as private.

## Test flow

1. Open `/sales-lab`, enter the owner key, and create a test business.
2. Tell Peter the services, pricing, and rules. Verify the saved active instructions.
3. Test the customer conversation, or open the customer-only view.
4. Ask Peter to change a price, exclude a service, or stop asking a question. Verify unrelated instructions remain.
5. Continue the existing conversation. The next reply reloads the latest saved instructions, including revocations. An in-flight reply is rejected if Peter saved a newer version while it was generating.

Peter accepts natural-language additions, targeted revisions, and removals. Ambiguous requests ask for clarification without writing. The visible active-instruction list also allows direct revocation. Saves use optimistic concurrency to prevent overwriting another window's changes.

The page does not book confirmed appointments, take payments, or connect voice. It captures service leads through one model tool call, saves a separate `saleslab-lead-<hash>` row in the existing table, and exposes the inbox only through Peter's authenticated owner route. Contact fields come from customer messages. A stable per-chat ID prevents replay from duplicating a lead or sending a second alert. Successful submission closes with “I’ve passed your details to our team. They’ll contact you ASAP to help get this sorted. You’ve come to the right team—we’ll take it from here.” The customer can continue typing and uploading photos afterward. Follow-up replies answer only the latest question, stay within saved business services, and have no lead-submission tool. New chat starts a separate request. Corrections after submission are not automatically rewritten into the original lead; the model must not claim otherwise.

Peter's primary screen is now a simple conversation. Business settings, saved instructions and the owner lead inbox are expandable sections. The owner password remains required to change business information or read private leads/photos.

Live verification for this release: a sample PNG uploaded successfully and displayed a preview. A complete plumbing lead with the photo submitted successfully, and the message input remained enabled after the closing reply. An electrical-panel follow-up received only a brief plumbing-scope refusal, with no new question or repeated closing pitch. Owner photo access and association with the lead were tested with mocked routes; no new owner-password handoff was requested for live owner-inbox inspection.

## Photo uploads

Customers can attach up to three JPG, PNG or WebP photos per conversation, each stored photo no larger than 2 MiB. Larger source photos up to 15 MiB are reduced in the browser to at most 1600 pixels on the longest edge before upload. The upload route checks size, MIME type and file signature, resolves the saved lab business, and associates each photo with both business and conversation. The model receives validated server-loaded image data rather than arbitrary user URLs. Image content cannot change business instructions and must not become a technical repair guide. Owners view photos from their lead inbox through the authenticated Peter endpoint. Photos added after submission remain attached to the same conversation's lead.

For this small experiment, image data lives in separate `business_profiles` JSON rows marked `independent-sales-lab-photo-v1`, using namespaced IDs. No new storage bucket, migration, or credentials are required. This bounded prototype storage should be replaced with appropriate private object storage before production scale. Photos uploaded to an abandoned conversation remain stored and are not shown in the lead inbox until that conversation submits a lead. No retention cleanup is implemented in this experiment.

Peter can set `leadAlertEmail` only when the owner explicitly requests a lead-alert recipient; a general business email is not an alert recipient. Email notifications require the existing `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` to be configured on this experiment branch. Without them, requests still reach Peter's durable inbox and display email status `not_configured`. SMTP failures display `failed`; neither failure nor missing configuration is reported as email delivery. No messages are sent to the customer. The one-time mail attempt is separate from appointment confirmation; the owner's inbox remains available if email fails. Failed mail is not automatically retried, to avoid duplicate notifications.

Business pricing is grounded by model instructions; output contact detection adds a basic guard but is not a proof against every possible spelling or obfuscation. Human-quality conversation, price accuracy, prompt-injection resistance, and revocation behavior require live model testing before broader use. This is an isolated private experiment, not a production release.

## Checks

`node --import <installed-tsx>/dist/loader.mjs scripts/test-sales-lab.ts` runs mocked route and configuration tests. Existing regression suites remain unchanged. Run their six scripts plus `npm run build` before publishing, per the permanent regression control document.

## Verification — 23 October 2026

Live preview follow-up: owner authentication and creation of a separate database-backed test business passed. Peter saved instructions, changed a fee, removed a required question while retaining unrelated facts, and subsequently revoked the fee. The customer chat used the changed amount and withheld explicitly requested business phone/email. A live defect was found: Peter inferred an unstated same-visit waiver restriction, and a later sales reply retained it from old assistant history after correction. The repair tightens Peter's faithful capture requirement and tags assistant replies with the saved configuration version; older assistant turns are excluded from model context after any configuration change, while customer history is retained. A regression reproduces the obsolete waiver wording and verifies its removal from the next model input.

The repaired preview was tested live with a fee added at $45, quoted in an existing customer conversation, then revoked through Peter. The next reply in that same conversation refused to confirm the obsolete amount. A customer attempt to override pricing and obtain business phone/email was rejected. Fresh-page access loaded the same saved configuration. Responses were too verbose and explained internal configuration, so the experiment's conversation instruction was refined to answer the latest question in one to three plain sentences without bullet lists or internal-rule explanations. This refinement affects only the experiment.

- New mocked experiment tests: PASS (Peter additions, targeted revisions, exclusions, persistence requests, owner authorization, existing-record isolation, contact blocking, stale-version rejection, in-flight revocation).
- Existing demo-chat, handoff-timing, inbound-voice, voice-demo, owner-profile-update and owner-pricing-regression suites: all PASS. The environment forbids the tsx CLI's IPC socket; the same scripts ran successfully through Node's tsx import loader instead.
- TypeScript: PASS.
- Production build: PASS with an explicit build-only placeholder `OPENAI_API_KEY`. Without it, the unchanged baseline `/api/update-profile` route fails during build because it constructs an OpenAI client at import time. No real OpenAI request was made by the build.
- Existing tracked source files and all prior assertions: unchanged.
- Live model conversation quality, real database persistence, browser visual QA, and hosted preview: not yet verified. No production deployment or settings change, no real customer writes, and no commit/push performed.
