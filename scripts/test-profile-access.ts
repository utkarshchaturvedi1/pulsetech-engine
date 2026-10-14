import assert from "node:assert/strict";
import { checkProfileAccess, type ProfileAccessDependencies } from "../src/lib/profileAccess";

async function main() {
  let lookups = 0;
  const deps: ProfileAccessDependencies = {
    findAccount: async (demoId) => demoId === "public-demo" ? null : "account-a",
    currentUser: async () => ({ id: "user-a", admin: false }),
    belongsToAccount: async (userId, accountId) => { lookups++; return userId === "user-a" && accountId === "account-a"; },
  };
  assert.deepEqual(await checkProfileAccess("tenant-a", deps), { allowed: true });
  assert.equal(lookups, 1);
  assert.deepEqual(await checkProfileAccess("public-demo", { ...deps, currentUser: async () => { throw new Error("Must not require signup for public testing"); } }), { allowed: true });
  const anonymous = await checkProfileAccess("tenant-a", { ...deps, currentUser: async () => null });
  assert.equal(anonymous.allowed, false);
  if (!anonymous.allowed) assert.equal(anonymous.status, 401);
  const otherTenant = await checkProfileAccess("tenant-a", { ...deps, currentUser: async () => ({ id: "user-b", admin: false }) });
  assert.equal(otherTenant.allowed, false);
  if (!otherTenant.allowed) assert.equal(otherTenant.status, 403);
  assert.deepEqual(await checkProfileAccess("tenant-a", { ...deps, currentUser: async () => ({ id: "admin", admin: true }), belongsToAccount: async () => { throw new Error("Admin should not need membership"); } }), { allowed: true });
  for (const broken of [
    { ...deps, findAccount: async () => { throw new Error("Missing migration"); } },
    { ...deps, belongsToAccount: async () => { throw new Error("Database unavailable"); } },
    { ...deps, currentUser: async () => { throw new Error("Auth unavailable"); } },
  ]) {
    const access = await checkProfileAccess("tenant-a", broken);
    assert.equal(access.allowed, false);
    if (!access.allowed) assert.equal(access.status, 503);
  }
  console.log("PASS profile access: own tenant, other tenant, anonymous, public demo, administrator, and outage fail-closed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
