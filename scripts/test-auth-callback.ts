import assert from "node:assert/strict";
import { resolveCallbackDemoId } from "../src/lib/authCallbackDestination";

// Signup confirmation emails use a PKCE `code` callback and may not include
// `type=signup`; the saved demo must still be claimed and reopened.
assert.equal(resolveCallbackDemoId(null, "dallasplumbing-26c9ac5c"), "dallasplumbing-26c9ac5c");
assert.equal(resolveCallbackDemoId("/reset-password", "dallasplumbing-26c9ac5c"), "dallasplumbing-26c9ac5c");
assert.equal(resolveCallbackDemoId("/demo?id=other-demo-123", "dallasplumbing-26c9ac5c"), "other-demo-123");
assert.equal(resolveCallbackDemoId("/demo/explicit-demo", "dallasplumbing-26c9ac5c"), "explicit-demo");
assert.equal(resolveCallbackDemoId("//attacker.example", "dallasplumbing-26c9ac5c"), "dallasplumbing-26c9ac5c");
assert.equal(resolveCallbackDemoId(null, "<script>"), null);
assert.equal(resolveCallbackDemoId(null, undefined), null);

console.log("PASS auth callback: signup email confirmation preserves the demo, explicit next demo wins, and unsafe/malformed IDs are rejected");
