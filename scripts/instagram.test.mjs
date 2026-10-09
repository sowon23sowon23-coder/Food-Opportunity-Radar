// Mock-response tests for scripts/instagram.mjs — no real token or network.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { collectInstagramAccount, classifyGraphError, readConfig, redact, toRawContentRow } from "./instagram.mjs";

const TOKEN = "EAAtest_SECRET_token_123";
const config = { accessToken: TOKEN, igUserId: "17841402307485379", apiVersion: "v26.0", maxPerAccount: 25 };
const noSleep = async () => {};

function post(id, extra = {}) {
  return { id, caption: `caption ${id}`, permalink: `https://www.instagram.com/p/${id}/`, timestamp: "2026-10-01T00:00:00+0000", ...extra };
}

function page(items, after) {
  return { business_discovery: { username: "iloveyochi.us", media: { data: items, ...(after ? { paging: { cursors: { after } } } : {}) } } };
}

// Returns a fetch stub that serves `responses` in order and records calls.
function mockFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (r instanceof Error) throw r;
    return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, json: async () => r.body };
  };
  fn.calls = calls;
  return fn;
}

function memoryStore(initial = []) {
  const ids = new Set(initial);
  const saved = [];
  return {
    knownIds: new Set(initial),
    saved,
    insertPost: async (p) => {
      if (ids.has(p.id)) return "duplicate";
      ids.add(p.id);
      saved.push(p);
      return "inserted";
    },
  };
}

test("collects across pages and sends the token only in the Authorization header", async () => {
  const fetchImpl = mockFetch([{ body: page([post("1"), post("2")], "CUR1") }, { body: page([post("3")]) }]);
  const store = memoryStore();
  const stats = await collectInstagramAccount({ username: "iloveyochi.us", config, ...store, fetchImpl, sleep: noSleep });

  assert.equal(stats.inserted, 3);
  assert.equal(stats.pages, 2);
  assert.deepEqual(store.saved.map((p) => p.id), ["1", "2", "3"]);
  assert.match(decodeURIComponent(fetchImpl.calls[1].url), /media\.limit\(\d+\)\.after\(CUR1\)/);
  for (const c of fetchImpl.calls) {
    assert.ok(!c.url.includes(TOKEN), "token must not appear in URL");
    assert.equal(c.init.headers.Authorization, `Bearer ${TOKEN}`);
  }
});

test("re-running stores nothing new (dedupe by post ID)", async () => {
  const items = [post("1"), post("2"), post("3"), post("4")];
  const store = memoryStore();
  await collectInstagramAccount({ username: "iloveyochi.us", config, ...store, fetchImpl: mockFetch([{ body: page(items) }]), sleep: noSleep });
  const second = await collectInstagramAccount({ username: "iloveyochi.us", config, ...store, fetchImpl: mockFetch([{ body: page(items) }]), sleep: noSleep });

  assert.equal(store.saved.length, 4);
  assert.equal(second.inserted, 0);
  assert.equal(second.duplicates, 3);
  assert.equal(second.stoppedAt, "reached already-collected posts");
});

test("a known pinned post at the top doesn't stop collection; 3 known in a row does, without fetching more pages", async () => {
  // P (pinned, known), then 2 new posts, then 3 known posts, then a next page that must not be requested.
  const fetchImpl = mockFetch([{ body: page([post("P"), post("N1"), post("N2"), post("K1"), post("K2"), post("K3")], "MORE") }, { body: page([post("OLD")]) }]);
  const store = memoryStore(["P", "K1", "K2", "K3"]);
  const stats = await collectInstagramAccount({ username: "iloveyochi.us", config, ...store, fetchImpl, sleep: noSleep });

  assert.deepEqual(store.saved.map((p) => p.id), ["N1", "N2"]);
  assert.equal(stats.duplicates, 4);
  assert.equal(fetchImpl.calls.length, 1);
});

test("respects the per-run limit", async () => {
  const fetchImpl = mockFetch([{ body: page([post("1"), post("2"), post("3")], "CUR") }]);
  const store = memoryStore();
  const stats = await collectInstagramAccount({ username: "iloveyochi.us", config: { ...config, maxPerAccount: 2 }, ...store, fetchImpl, sleep: noSleep });

  assert.equal(stats.inserted, 2);
  assert.match(decodeURIComponent(fetchImpl.calls[0].url), /media\.limit\(2\)/);
  assert.equal(stats.stoppedAt, "per-run limit (2)");
});

