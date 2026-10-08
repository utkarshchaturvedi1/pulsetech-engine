import {
  createMemoryPaddleNotificationStore,
  handlePaddleSandboxWebhook,
  PADDLE_SANDBOX_EVENT_TYPES,
  PaddleStoreUnavailable,
  signPaddleSandboxPayload,
  verifyPaddleSandboxSignature,
} from "../src/lib/paddleSandboxWebhook";

const SECRET = "pdl_ntfset_sandbox_test_secret";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function eventBody(eventType: string, eventId = "evt_01sandboxevent", notificationId = "ntf_01sandboxnote") {
  return JSON.stringify({
    event_id: eventId,
    event_type: eventType,
    occurred_at: "2026-10-08T06:00:00.000Z",
    notification_id: notificationId,
    data: { id: "txn_01sandbox", status: "completed" },
  });
}

function signed(rawBody: string, nowMs: number, secret = SECRET) {
  return signPaddleSandboxPayload(rawBody, secret, Math.floor(nowMs / 1000));
}

async function testValidSignatureStoresEvent() {
  const nowMs = Date.parse("2026-10-08T06:05:00.000Z");
  const rawBody = eventBody("transaction.completed");
  const store = createMemoryPaddleNotificationStore();
  const result = await handlePaddleSandboxWebhook({
    rawBody,
    signatureHeader: signed(rawBody, nowMs),
    secret: SECRET,
    store,
    nowMs,
  });
  assert(result.status === 200, "valid signature returns 200");
  assert(result.body.duplicate === false, "first delivery is not a duplicate");
  assert(result.body.eventType === "transaction.completed", "stores transaction.completed");
  assert(store.records.size === 1, "one notification is stored");
  const saved = store.records.get("evt_01sandboxevent");
  assert(saved?.notificationId === "ntf_01sandboxnote", "notification id is stored");
  assert(
    verifyPaddleSandboxSignature(rawBody, signed(rawBody, nowMs), SECRET, nowMs),
    "helper accepts the same signature",
  );
  console.log("PASS — valid signature");
}

async function testInvalidSignatureDoesNotStore() {
  const nowMs = Date.parse("2026-10-08T06:05:00.000Z");
  const rawBody = eventBody("transaction.completed");
  const store = createMemoryPaddleNotificationStore();
  const tampered = rawBody.replace("completed", "past_due");
  const wrongSecret = await handlePaddleSandboxWebhook({
    rawBody,
    signatureHeader: signed(rawBody, nowMs, "different-secret"),
    secret: SECRET,
    store,
    nowMs,
  });
  const wrongBody = await handlePaddleSandboxWebhook({
    rawBody: tampered,
    signatureHeader: signed(rawBody, nowMs),
    secret: SECRET,
    store,
    nowMs,
  });
  const missing = await handlePaddleSandboxWebhook({
    rawBody,
    signatureHeader: null,
    secret: SECRET,
    store,
    nowMs,
  });
  const stale = await handlePaddleSandboxWebhook({
    rawBody,
    signatureHeader: signPaddleSandboxPayload(rawBody, SECRET, Math.floor(nowMs / 1000) - 30),
    secret: SECRET,
    store,
    nowMs,
  });
  assert(wrongSecret.status === 401, "wrong secret is rejected");
  assert(wrongBody.status === 401, "tampered raw body is rejected");
  assert(missing.status === 401, "missing signature is rejected");
  assert(stale.status === 401, "stale timestamp is rejected");
  assert(store.records.size === 0, "invalid signatures store nothing");
  console.log("PASS — invalid signatures");
}

async function testDuplicateNotification() {
  const nowMs = Date.parse("2026-10-08T06:05:00.000Z");
  const rawBody = eventBody("subscription.updated", "evt_01duplicate", "ntf_01first");
  const retry = eventBody("subscription.updated", "evt_01duplicate", "ntf_01retry");
  const store = createMemoryPaddleNotificationStore();
  const first = await handlePaddleSandboxWebhook({
    rawBody,
    signatureHeader: signed(rawBody, nowMs),
    secret: SECRET,
    store,
    nowMs,
  });
  const second = await handlePaddleSandboxWebhook({
    rawBody: retry,
    signatureHeader: signed(retry, nowMs),
    secret: SECRET,
    store,
    nowMs,
  });
  assert(first.status === 200 && first.body.duplicate === false, "first event is stored");
  assert(second.status === 200 && second.body.duplicate === true, "same event_id is a duplicate");
  assert(store.records.size === 1, "duplicate does not create a second row");
  assert(store.records.get("evt_01duplicate")?.notificationId === "ntf_01first", "first record is kept");
  console.log("PASS — duplicate notifications");
}

async function testSupportedEventsAndIgnoredType() {
  const nowMs = Date.parse("2026-10-08T06:05:00.000Z");
  const store = createMemoryPaddleNotificationStore();
  for (const eventType of PADDLE_SANDBOX_EVENT_TYPES) {
    const rawBody = eventBody(eventType, "evt_01" + eventType.replace(".", ""), "ntf_01" + eventType.replace(".", ""));
    const result = await handlePaddleSandboxWebhook({
      rawBody,
      signatureHeader: signed(rawBody, nowMs),
      secret: SECRET,
      store,
      nowMs,
    });
    assert(result.status === 200 && result.body.duplicate === false, eventType + " is accepted");
  }
  assert(store.records.size === PADDLE_SANDBOX_EVENT_TYPES.length, "each supported event is stored once");

  const ignoredBody = eventBody("customer.created", "evt_01ignored", "ntf_01ignored");
  const ignored = await handlePaddleSandboxWebhook({
    rawBody: ignoredBody,
    signatureHeader: signed(ignoredBody, nowMs),
    secret: SECRET,
    store,
    nowMs,
  });
  assert(ignored.status === 200 && ignored.body.ignored === true, "unsupported event is acknowledged and ignored");
  assert(store.records.size === PADDLE_SANDBOX_EVENT_TYPES.length, "ignored event is not stored");
  console.log("PASS — supported events");
}

async function testUnconfiguredSecretAndStorageFailure() {
  const nowMs = Date.parse("2026-10-08T06:05:00.000Z");
  const rawBody = eventBody("subscription.canceled");
  const unconfigured = await handlePaddleSandboxWebhook({
    rawBody,
    signatureHeader: signed(rawBody, nowMs),
    secret: "",
    store: createMemoryPaddleNotificationStore(),
    nowMs,
  });
  assert(unconfigured.status === 503, "missing secret does not accept the event");

  const liveToken = await handlePaddleSandboxWebhook({
    rawBody,
    signatureHeader: signed(rawBody, nowMs, "live_secret"),
    secret: "live_secret",
    store: createMemoryPaddleNotificationStore(),
    nowMs,
  });
  assert(liveToken.status === 503, "live_ client token is not a sandbox webhook secret");

  const failingStore = {
    async saveIfNew(): Promise<"stored" | "duplicate"> {
      throw new PaddleStoreUnavailable();
    },
  };
  const unavailable = await handlePaddleSandboxWebhook({
    rawBody,
    signatureHeader: signed(rawBody, nowMs),
    secret: SECRET,
    store: failingStore,
    nowMs,
  });
  assert(unavailable.status === 503, "storage failure is retryable");
  console.log("PASS — configuration and storage failure");
}

async function main() {
  await testValidSignatureStoresEvent();
  await testInvalidSignatureDoesNotStore();
  await testDuplicateNotification();
  await testSupportedEventsAndIgnoredType();
  await testUnconfiguredSecretAndStorageFailure();
  console.log("All Paddle Sandbox webhook tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
