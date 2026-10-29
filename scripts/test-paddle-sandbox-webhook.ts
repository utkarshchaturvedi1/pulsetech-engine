import {
  createMemoryPaddleNotificationStore,
  handlePaddleSandboxWebhook,
  PADDLE_SANDBOX_EVENT_TYPES,
  paddleSandboxWebhookSecret,
  PaddleStoreUnavailable,
  signPaddleSandboxPayload,
  supabasePaddleNotificationStore,
  verifyPaddleSandboxSignature,
} from "../src/lib/paddleSandboxWebhook";

const SECRET = "sandbox-destination-test-secret";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

/** evt_ or ntf_ plus 26 lowercase letters or digits, matching Paddle's ID format. */
function paddleId(prefix: "evt" | "ntf", label: string): string {
  const body = label.toLowerCase().replace(/[^a-z0-9]/g, "").padEnd(26, "0").slice(0, 26);
  if (!/^[a-z0-9]{26}$/.test(body)) throw new Error("fixture id is not 26 lowercase letters or digits");
  return prefix + "_" + body;
}

const DEFAULT_EVENT_ID = paddleId("evt", "01sandboxevent");
const DEFAULT_NOTIFICATION_ID = paddleId("ntf", "01sandboxnote");

function eventBody(
  eventType: string,
  eventId = DEFAULT_EVENT_ID,
  notificationId = DEFAULT_NOTIFICATION_ID,
  environment?: string,
) {
  return JSON.stringify({
    event_id: eventId,
    event_type: eventType,
    occurred_at: "2026-10-08T06:00:00.000Z",
    notification_id: notificationId,
    ...(environment ? { environment } : {}),
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
  const saved = store.records.get(DEFAULT_EVENT_ID);
  assert(saved?.notificationId === DEFAULT_NOTIFICATION_ID, "notification id is stored");
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
  const duplicateEventId = paddleId("evt", "01duplicate");
  const rawBody = eventBody("subscription.updated", duplicateEventId, paddleId("ntf", "01first"));
  const retry = eventBody("subscription.updated", duplicateEventId, paddleId("ntf", "01retry"));
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
  assert(
    store.records.get(duplicateEventId)?.notificationId === paddleId("ntf", "01first"),
    "first record is kept",
  );
  console.log("PASS — duplicate notifications");
}

async function testSupportedEventsAndIgnoredType() {
  const nowMs = Date.parse("2026-10-08T06:05:00.000Z");
  const store = createMemoryPaddleNotificationStore();
  for (const eventType of PADDLE_SANDBOX_EVENT_TYPES) {
    const rawBody = eventBody(eventType, paddleId("evt", eventType), paddleId("ntf", eventType));
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

  const ignoredBody = eventBody("customer.created", paddleId("evt", "01ignored"), paddleId("ntf", "01ignored"));
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
  assert(liveToken.status === 503, "a live_ client token is not accepted as the destination secret");

  const shortId = await handlePaddleSandboxWebhook({
    rawBody: eventBody("transaction.completed", "evt_short", DEFAULT_NOTIFICATION_ID),
    signatureHeader: signed(eventBody("transaction.completed", "evt_short", DEFAULT_NOTIFICATION_ID), nowMs),
    secret: SECRET,
    store: createMemoryPaddleNotificationStore(),
    nowMs,
  });
  assert(shortId.status === 400, "event ids must be evt_ plus 26 lowercase letters or digits");

  const production = await handlePaddleSandboxWebhook({
    rawBody,
    signatureHeader: signed(rawBody, nowMs),
    secret: SECRET,
    store: createMemoryPaddleNotificationStore(),
    nowMs,
    vercelEnv: "production",
  });
  assert(production.status === 403, "production runtime rejects the webhook");

  const environmentField = eventBody(
    "transaction.completed",
    paddleId("evt", "01environment"),
    paddleId("ntf", "01environment"),
    "production",
  );
  const environmentStore = createMemoryPaddleNotificationStore();
  const environmentIgnored = await handlePaddleSandboxWebhook({
    rawBody: environmentField,
    signatureHeader: signed(environmentField, nowMs),
    secret: SECRET,
    store: environmentStore,
    nowMs,
    vercelEnv: "preview",
  });
  assert(environmentIgnored.status === 200, "event.environment is not used to reject a signed event");
  assert(environmentStore.records.size === 1, "event.environment does not block storage");

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

/** Documented simulator request: ntfsimevt_ id, no notification_id. */
const SIMULATION_EVENT_ID = "ntfsimevt_01j82zmtqgpfpphj5236f884tx";

function simulationBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    event_id: SIMULATION_EVENT_ID,
    event_type: "transaction.completed",
    occurred_at: "2024-09-18T16:32:30.448740Z",
    data: {
      id: "txn_01hv8wptq8987qeep44cyrewp9",
      status: "completed",
      origin: "web",
      subscription_id: "sub_01hv8x29kz0t586xy6zn1a62ny",
    },
    ...overrides,
  });
}

async function testSimulationEnvelopeStoresEvent() {
  const nowMs = Date.parse("2024-09-18T16:32:32.000Z");
  const rawBody = simulationBody();
  const store = createMemoryPaddleNotificationStore();
  const result = await handlePaddleSandboxWebhook({
    rawBody,
    signatureHeader: signed(rawBody, nowMs),
    secret: SECRET,
    store,
    nowMs,
    vercelEnv: "preview",
  });
  assert(result.status === 200, "signed simulation envelope returns 200");
  assert(result.body.duplicate === false, "first simulation delivery is stored");
  assert(result.body.eventType === "transaction.completed", "simulation event type is kept");
  const saved = store.records.get(SIMULATION_EVENT_ID);
  assert(saved?.notificationId === SIMULATION_EVENT_ID, "missing notification_id stores the simulation event id");
  assert(
    (saved?.payload as { id?: string } | null)?.id === "txn_01hv8wptq8987qeep44cyrewp9",
    "simulation data is stored as the payload",
  );
  console.log("PASS — simulation envelope");
}

async function testSimulationInvalidSignatureAndMalformedEvent() {
  const nowMs = Date.parse("2024-09-18T16:32:32.000Z");
  const rawBody = simulationBody();
  const store = createMemoryPaddleNotificationStore();
  const wrongSecret = await handlePaddleSandboxWebhook({
    rawBody,
    signatureHeader: signed(rawBody, nowMs, "different-secret"),
    secret: SECRET,
    store,
    nowMs,
  });
  const tampered = rawBody.replace("completed", "past_due");
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
  assert(wrongSecret.status === 401 && wrongSecret.body.error === "Invalid signature", "simulation wrong secret is rejected");
  assert(wrongBody.status === 401, "tampered simulation body is rejected");
  assert(missing.status === 401, "unsigned simulation body is rejected");

  const cases: Array<{ body: string; status: number; error: string; label: string }> = [
    {
      body: simulationBody({ occurred_at: undefined }),
      status: 400,
      error: "Invalid event",
      label: "simulation without occurred_at",
    },
    {
      body: simulationBody({
        event_id: "evt_01j82zmtqgpfpphj5236f884tx",
        notification_id: "ntf_short",
      }),
      status: 400,
      error: "Invalid event",
      label: "short platform notification id",
    },
    {
      body: simulationBody({ event_id: "ntfsimevt_short" }),
      status: 400,
      error: "Invalid event",
      label: "short simulation event id",
    },
    {
      body: simulationBody({ notification_id: "notification-id" }),
      status: 400,
      error: "Invalid event",
      label: "notification id without a paddle prefix",
    },
    {
      body: JSON.stringify([
        {
          event_id: SIMULATION_EVENT_ID,
          event_type: "transaction.completed",
          occurred_at: "2024-09-18T16:32:30.448740Z",
        },
      ]),
      status: 400,
      error: "Invalid event",
      label: "array body",
    },
    { body: "{", status: 400, error: "Invalid JSON", label: "malformed JSON" },
  ];
  for (const testCase of cases) {
    const result = await handlePaddleSandboxWebhook({
      rawBody: testCase.body,
      signatureHeader: signed(testCase.body, nowMs),
      secret: SECRET,
      store,
      nowMs,
    });
    assert(result.status === testCase.status && result.body.error === testCase.error, testCase.label);
  }
  assert(store.records.size === 0, "rejected simulation deliveries store nothing");
  console.log("PASS — simulation signatures and malformed events");
}

const SIMULATION_NOTIFICATION_ID = "ntfsim_01j82d983j814ypzx7m1fw2jpz";

async function testDeliveredSimulationIncludesNotificationId() {
  const nowMs = Date.parse("2024-09-18T16:32:32.000Z");
  const rawBody = simulationBody({ notification_id: SIMULATION_NOTIFICATION_ID });
  const store = createMemoryPaddleNotificationStore();
  const result = await handlePaddleSandboxWebhook({
    rawBody,
    signatureHeader: signed(rawBody, nowMs),
    secret: SECRET,
    store,
    nowMs,
    vercelEnv: "preview",
  });
  assert(result.status === 200, "simulation notification id ntfsim_ is accepted");
  assert(result.body.duplicate === false, "first ntfsim_ delivery is stored");
  const saved = store.records.get(SIMULATION_EVENT_ID);
  assert(saved?.notificationId === SIMULATION_NOTIFICATION_ID, "ntfsim_ notification id is stored");

  const entityBody = JSON.stringify({
    id: "ntfsimevt_01j82hf8jrwjsf9337a35tqghp",
    status: "pending",
    event_type: "transaction.completed",
    payload: { id: "txn_01hv8wptq8987qeep44cyrewp9", status: "completed" },
    created_at: "2024-09-18T12:24:47.960617Z",
  });
  const entity = await handlePaddleSandboxWebhook({
    rawBody: entityBody,
    signatureHeader: signed(entityBody, nowMs),
    secret: SECRET,
    store,
    nowMs,
    vercelEnv: "preview",
  });
  assert(entity.status === 200, "simulation event entity without event_id or occurred_at is accepted");
  const entitySaved = store.records.get("ntfsimevt_01j82hf8jrwjsf9337a35tqghp");
  assert(entitySaved?.occurredAt === "2024-09-18T12:24:47.960617Z", "created_at is used when occurred_at is absent");
  assert(
    (entitySaved?.payload as { id?: string } | null)?.id === "txn_01hv8wptq8987qeep44cyrewp9",
    "payload is stored when data is absent",
  );
  console.log("PASS — delivered simulation shapes");
}

async function testDuplicateSimulationNotification() {
  const nowMs = Date.parse("2024-09-18T16:32:32.000Z");
  const rawBody = simulationBody();
  const retry = simulationBody({
    data: {
      id: "txn_01hv8wptq8987qeep44cyrewp9",
      status: "completed",
      origin: "web",
      subscription_id: "sub_01hv8x29kz0t586xy6zn1a62ny",
      replayed: true,
    },
  });
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
  assert(first.status === 200 && first.body.duplicate === false, "first simulation event is stored");
  assert(second.status === 200 && second.body.duplicate === true, "same ntfsimevt_ id is a duplicate");
  assert(store.records.size === 1, "simulation retry does not create a second row");
  assert(
    (store.records.get(SIMULATION_EVENT_ID)?.payload as { replayed?: boolean } | null)?.replayed !== true,
    "the first simulation payload is kept",
  );
  console.log("PASS — duplicate simulation notifications");
}

async function testLiveSimulationNotificationIdStoresInSupabase() {
  const nowMs = Date.parse("2026-10-14T07:25:57.000Z");
  const eventId = "ntfsimevt_01m4wmvc5jypq32sk87byaz2e1";
  const notificationId = "ntfsimntf_01m4wmvc7g4v988h1q12q29442";
  const rawBody = JSON.stringify({
    event_id: eventId,
    notification_id: notificationId,
    event_type: "transaction.completed",
    occurred_at: "2026-10-14T07:25:55.250724Z",
    data: { id: "txn_01m4wmvc5jypq32sk87byaz2e1", status: "completed" },
  });
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalFetch = globalThis.fetch;
  const posts: Array<{ url: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co/";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const requestHeaders = new Headers(init?.headers);
    posts.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown>, headers: Object.fromEntries(requestHeaders.entries()) });
    return new Response(null, { status: posts.length === 1 ? 201 : 409 });
  }) as typeof fetch;
  try {
    const stored = await handlePaddleSandboxWebhook({
      rawBody,
      signatureHeader: signed(rawBody, nowMs),
      secret: SECRET,
      store: supabasePaddleNotificationStore,
      nowMs,
      vercelEnv: "preview",
    });
    assert(stored.status === 200 && stored.body.duplicate === false, "ntfsimntf_ simulation is stored");
    assert(
      posts[0]?.url === "https://example.supabase.co/rest/v1/paddle_sandbox_notifications",
      "insert targets paddle_sandbox_notifications",
    );
    assert(posts[0]?.headers.apikey === "service-role-test", "Supabase key is sent on apikey");
    assert(posts[0]?.headers.authorization === undefined, "Supabase API key is not sent as a Bearer JWT");
    assert(posts[0]?.body.event_id === eventId, "stored event_id");
    assert(posts[0]?.body.notification_id === notificationId, "stored ntfsimntf_ notification_id");
    assert(posts[0]?.body.event_type === "transaction.completed", "stored event_type");
    assert(posts[0]?.body.occurred_at === "2026-10-14T07:25:55.250724Z", "stored occurred_at");
    assert(
      (posts[0]?.body.payload as { status?: string } | null)?.status === "completed",
      "stored transaction payload",
    );

    const duplicate = await handlePaddleSandboxWebhook({
      rawBody,
      signatureHeader: signed(rawBody, nowMs),
      secret: SECRET,
      store: supabasePaddleNotificationStore,
      nowMs,
      vercelEnv: "preview",
    });
    assert(duplicate.status === 200 && duplicate.body.duplicate === true, "repeat ntfsimntf_ delivery is a duplicate");
    assert(posts.length === 2, "duplicate still attempts the primary-key insert");

    const beforeInvalid = posts.length;
    const invalidSignature = await handlePaddleSandboxWebhook({
      rawBody,
      signatureHeader: signed(rawBody, nowMs, "different-secret"),
      secret: SECRET,
      store: supabasePaddleNotificationStore,
      nowMs,
      vercelEnv: "preview",
    });
    assert(invalidSignature.status === 401, "invalid signature is rejected before storage");
    assert(posts.length === beforeInvalid, "invalid signature does not write a row");

    const malformedBody = JSON.stringify({
      event_id: eventId,
      notification_id: "ntfsimntf_short",
      event_type: "transaction.completed",
      occurred_at: "2026-10-14T07:25:55.250724Z",
      data: { id: "txn_01m4wmvc5jypq32sk87byaz2e1", status: "completed" },
    });
    const malformed = await handlePaddleSandboxWebhook({
      rawBody: malformedBody,
      signatureHeader: signed(malformedBody, nowMs),
      secret: SECRET,
      store: supabasePaddleNotificationStore,
      nowMs,
      vercelEnv: "preview",
    });
    assert(malformed.status === 400 && malformed.body.error === "Invalid event", "short ntfsimntf_ id is rejected");
    assert(posts.length === beforeInvalid, "malformed simulation does not write a row");

    const platformBody = JSON.stringify({
      event_id: "evt_01m4wmvc5jypq32sk87byaz2e1",
      notification_id: notificationId,
      event_type: "transaction.completed",
      occurred_at: "2026-10-14T07:25:55.250724Z",
      data: { id: "txn_01m4wmvc5jypq32sk87byaz2e1", status: "completed" },
    });
    const platform = await handlePaddleSandboxWebhook({
      rawBody: platformBody,
      signatureHeader: signed(platformBody, nowMs),
      secret: SECRET,
      store: supabasePaddleNotificationStore,
      nowMs,
      vercelEnv: "preview",
    });
    assert(platform.status === 400, "a platform event cannot use an ntfsimntf_ notification id");
    assert(posts.length === beforeInvalid, "rejected platform event does not write a row");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
  console.log("PASS — ntfsimntf_ storage");
}

