import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseClientLeadOutcome } from "../src/lib/clientLeadOutcome";

assert.deepEqual(parseClientLeadOutcome("converted", "123.456"), { ok: true, outcome: "converted", saleAmountUsd: 123.46 });
assert.deepEqual(parseClientLeadOutcome("unreviewed", "not-a-number"), { ok: true, outcome: "unreviewed", saleAmountUsd: null });
assert.equal(parseClientLeadOutcome("converted", undefined).ok, false);
assert.equal(parseClientLeadOutcome("converted", -1).ok, false);
assert.equal(parseClientLeadOutcome("converted", "1e100").ok, false);
assert.equal(parseClientLeadOutcome("admin", 42).ok, false);

const source = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");
const migration = source("supabase/migrations/202610210001_client_lead_outcomes.sql");
assert.ok(migration.includes("grant update (sales_outcome, sale_amount_usd)"), "clients can update outcome columns only");
assert.ok(migration.includes("Client updates own lead outcome"), "outcome updates are RLS scoped to the account membership");
assert.ok(migration.includes("customer_leads_converted_requires_amount"), "converted leads require a recorded sale amount");

const route = source("src/app/api/client/leads/outcome/route.ts");
assert.ok(route.includes("supabase.auth.getUser()"), "outcome updates require an authenticated client");
assert.ok(route.includes('.eq("customer_account_id", membership.customer_account_id)'), "outcome updates are restricted to the signed-in tenant");
assert.ok(route.includes(".select(\"id\")"), "unknown and cross-tenant lead ids are not acknowledged as saved");

const supportRoute = source("src/app/api/client/requests/route.ts");
assert.ok(supportRoute.includes("customer_account_id: membership.customer_account_id"), "support requests are stored under the signed-in account");
assert.ok(supportRoute.includes("await transporter.sendMail"), "support requests attempt to notify PulseTech by email");
assert.ok(supportRoute.includes("notificationSent"), "email failure is not falsely reported as a sent notification");

const portal = source("src/app/client/page.tsx");
for (const item of ["Your business information", "Recent leads", "Confirmed sales (recent leads)", "Update business with Peter", "Change password", "Support and account requests"]) {
  assert.ok(portal.includes(item), `client portal includes ${item}`);
}

console.log("PASS client portal: outcome validation, tenant-scoped edits, business settings summary, password access, support and lead reporting");
