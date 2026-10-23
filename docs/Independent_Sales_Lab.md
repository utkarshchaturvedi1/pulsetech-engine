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

The page does not arrange real visits, send alerts, take payments, or connect voice. It must not claim those actions occurred. Business pricing is grounded by model instructions; output contact detection adds a basic guard but is not a proof against every possible spelling or obfuscation. Human-quality conversation, price accuracy, prompt-injection resistance, and revocation behavior require live model testing before broader use. This is an isolated private experiment, not a production release.

## Checks

`node --import <installed-tsx>/dist/loader.mjs scripts/test-sales-lab.ts` runs mocked route and configuration tests. Existing regression suites remain unchanged. Run their six scripts plus `npm run build` before publishing, per the permanent regression control document.

## Verification — 23 October 2026

Live preview follow-up: owner authentication and creation of a separate database-backed test business passed. Peter saved instructions, changed a fee, removed a required question while retaining unrelated facts, and subsequently revoked the fee. The customer chat used the changed amount and withheld explicitly requested business phone/email. A live defect was found: Peter inferred an unstated same-visit waiver restriction, and a later sales reply retained it from old assistant history after correction. The repair tightens Peter's faithful capture requirement and tags assistant replies with the saved configuration version; older assistant turns are excluded from model context after any configuration change, while customer history is retained. A regression reproduces the obsolete waiver wording and verifies its removal from the next model input.

- New mocked experiment tests: PASS (Peter additions, targeted revisions, exclusions, persistence requests, owner authorization, existing-record isolation, contact blocking, stale-version rejection, in-flight revocation).
- Existing demo-chat, handoff-timing, inbound-voice, voice-demo, owner-profile-update and owner-pricing-regression suites: all PASS. The environment forbids the tsx CLI's IPC socket; the same scripts ran successfully through Node's tsx import loader instead.
- TypeScript: PASS.
- Production build: PASS with an explicit build-only placeholder `OPENAI_API_KEY`. Without it, the unchanged baseline `/api/update-profile` route fails during build because it constructs an OpenAI client at import time. No real OpenAI request was made by the build.
- Existing tracked source files and all prior assertions: unchanged.
- Live model conversation quality, real database persistence, browser visual QA, and hosted preview: not yet verified. No production deployment or settings change, no real customer writes, and no commit/push performed.
