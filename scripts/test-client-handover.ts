import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const source = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
const widget = source("src/app/widget/[id]/page.tsx");
const widgetTestPage = source("src/app/widget-test/page.tsx");
const install = source("src/app/client/ClientInstallation.tsx");
const portal = source("src/app/client/page.tsx");
const voiceRoute = source("src/app/api/twilio/voice-demo/route.ts");
const env = source(".env.example");
const pricing = source("src/app/payment-test/PaymentTestView.tsx");
const login = source("src/app/login/page.tsx");
assert.ok(portal.includes("mailto:contact@pulsetechlabs.com"), "client portal support points to the confirmed support inbox");
assert.ok(login.includes("mailto:contact@pulsetechlabs.com"), "sign-in help points to the confirmed support inbox");

assert.match(widget, /loadSharedProfile\(id\)/, "widget reads the saved, server-side business profile");
assert.match(widget, /<CustomerAI business=\{publicBusiness\} demoId=\{id\}/, "widget sends the profile identity to the existing chat session");
for (const privateField of ["leadNotificationEmail", "leadNotificationPhone", "systemPrompt", "pricingRules"]) {
  assert.ok(!widget.includes(`saved.profile.${privateField}`), `widget must not serialize ${privateField} to the browser`);
}
assert.match(widget, /robots: \{ index: false, follow: false \}/, "client widget is not indexed");
assert.match(widgetTestPage, /process\.env\.VERCEL_ENV === "production"\) notFound\(\)/, "installation visual test is unavailable in Production");
assert.match(widgetTestPage, /<WidgetLauncherPreview/, "Preview uses the production floating-widget loader");

assert.ok(install.includes("/pulsetech-widget.js"), "client receives the hosted floating-widget script");
assert.match(install, /data-demo-id/, "widget install code is scoped to the saved client profile");
assert.match(install, /Custom HTML/, "WordPress instructions are present");
assert.match(install, /Embed HTML/, "Wix and Squarespace instructions are present");
assert.ok(install.includes('const previewUrl = `${baseUrl}/widget/${encodeURIComponent(demoId)}`;'), "client preview link uses the production-safe embedded chat route");
assert.match(install, /Open chat preview/, "client portal labels the direct chat preview accurately");
assert.match(install, /Phone activation is configured with PulseTech/, "phone handover is stated as a supervised setup");
assert.match(portal, /demo_id/, "authenticated client portal loads the linked demo id");
assert.match(portal, /ClientInstallation/, "authenticated client portal provides installation code");
assert.match(pricing, /Lead records with captured customer details and service requests/, "pricing accurately lists the lead records provided by the client portal");
assert.ok(pricing.includes("Conversion status and sale value tracking.") && pricing.includes("Not available yet."), "pricing marks unsupported conversion tracking as unavailable");

assert.match(env, /INBOUND_VOICE_NUMBER_MAP/, "per-business phone routing remains explicit configuration");
assert.match(voiceRoute, /resolveInboundVoice\(toNumber\)/, "mapped customer numbers resolve to a saved business profile");
assert.match(voiceRoute, /isVoiceDemoPublicNumber\(toNumber\)/, "public demo calls remain code-gated");
assert.match(voiceRoute, /registerElevenLabsTwilioCall/, "mapped inbound calls use the existing ElevenLabs-Twilio bridge");
assert.ok(voiceRoute.indexOf("resolveInboundVoice(toNumber)") < voiceRoute.indexOf("// First leg: collect the access code"), "mapped business calls bypass only the public-demo code-entry path");

console.log("PASS client handover: website embed, private profile boundary, client portal, mapped inbound voice");
