import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isPulseTechAdmin, normalizeClientEmail, safeClientRedirect } from "../src/lib/clientAccess";
import path from "node:path";

assert.equal(safeClientRedirect("/client?tab=requests"), "/client?tab=requests");
assert.equal(safeClientRedirect("/demo/pulsetechlabs-47bad0f6"), "/demo/pulsetechlabs-47bad0f6");
assert.equal(safeClientRedirect("//attacker.example"), "/client");
assert.equal(safeClientRedirect("https://attacker.example"), "/client");
assert.equal(safeClientRedirect(undefined), "/client");
for (const unsafe of ["/\\\\attacker.example", "/\\t/attacker.example", "/\\n/attacker.example", "/\\r/attacker.example", "///attacker.example"]) {
  assert.equal(safeClientRedirect(unsafe), "/client");
  assert.equal(new URL(safeClientRedirect(unsafe), "https://preview.example").origin, "https://preview.example");
}

assert.equal(isPulseTechAdmin(" Owner@PulseTechLabs.com ", "owner@pulsetechlabs.com, admin@pulsetechlabs.com"), true);
assert.equal(isPulseTechAdmin("owner@pulsetechlabs.com.attacker.example", "owner@pulsetechlabs.com"), false);
assert.equal(isPulseTechAdmin("owner@pulsetechlabs.com", undefined), false);

assert.equal(normalizeClientEmail("  Client@Example.com "), "client@example.com");
assert.equal(normalizeClientEmail("not-an-email"), null);
assert.equal(normalizeClientEmail("name@example.com\\nBcc:other@example.com"), null);
assert.equal(normalizeClientEmail("x".repeat(250) + "@x.com"), null);

const source = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
const migration = source("supabase/client_accounts.sql");
assert.ok(migration.includes("grant select (id, customer_id, business_name, demo_id, handover_status, created_at, updated_at)"), "client can read only its own embed identity through the account RLS policy");

const loginPage = source("src/app/login/page.tsx");
const loginForm = source("src/app/login/ClientLoginForm.tsx");
assert.ok(loginPage.includes("safeClientRedirect(next)"), "login page sanitizes the return path");
assert.ok(loginPage.includes("<ClientLoginForm nextPath={nextPath} />"), "login page passes the safe destination to the password form");
assert.ok(loginForm.includes("signInWithPassword"), "clients use familiar email and password sign-in");
assert.ok(loginForm.includes("resetPasswordForEmail"), "clients can request password recovery");
assert.ok(loginForm.includes("/auth/callback?next="), "password recovery returns to the password reset page");
const passwordForm = source("src/app/client/password/ClientPasswordForm.tsx");
assert.ok(passwordForm.includes("updateUser({ password })"), "invited clients can set or reset a password");
const authCallback = source("src/app/auth/callback/route.ts");
assert.ok(authCallback.includes("exchangeCodeForSession(code)"), "PKCE callback links are exchanged for a session");
assert.ok(authCallback.includes("verifyOtp({ token_hash: tokenHash!"), "Supabase invite and recovery token-hash links are verified");
assert.ok(authCallback.includes('suppliedType === "invite"') && authCallback.includes('suppliedType === "recovery"'), "invite and password-recovery link types are explicitly accepted");

const demoPage = source("src/app/demo/[slug]/page.tsx");
assert.ok(demoPage.includes('response.status === 401'), "unauthenticated demo opens an explicit sign-in state");
assert.ok(demoPage.includes("Continue to sign in"), "demo sign-in state has a clear action");
assert.ok(demoPage.indexOf("response.status === 401") < demoPage.indexOf("if (local?.profile?.businessName)"), "unauthenticated requests cannot fall back to cached private profile data");
assert.ok(demoPage.includes('response.status === 403'), "wrong-account access is shown as an authorization error");
assert.ok(demoPage.includes('href={`/login?next=${encodeURIComponent(returnPath)}`}'), "sign-in preserves the requested demo destination");

console.log("PASS client account regression: tenant redirect safety, private demo gating, exact admin allowlist, normalized client email");