test("posts without a caption are stored with an empty caption", async () => {
  const store = memoryStore();
  await collectInstagramAccount({
    username: "iloveyochi.us",
    config,
    ...store,
    fetchImpl: mockFetch([{ body: page([post("1", { caption: undefined })]) }]),
    sleep: noSleep,
  });
  assert.equal(store.saved[0].caption, "");
  const row = toRawContentRow("src-1", store.saved[0], (s) => `h(${s.length})`);
  assert.equal(row.content_type, "instagram_post");
  assert.equal(row.external_id, "1");
  assert.equal(row.content_text, "");
  assert.equal(row.url, "https://www.instagram.com/p/1/");
});

test("a DB-level duplicate (unique index) is counted, not inserted", async () => {
  const stats = await collectInstagramAccount({
    username: "iloveyochi.us",
    config,
    knownIds: new Set(),
    insertPost: async () => "duplicate",
    fetchImpl: mockFetch([{ body: page([post("1")]) }]),
    sleep: noSleep,
  });
  assert.equal(stats.inserted, 0);
  assert.equal(stats.duplicates, 1);
});

const graphError = (status, code, extra = {}) => ({ status, body: { error: { message: "msg", code, ...extra } } });

for (const [name, resp, kind] of [
  ["expired token", graphError(400, 190, { error_subcode: 463 }), "auth_expired"],
  ["missing permission", graphError(403, 10), "permission"],
  ["missing permission (2xx code)", graphError(403, 200), "permission"],
  ["rate limit", graphError(400, 4), "rate_limit"],
  ["account not found", graphError(400, 110, { error_subcode: 2207013 }), "account_not_found"],
]) {
  test(`${name} → ${kind}, no retry`, async () => {
    const fetchImpl = mockFetch([resp]);
    await assert.rejects(
      collectInstagramAccount({ username: "nope", config, ...memoryStore(), fetchImpl, sleep: noSleep }),
      (e) => e.kind === kind
    );
    assert.equal(fetchImpl.calls.length, 1);
  });
}

test("temporary 5xx is retried, then succeeds", async () => {
  const fetchImpl = mockFetch([{ status: 500, body: { error: { message: "oops", code: 2 } } }, { body: page([post("1")]) }]);
  const store = memoryStore();
  const stats = await collectInstagramAccount({ username: "iloveyochi.us", config, ...store, fetchImpl, sleep: noSleep });
  assert.equal(stats.inserted, 1);
  assert.equal(fetchImpl.calls.length, 2);
});

test("network errors are retried a limited number of times, then reported as network", async () => {
  const fetchImpl = mockFetch([new TypeError("fetch failed")]);
  await assert.rejects(
    collectInstagramAccount({ username: "iloveyochi.us", config, ...memoryStore(), fetchImpl, sleep: noSleep }),
    (e) => e.kind === "network"
  );
  assert.equal(fetchImpl.calls.length, 3);
});

test("token never appears in error messages", async () => {
  const fetchImpl = mockFetch([{ status: 400, body: { error: { message: `bad token ${TOKEN} access_token=${TOKEN}`, code: 190 } } }]);
  await assert.rejects(
    collectInstagramAccount({ username: "iloveyochi.us", config, ...memoryStore(), fetchImpl, sleep: noSleep }),
    (e) => !e.message.includes(TOKEN) && e.message.includes("[REDACTED]")
  );
  assert.equal(redact(`x access_token=abc&y=1`), "x access_token=[REDACTED]&y=1");
});

test("rejects usernames that could inject Graph API fields", async () => {
  await assert.rejects(
    collectInstagramAccount({ username: "a){id}", config, ...memoryStore(), fetchImpl: mockFetch([]), sleep: noSleep }),
    (e) => e.kind === "config"
  );
});

test("readConfig requires token and numeric IG user ID; defaults version", () => {
  assert.throws(() => readConfig({}), (e) => e.kind === "config" && /META_ACCESS_TOKEN, INSTAGRAM_USER_ID/.test(e.message));
  assert.throws(() => readConfig({ META_ACCESS_TOKEN: "t", INSTAGRAM_USER_ID: "abc" }), (e) => e.kind === "config");
  const c = readConfig({ META_ACCESS_TOKEN: "t", INSTAGRAM_USER_ID: "17841402307485379" });
  assert.equal(c.apiVersion, "v26.0");
  assert.equal(c.maxPerAccount, 25);
});

test("classifyGraphError marks only transient errors retryable", () => {
  assert.equal(classifyGraphError(503, {}).retryable, true);
  assert.equal(classifyGraphError(400, { error: { code: 1 } }).retryable, true);
  assert.equal(classifyGraphError(400, { error: { code: 190 } }).retryable, false);
  assert.equal(classifyGraphError(400, { error: { code: 4 } }).retryable, false);
});
