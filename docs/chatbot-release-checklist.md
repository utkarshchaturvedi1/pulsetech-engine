# Chatbot release checklist

Use this before promoting a chatbot change to production. Keep the five reference businesses from the customer test document in the staging matrix: Autrey's Plumbing, M.B. Kiser HVAC, Dallas Electric, E&E Outdoor Creations, and Smile Pest Control.

## Automated gate

- [ ] Chatbot quality gate is green for the exact commit being considered.
- [ ] Business-specific response, contact capture, saved conversation state, photo limits, and voice handoff regressions pass.
- [ ] Production build and TypeScript checks pass.

## Staging conversation matrix

For each reference business, use a fresh conversation and confirm:

- [ ] A supported request gets a short, relevant answer grounded in that business profile.
- [ ] An unsupported service is declined politely without importing another business's services, prices, or claims.
- [ ] A price question is answered from that business's configured pricing; missing pricing is not invented.
- [ ] Unverified free/paid/discount/waiver claims are removed while retaining any verified part of the answer.
- [ ] Performance claims are conditional unless the active business profile verifies the promised result for that customer's situation.
- [ ] An objection or follow-up question is answered before the bot resumes collecting details.
- [ ] Name, phone, address, and timing are retained when supplied together or across turns; already captured details are not requested again.
- [ ] A standalone name or phone answer advances directly to the next missing field; when the same message also includes a question or objection, answer that content without losing the contact detail.
- [ ] Names with punctuation in the original message still appear cleanly in acknowledgements and the final close.
- [ ] The close says the team will follow up; it does not claim an appointment is booked unless a real booking integration confirms it.
- [ ] One completed inquiry creates one lead handoff, not repeated requests or duplicate notifications.
- [ ] Email and SMS delivery results are checked in provider/application logs. A queued/API success result is not described as proof of inbox or handset receipt.
- [ ] A transient failure is recovered once only when retrying cannot duplicate a lead handoff; persistent failure remains visible and is logged.
- [ ] Force an AI-provider timeout and a saved-profile lookup failure; each fallback must address the latest question, avoid unsupported claims, and clear the typing state within its bounded timeout.

## Release and observation

- [ ] Confirm staging deployment SHA matches the tested commit and the five staging demo routes load.
- [ ] Check runtime errors and lead-delivery failures after staging tests.
- [ ] Promote only the exact passing commit. Keep production on the previous deployment until this gate passes.
- [ ] After promotion, run one safe production smoke conversation without submitting fake customer contact details or triggering test notifications.
- [ ] Check runtime errors and real provider delivery status after the smoke check; roll back the deployment if the release introduces a regression.

## Known test pitfalls

- Use a plausible test name. Synthetic strings such as "Staging E2E" can be rejected by name extraction and create a false failure.
- Start each business test in a fresh conversation so prior messages and captured fields do not affect the result.
- Verify the active profile and alert destinations before the handoff test. Same website text does not imply the same business profile or alert configuration.
- Test the staging alias after deployment; an individual preview URL being ready does not prove the staging alias points to it.
- Test output guards on generated replies and on provider-error fallbacks; prompt instructions alone do not prevent unsupported claims or contact-only deflections.
- Treat SMTP/Twilio API success as provider acceptance. Confirm inbox/handset delivery in the providers' logs before marking delivery fully verified.
