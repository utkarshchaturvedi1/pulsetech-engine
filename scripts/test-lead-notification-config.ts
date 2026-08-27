import { config } from "dotenv";
config({ path: ".env.local" });
process.env.LEAD_HANDOFF_DRY_RUN = "true";
process.env.LEAD_NOTIFICATION_EMAIL = "pulsetechlabs1@gmail.com";

import type { BusinessProfile } from "../src/types/business";
import { cloneBusinessProfile, createBusinessProfile, customerFacingBusinessProfile } from "../src/lib/businessProfile";
import { applyOwnerFeedbackToProfile } from "../src/lib/updateBusinessProfile";
import { resolveLeadNotificationRecipient } from "../src/lib/leadHandoff";
import {
  LEAD_NOTIFICATION_EMAIL_QUESTION,
  handleLeadNotificationOwnerText,
  leadNotificationEmailPrompt,
} from "../src/lib/leadNotificationConfig";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const base: BusinessProfile = createBusinessProfile({
  website: "https://notification-test.example",
  businessName: "Notification Test Co",
  email: "public@example.com",
  services: ["Service"],
});

const NATURAL_CAPTURES = [
  "pulsetechlabs1@gmail.com",
  "its pulsetechlabs1@gmail.com",
  "use pulsetechlabs1@gmail.com",
  "send them to pulsetechlabs1@gmail.com",
];

async function main() {
  assert(
    /\*\*Email address\*\*/.test(LEAD_NOTIFICATION_EMAIL_QUESTION),
    "question must mark Email address for bold rendering"
  );
  assert(
    /\*\*Email address\*\*/.test(leadNotificationEmailPrompt()),
    "setup prompt must bold Email address before testing invite"
  );
  assert(
    !/Your AI Sales Employee is ready/i.test(leadNotificationEmailPrompt()),
    "email prompt must come before ready/testing invite"
  );

  for (const phrase of NATURAL_CAPTURES) {
    const captured = await applyOwnerFeedbackToProfile(base, phrase);
    assert(
      captured.profile.leadNotificationEmail === "pulsetechlabs1@gmail.com",
      `capture: ${phrase}`
    );
    assert(
      captured.reply ===
        "Perfect. New lead notifications will be sent to pulsetechlabs1@gmail.com. You can change this anytime.",
      `confirmation: ${phrase}`
    );
    const again = handleLeadNotificationOwnerText(
      captured.profile.leadNotificationEmail,
      "please also mention weekend availability"
    );
    assert(again.kind === "passthrough", `no-repeat after save: ${phrase}`);
    assert(
      !/What \*\*Email address\*\* should we use/i.test(captured.reply),
      "confirmation must not re-ask"
    );
  }

  const captured = await applyOwnerFeedbackToProfile(base, "Send lead notifications to office@example.com.");
  assert(captured.profile.leadNotificationEmail === "office@example.com", "capture: valid email saved");
  assert(captured.reply === "Perfect. New lead notifications will be sent to office@example.com. You can change this anytime.", "capture: concise confirmation");

  const invalid = await applyOwnerFeedbackToProfile(base, "Send lead notifications to not-an-email.");
  assert(!invalid.profile.leadNotificationEmail, "validation: invalid value not saved");
  assert(/valid email address/i.test(invalid.reply), "validation: invalid email requested again");

  const invalidBare = await applyOwnerFeedbackToProfile(base, "not-an-email");
  assert(!invalidBare.profile.leadNotificationEmail, "validation: bare invalid not saved");
  assert(/valid email address/i.test(invalidBare.reply), "validation: bare invalid asks again");

  const changed = await applyOwnerFeedbackToProfile(captured.profile, "change it to office@example.com");
  assert(changed.profile.leadNotificationEmail === "office@example.com", "update: owner can change recipient");

  const persisted = cloneBusinessProfile(createBusinessProfile(JSON.parse(JSON.stringify(changed.profile))));
  assert(persisted.leadNotificationEmail === "office@example.com", "persistence: profile survives serialization and reload");

  const businessA = createBusinessProfile({ ...base, leadNotificationEmail: "a-owner@example.com" });
  const businessB = createBusinessProfile({ ...base, website: "https://other.example", leadNotificationEmail: "b-owner@example.com" });
  assert(resolveLeadNotificationRecipient(businessA, "production").recipient === "a-owner@example.com", "handoff: uses business A recipient");
  assert(resolveLeadNotificationRecipient(businessB, "production").recipient === "b-owner@example.com", "handoff: uses business B recipient");
  assert(resolveLeadNotificationRecipient(businessA, "production").recipient !== resolveLeadNotificationRecipient(businessB, "production").recipient, "isolation: businesses cannot cross-deliver");

  const fallback = resolveLeadNotificationRecipient(base, "development");
  assert(fallback.recipient === "pulsetechlabs1@gmail.com" && fallback.source === "development-fallback", "development: explicit fallback works");
  const missingProduction = resolveLeadNotificationRecipient(base, "production");
  assert(!missingProduction.recipient && missingProduction.source === "missing", "production: missing recipient fails safely without fallback");

  const privateProfile = createBusinessProfile({ ...base, leadNotificationEmail: "private-routing@example.com" });
  const customerFacing = customerFacingBusinessProfile(privateProfile);
  assert(!("leadNotificationEmail" in customerFacing), "privacy: customer AI knowledge excludes internal recipient");
  assert(customerFacing.email === "public@example.com", "privacy: public contact email remains separate");

  console.log("Lead notification configuration PASS — natural-language capture, no-repeat, persistence, routing isolation, fallback safety, and Customer AI privacy.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
