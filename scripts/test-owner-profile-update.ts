import { config } from "dotenv";
config({ path: ".env.local" });

import { cloneBusinessProfile } from "../src/lib/businessProfile";
import {
  buildConversationInitiationResponse,
} from "../src/lib/inboundVoice";
import {
  buildNoVisitFeeRemovalPatch,
  mergeOwnerProfileUpdate,
  summarizeOwnerProfileChanges,
} from "../src/lib/ownerProfileUpdate";
import { applyOwnerFeedbackToProfile } from "../src/lib/updateBusinessProfile";
import { formatBusinessKnowledge } from "../src/lib/businessKnowledge";
import {
  applyOwnerPatchToSharedProfile,
  commitSharedProfile,
  loadSharedProfile,
  sharedProfileFilesystem,
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

  const feeProfile = {
    ...fixture("Client A Solar", "https://client-a.test"),
    pricingRules: "Visit charge: $20, waived if the customer proceeds with our recommended services.",
    systemPrompt: "Represent this business only.\nNote: Our company charges a $20 visit charge that will be waived if the customer proceeds.\nKeep all other facts.",
    leadQuestions: [
      "Do you agree to the $20 visit charge, which is waived if you proceed?",
      "What day works for a visit?",
    ],
    ownerLeadQuestions: [
      "Do you agree to the $20 visit charge, which is waived if you proceed?",
      "What day works for a visit?",
    ],
  };
  const feeRemovalRequest = "Please remove $20 visiting charges. We have decided that we will not charge customers any visiting charges.";
  assert(buildNoVisitFeeRemovalPatch(feeProfile, "For visit") === null, "an ambiguous fragment must not change profile facts");
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const corrected = await applyOwnerFeedbackToProfile(feeProfile, feeRemovalRequest);
    const correctedPricing = corrected.profile.pricingRules || "";
    assert(correctedPricing.includes("There is no charge for site visits."), "clear visit-fee correction saves a customer-facing no-fee rule");
    assert(!/\$20|waiv/i.test(correctedPricing), "old visit-fee pricing and waiver are removed");
    assert(!/\$20|visit charge|waiv/i.test(corrected.profile.systemPrompt), "old visit-fee instructions are removed from the voice/chat prompt");
    assert(corrected.profile.leadQuestions.every((question) => !/visit charge|\$20/i.test(question)), "obsolete visit-fee qualification question is removed");
    assert(corrected.profile.leadQuestions.includes("What day works for a visit?"), "unrelated visit scheduling question stays intact");
    assert(corrected.reply.includes("Removed the visiting charge"), "owner receives a clear saved-change confirmation");
    const voice = buildConversationInitiationResponse({
      ok: true,
      calledNumber: "+15557654321",
      demoId: idA,
      demo: { id: idA, profile: corrected.profile, updatedAt: new Date().toISOString() } as never,
    });
    assert(voice.dynamic_variables.business_rules.includes("There is no charge for site visits."), "voice profile receives the updated no-fee rule");
    console.log("PASS — explicit no-visit-fee owner correction is deterministic, removes stale instructions, and needs no OpenAI call");
  } finally {
    if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiKey;
  }

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

  await testVercelSupabaseSaveSkipsFilesystem();
}

async function testVercelSupabaseSaveSkipsFilesystem() {
  const previous = {
    vercel: process.env.VERCEL,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    fetch: globalThis.fetch,
    save: sharedProfileFilesystem.save,
  };

  process.env.VERCEL = "1";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

  let filesystemCalls = 0;
  sharedProfileFilesystem.save = async () => {
    filesystemCalls += 1;
    throw new Error("filesystem must not be used on Vercel");
  };

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.includes("/rest/v1/business_profiles")) {
      throw new Error("unexpected fetch: " + url);
    }
    return new Response(null, { status: 201 });
  }) as typeof fetch;

  try {
    const result = await commitSharedProfile(
      "vercel-texassolar",
      fixture("Texas Solar Professional", "https://texassolar.pro")
    );
    assert(result.persisted === true, "Vercel + Supabase must persist");
    assert(result.durable === true, "Vercel + Supabase must be durable");
    assert(result.backend === "supabase", "backend must be supabase");
    assert(filesystemCalls === 0, "Vercel must not call filesystem storage");
    console.log(
      "PASS — Vercel runtime with Supabase configured saves without filesystem storage"
    );
  } finally {
    if (previous.vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous.vercel;
    if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
    globalThis.fetch = previous.fetch;
    sharedProfileFilesystem.save = previous.save;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
