import assert from "node:assert/strict";
import { isPulseTechAdmin, normalizeClientEmail, safeClientRedirect } from "../src/lib/clientAccess";

assert.equal(safeClientRedirect("/client?tab=requests"), "/client?tab=requests");
assert.equal(safeClientRedirect("//attacker.example"), "/client");
assert.equal(safeClientRedirect("https://attacker.example"), "/client");
assert.equal(safeClientRedirect(undefined), "/client");

assert.equal(isPulseTechAdmin(" Owner@PulseTechLabs.com ", "owner@pulsetechlabs.com, admin@pulsetechlabs.com"), true);
assert.equal(isPulseTechAdmin("owner@pulsetechlabs.com.attacker.example", "owner@pulsetechlabs.com"), false);
assert.equal(isPulseTechAdmin("owner@pulsetechlabs.com", undefined), false);

assert.equal(normalizeClientEmail("  Client@Example.com "), "client@example.com");
assert.equal(normalizeClientEmail("not-an-email"), null);
assert.equal(normalizeClientEmail("name@example.com\nBcc:other@example.com"), null);
assert.equal(normalizeClientEmail("x".repeat(250) + "@x.com"), null);

console.log("PASS client account regression: safe auth redirects, exact admin allowlist, normalized and bounded client email");
