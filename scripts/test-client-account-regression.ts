import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isPulseTechAdmin, normalizeClientEmail, safeClientRedirect } from "../src/lib/clientAccess";
import path from "node:path";

assert.equal(safeClientRedirect("/client?tab=requests"), "/client?tab=requests");
assert.equal(safeClientRedirect("//attacker.example"), "/client");
assert.equal(safeClientRedirect("https://attacker.example"), "/client");
assert.equal(safeClientRedirect(undefined), "/client");
for (const unsafe of ["/\\attacker.example", "/\t/attacker.example", "/\n/attacker.example", "/\r/attacker.example", "///attacker.example"]) {
  assert.equal(safeClientRedirect(unsafe), "/client");
  assert.equal(new URL(safeClientRedirect(unsafe), "https://preview.example").origin, "https://preview.example");
}

assert.equal(isPulseTechAdmin(" Owner@PulseTechLabs.com ", "owner@pulsetechlabs.com, admin@pulsetechlabs.com"), true);
assert.equal(isPulseTechAdmin("owner@pulsetechlabs.com.attacker.example", "owner@pulsetechlabs.com"), false);
assert.equal(isPulseTechAdmin("owner@pulsetechlabs.com", undefined), false);

assert.equal(normalizeClientEmail("  Client@Example.com "), "client@example.com");
assert.equal(normalizeClientEmail("not-an-email"), null);
assert.equal(normalizeClientEmail("name@example.com\nBcc:other@example.com"), null);
assert.equal(normalizeClientEmail("x".repeat(250) + "@x.com"), null);

const migration = readFileSync(path.join(process.cwd(), "supabase/client_accounts.sql"), "utf8");
assert.match(migration, /grant select \(id, customer_id, business_name, demo_id, handover_status, created_at, updated_at\)/, "client can read only its own embed identity through the account RLS policy");

console.log("PASS client account regression: safe auth redirects, exact admin allowlist, normalized and bounded client email");