async function testWebhookSecretIsTrimmedBeforeVerification() {
  const previous = process.env.PADDLE_SANDBOX_WEBHOOK_SECRET;
  const nowMs = Date.parse("2024-09-18T16:32:32.000Z");
  const rawBody = simulationBody({ event_id: "ntfsimevt_01j82zmtq2zkgc1f29jwcc1ddk" });
  try {
    delete process.env.PADDLE_SANDBOX_WEBHOOK_SECRET;
    assert(paddleSandboxWebhookSecret() === "", "a missing secret reads as empty");
    process.env.PADDLE_SANDBOX_WEBHOOK_SECRET = "  " + SECRET + "\n";
    const secret = paddleSandboxWebhookSecret();
    assert(secret === SECRET, "the destination secret is trimmed");
    const store = createMemoryPaddleNotificationStore();
    const result = await handlePaddleSandboxWebhook({
      rawBody,
      signatureHeader: signed(rawBody, nowMs, secret),
      secret,
      store,
      nowMs,
    });
    assert(result.status === 200, "the trimmed secret verifies the signature");
    assert(store.records.size === 1, "a trimmed secret still stores the event");
  } finally {
    if (previous === undefined) delete process.env.PADDLE_SANDBOX_WEBHOOK_SECRET;
    else process.env.PADDLE_SANDBOX_WEBHOOK_SECRET = previous;
  }
  console.log("PASS — webhook secret");
}

