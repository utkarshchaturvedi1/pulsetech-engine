import { config } from "dotenv";
config({ path: ".env.local" });

import { cloneBusinessProfile } from "../src/lib/businessProfile";
import {
  buildConversationInitiationResponse,
} from "../src/lib/inboundVoice";
import {
  mergeOwnerProfileUpdate,
  summarizeOwnerProfileChanges,
} from "../src/lib/ownerProfileUpdate";
import { formatBusinessKnowledge } from "../src/lib/businessKnowledge";
import {
  applyOwnerPatchToSharedProfile,
  commitSharedProfile,
  loadSharedProfile,
} from "../src/lib/sharedProfileStore";
import type { BusinessProfile } from "../src/types/business";
import { promises as fs } from "fs";
import path from "path";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function fixture(name: string, website: string): BusinessProfile {
  return {
    website,
    businessName: name,
    tagline: "",
    logo: "",
    primaryColor: "",
    secondaryColor: "",
    phone: "5125550100",
    email: "hello@example.test",
    address: "",
    services: ["Solar installation"],
    serviceAreas: ["Austin"],
    faqs: [],
    leadQuestions: ["What is your name?"],
    systemPrompt: "Represent this business only.",
    isTestData: true,
  };
}

async function main() {
  const previousSupabase = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const stamp = String(Date.now());
  const idA = "test-owner-a-" + stamp;
  const idB = "test-owner-b-" + stamp;
  const rule = "Visit charge is $89 unless the customer approves the work.";

  await commitSharedProfile(idA, fixture("Client A Solar", "https://client-a.test"));
  await commitSharedProfile(idB, fixture("Client B Roofing", "https://client-b.test"));

  try {
    const commit = await applyOwnerPatchToSharedProfile(idA, {
      pricingRules: rule,
      businessHours: "Mon-Fri 8am-6pm",
      tone: "Warm and direct",
      leadNotificationEmail: "alerts-a@example.test",
    });
    const shared = await loadSharedProfile(idA);
    assert(Boolean(shared), "client A must remain loadable");
    assert(
      shared?.profile.pricingRules === rule,
      "owner update must change the shared profile"
    );
    assert(
      shared?.profile.businessHours === "Mon-Fri 8am-6pm",
      "hours must persist on the shared profile"
    );
    assert(commit.demo.id === idA, "commit must stay on the requested demo id");

    const knowledge = formatBusinessKnowledge(shared!.profile);
    assert(
      knowledge.includes(rule),
      "website chat prompt must receive the updated pricing rule"
    );
    assert(
      knowledge.includes("Mon-Fri 8am-6pm"),
      "website chat prompt must receive updated hours"
    );

    const phone = buildConversationInitiationResponse({
      ok: true,
      calledNumber: "+15557654321",
      demoId: idA,
      demo: shared!,
    });
    assert(
      phone.conversation_config_override.agent.prompt.prompt.includes(rule),
      "phone initiation payload must receive the updated pricing rule"
    );
    assert(
      phone.dynamic_variables.business_rules.includes(rule),
      "phone dynamic variables must include the updated rule"
    );
    assert(
      phone.dynamic_variables.tone === "Warm and direct",
      "phone tone must come from the shared profile"
    );

    const other = await loadSharedProfile(idB);
    assert(Boolean(other), "client B must remain loadable");
    assert(
      other?.profile.businessName === "Client B Roofing",
      "client B name must be unchanged"
    );
    assert(
      other?.profile.pricingRules !== rule,
      "one demo must not update another profile"
    );

    const unchangedB = await applyOwnerPatchToSharedProfile(idA, {
      agentName: "Sarah",
    });
    const afterB = await loadSharedProfile(idB);
    assert(
      afterB?.profile.agentName !== "Sarah",
      "agent name on A must not leak to B"
    );
    assert(unchangedB.demo.profile.agentName === "Sarah", "A received agent name");

    const before = cloneBusinessProfile(fixture("Client A Solar", "https://client-a.test"));
    const merged = mergeOwnerProfileUpdate(before, { pricingRules: rule });
    const changes = summarizeOwnerProfileChanges(before, merged);
    assert(changes.includes("pricing / visit-charge rules"), "change summary");
    assert(
      !formatBusinessKnowledge(before).includes(rule),
      "unpatched profile must not invent the pricing rule"
    );

    console.log("PASS — owner update changes the shared profile");
    console.log("PASS — website chat prompt receives the updated rule");
    console.log("PASS — phone initiation payload receives the updated rule");
    console.log("PASS — one demo/client cannot update another profile");
  } finally {
    const dir = path.join(process.cwd(), ".data", "demos");
    await fs.rm(path.join(dir, idA + ".json"), { force: true });
    await fs.rm(path.join(dir, idB + ".json"), { force: true });
    process.env.SUPABASE_SERVICE_ROLE_KEY = previousSupabase;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
