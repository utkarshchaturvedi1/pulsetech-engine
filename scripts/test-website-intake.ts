import {
  applyWebsiteIntakeMessage,
  createWebsiteIntakeSession,
  extractWebsiteCandidate,
  isIncompleteDomain,
  markWebsiteIntakeFailed,
  resolveWebsiteIntake,
  WEBSITE_FULL_DOMAIN_PROMPT,
  WEBSITE_INTAKE_ERROR_HELP,
} from "../src/lib/websiteIntake";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function fail(session: ReturnType<typeof createWebsiteIntakeSession>) {
  return markWebsiteIntakeFailed(session);
}

async function main() {
  // A. incomplete/bad input fails to lock; corrected domain starts fresh analysis
  let session = createWebsiteIntakeSession();
  let result = applyWebsiteIntakeMessage(session, "dallasplumbing");
  assert(result.decision.kind === "ask_full_domain", "A: incomplete domain must not start analysis");
  assert(result.session.lastWebsite === "", "A: incomplete domain must not store a URL");
  assert(result.session.phase === "intake", "A: incomplete domain must stay in intake");
  session = result.session;

  result = applyWebsiteIntakeMessage(session, "dallasplumbing.co");
  assert(result.decision.kind === "analyze", "A: corrected domain must start analysis");
  assert(result.decision.kind === "analyze" && result.decision.website === "dallasplumbing.co", "A: corrected URL is used");
  assert(result.session.retryCount === 0, "A: corrected URL resets retry state");
  session = fail(result.session);

  result = applyWebsiteIntakeMessage(session, "corrected-domain.com");
  assert(result.decision.kind === "analyze", "A: after a failure, a new domain starts fresh analysis");
  assert(
    result.decision.kind === "analyze" && result.decision.website === "corrected-domain.com",
    "A: failed URL is replaced"
  );
  assert(result.session.lastWebsite === "corrected-domain.com", "A: session lastWebsite is the new URL");
  assert(result.session.retryCount === 0, "A: new URL resets retry count");
  console.log("A PASS — corrected URL after failure starts fresh analysis");

  // B. retry retries the same URL only
  session = fail(
    applyWebsiteIntakeMessage(createWebsiteIntakeSession(), "bad-site.invalid").session
  );
  const failedUrl = session.lastWebsite;
  result = applyWebsiteIntakeMessage(session, "retry");
  assert(result.decision.kind === "retry", "B: retry intent retries");
  assert(result.session.lastWebsite === failedUrl, "B: retry keeps the last attempted URL");
  assert(result.session.retryCount === 1, "B: retry increments retry count");
  assert(result.session.phase === "analyzing", "B: retry restarts analysis");
  result = applyWebsiteIntakeMessage(fail(result.session), "try again");
  assert(result.decision.kind === "retry", "B: try again also retries");
  assert(result.session.lastWebsite === failedUrl, "B: try again still uses the same URL");
  console.log("B PASS — retry retries only the last attempted URL");

  // C. different domain after failure discards the old URL
  session = fail(
    applyWebsiteIntakeMessage(createWebsiteIntakeSession(), "bad-site.invalid").session
  );
  result = applyWebsiteIntakeMessage(session, "different-domain.com");
  assert(result.decision.kind === "analyze", "C: different domain starts a new analysis");
  assert(result.session.lastWebsite === "different-domain.com", "C: old failed URL is discarded");
  assert(result.session.retryCount === 0, "C: retry state resets for the new URL");
  assert(result.session.lastWebsite !== "bad-site.invalid", "C: previous failed URL is gone");
  console.log("C PASS — different domain discards the old failed URL");

  // D. valid domain on a fresh session starts analysis
  result = applyWebsiteIntakeMessage(createWebsiteIntakeSession(), "valid-domain.com");
  assert(result.decision.kind === "analyze", "D: valid domain starts analysis");
  assert(result.session.phase === "analyzing", "D: phase is analyzing");
  assert(result.session.lastWebsite === "valid-domain.com", "D: stores the submitted URL");
  assert(
    resolveWebsiteIntake(result.session, "retry").kind === "wait",
    "D: messages during analysis wait instead of changing URL"
  );
  console.log("D PASS — valid domain starts normal setup analysis");

  // E. multiple consecutive failed URLs, later valid URL still works
  session = createWebsiteIntakeSession();
  session = fail(applyWebsiteIntakeMessage(session, "one-bad.invalid").session);
  session = fail(applyWebsiteIntakeMessage(session, "two-bad.invalid").session);
  session = fail(applyWebsiteIntakeMessage(session, "three-bad.invalid").session);
  assert(session.lastWebsite === "three-bad.invalid", "E: last failed URL is the most recent attempt");
  result = applyWebsiteIntakeMessage(session, "https://later-valid.com");
  assert(result.decision.kind === "analyze", "E: later valid URL starts analysis");
  assert(result.session.lastWebsite === "https://later-valid.com", "E: valid URL replaces the failed chain");
  assert(result.session.retryCount === 0, "E: retry state is reset after the failed chain");
  console.log("E PASS — later valid URL recovers after multiple failures");

  // F. same session, no reset required
  session = createWebsiteIntakeSession();
  session = fail(applyWebsiteIntakeMessage(session, "typo-site.invalid").session);
  result = applyWebsiteIntakeMessage(session, "retry");
  session = fail(result.session);
  result = applyWebsiteIntakeMessage(session, "fixed-site.com");
  assert(result.decision.kind === "analyze", "F: corrected URL works in the same session");
  assert(result.session.lastWebsite === "fixed-site.com", "F: no new session is required");
  console.log("F PASS — corrected URL works without a new session");

  assert(isIncompleteDomain("dallasplumbing"), "incomplete host without TLD is detected");
  assert(isIncompleteDomain("https://dallasplumbing"), "protocol without TLD is still incomplete");
  assert(!isIncompleteDomain("dallasplumbing.co"), "host with TLD is not incomplete");
  assert(extractWebsiteCandidate("please use dallasplumbing.co") === "dallasplumbing.co", "extracts domain from extra text");
  assert(extractWebsiteCandidate("dallasplumbing") === undefined, "does not invent a TLD");

  const help = resolveWebsiteIntake(
    fail(applyWebsiteIntakeMessage(createWebsiteIntakeSession(), "old.invalid").session),
    "not a website"
  );
  assert(help.kind === "error_help" && help.reply === WEBSITE_INTAKE_ERROR_HELP, "error help copy is stable");
  assert(WEBSITE_FULL_DOMAIN_PROMPT.includes("full website"), "ask-for-domain copy is explicit");

  console.log("website-intake PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