async function testStorageFailureCategories() {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalInfo = console.info;
  const originalFetch = globalThis.fetch;
  const logs: string[] = [];
  console.info = (message?: unknown) => {
    logs.push(String(message));
  };
  const record = {
    eventId: "ntfsimevt_01m4wmvc5jypq32sk87byaz2e1",
    notificationId: "ntfsimntf_01m4wmvc7g4v988h1q12q29442",
    eventType: "transaction.completed" as const,
    occurredAt: "2026-10-14T07:25:55.250724Z",
    payload: { status: "completed" },
  };
  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    let missing = false;
    try {
      await supabasePaddleNotificationStore.saveIfNew(record);
    } catch (error) {
      missing = error instanceof PaddleStoreUnavailable;
    }
    assert(missing, "missing supabase config is storage unavailable");
    assert(logs.some((line) => line.includes('"category":"missing-config"')), "logs missing-config");

    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ code: "PGRST205", message: "do not log this body" }), {
        status: 404,
      })) as typeof fetch;
    let rejected = false;
    try {
      await supabasePaddleNotificationStore.saveIfNew(record);
    } catch (error) {
      rejected = error instanceof PaddleStoreUnavailable;
    }
    assert(rejected, "a rejected insert is storage unavailable");
    assert(
      logs.some(
        (line) =>
          line.includes('"category":"insert-rejected"') &&
          line.includes('"status":404') &&
          line.includes('"code":"PGRST205"') &&
          !line.includes("do not log this body"),
      ),
      "logs status and postgrest code only",
    );
  } finally {
    console.info = originalInfo;
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
  console.log("PASS — storage failure categories");
}

