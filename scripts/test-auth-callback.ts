import assert from "node:assert/strict";
import { resolveCallbackDemoId, resolveCallbackClaimId, resolveCallbackDestination } from "../src/lib/authCallbackDestination";

// Signup confirmation emails use a PKCE `code` callback and may not include
// `type=signup`; the saved demo must still be claimed and reopened.
assert.equal(resolveCallbackDemoId(null, "dallasplumbing-26c9ac5c"), "dallasplumbing-26c9ac5c");
assert.equal(resolveCallbackDemoId("/reset-password", "dallasplumbing-26c9ac5c"), "dallasplumbing-26c9ac5c");
assert.equal(resolveCallbackDemoId("/demo?id=other-demo-123", "dallasplumbing-26c9ac5c"), "other-demo-123");
assert.equal(resolveCallbackDemoId("/demo/explicit-demo", "dallasplumbing-26c9ac5c"), "explicit-demo");
assert.equal(resolveCallbackDemoId("//attacker.example", "dallasplumbing-26c9ac5c"), "dallasplumbing-26c9ac5c");
assert.equal(resolveCallbackDemoId(null, "<script>"), null);
assert.equal(resolveCallbackDemoId(null, undefined), null);

assert.equal(resolveCallbackDestination("/reset-password", "saved-demo"), "/reset-password");
assert.equal(resolveCallbackDestination("/reset-password?next=%2Fclient", "saved-demo"), "/reset-password?next=%2Fclient");
assert.equal(resolveCallbackDestination("/client", "saved-demo"), "/client");
assert.equal(resolveCallbackDestination(null, "saved-demo"), "/demo?id=saved-demo");
assert.equal(resolveCallbackDestination(null, null), "/reset-password");
assert.equal(resolveCallbackDestination("//attacker.example", "saved-demo"), "/client");
for (const type of [null, "signup", "recovery", "invite"]) {
  assert.equal(resolveCallbackClaimId("/reset-password?next=%2Fclient", "stale-demo", type), null);
}
assert.equal(resolveCallbackClaimId(null, "stale-demo", "recovery"), null);
assert.equal(resolveCallbackClaimId(null, "stale-demo", "invite"), null);
assert.equal(resolveCallbackClaimId(null, "saved-demo", null), "saved-demo");
assert.equal(resolveCallbackClaimId(null, "saved-demo", "signup"), "saved-demo");
assert.equal(resolveCallbackClaimId("/demo/explicit-demo", "saved-demo", null), "explicit-demo");

console.log("PASS auth callback: signup email confirmation preserves the demo, explicit next demo wins, and unsafe/malformed IDs are rejected");