async function testSupabaseServiceKeyFormats() {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalFetch = globalThis.fetch;
  // Synthetic, unsigned fixture: never a usable credential.
  const legacyKey = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from('{"role":"service_role"}').toString("base64url")}.testsignature`;
  const record = {
    eventId: paddleId("evt", "keyformats"), notificationId: paddleId("ntf", "keyformats"),
    eventType: "transaction.completed" as const, occurredAt: new Date().toISOString(), payload: {},
  };
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    for (const key of [legacyKey, "sb_secret_synthetic_test_key"]) {
      process.env.SUPABASE_SERVICE_ROLE_KEY = key;
      globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        assert(headers.get("apikey") === key, "both key formats authenticate on apikey");
        const expectedBearer = key === legacyKey ? `Bearer ${key}` : null;
        assert(headers.get("authorization") === expectedBearer, "legacy service role uses Bearer; opaque secrets must not be treated as JWTs");
        // Reproduce the live PostgREST role-selection failure if the legacy
        // JWT does not reach Authorization. No public-table policy is added.
        return new Response(null, { status: headers.get("authorization") === expectedBearer ? 201 : 401 });
      }) as typeof fetch;
      assert(await supabasePaddleNotificationStore.saveIfNew(record) === "stored", "authenticated service can store the event");
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
  console.log("PASS — legacy JWT and opaque Supabase service keys");
}

async function main() {
  await testValidSignatureStoresEvent();
  await testInvalidSignatureDoesNotStore();
  await testDuplicateNotification();
  await testSupportedEventsAndIgnoredType();
  await testUnconfiguredSecretAndStorageFailure();
  await testSimulationEnvelopeStoresEvent();
  await testDeliveredSimulationIncludesNotificationId();
  await testSimulationInvalidSignatureAndMalformedEvent();
  await testDuplicateSimulationNotification();
  await testLiveSimulationNotificationIdStoresInSupabase();
  await testStorageFailureCategories();
  await testWebhookSecretIsTrimmedBeforeVerification();
  await testSupabaseServiceKeyFormats();
  console.log("All Paddle Sandbox webhook tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
