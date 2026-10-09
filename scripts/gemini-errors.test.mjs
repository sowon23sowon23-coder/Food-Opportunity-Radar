// Mock-response tests for scripts/gemini-errors.mjs.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyGeminiError, parseRetrySeconds } from "./gemini-errors.mjs";

// Shape of the real free-tier daily-cap error seen in GitHub Actions.
const dailyCap = {
  error: {
    code: 429,
    status: "RESOURCE_EXHAUSTED",
    message:
      "You exceeded your current quota, please check your plan and billing details.\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-3.6-flash\nPlease retry in 11h49m19.27s.",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [{ quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests", quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }],
      },
      { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "42559s" },
    ],
  },
};

test("free-tier daily cap → quota_exhausted (stop the run)", () => {
  const e = classifyGeminiError(429, dailyCap);
  assert.equal(e.kind, "quota_exhausted");
  assert.equal(e.retryAfterSeconds, 42559);
});

test("daily cap without details is still detected from the long retry time in the message", () => {
  const e = classifyGeminiError(429, { error: { message: dailyCap.error.message } });
  assert.equal(e.kind, "quota_exhausted");
  assert.ok(e.retryAfterSeconds > 11 * 3600);
});

test("per-minute limit with a short retry delay → rate_limited (wait and retry)", () => {
  const e = classifyGeminiError(429, {
    error: {
      status: "RESOURCE_EXHAUSTED",
      message: "Quota exceeded for metric: requests per minute",
      details: [
        { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }] },
        { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "21s" },
      ],
    },
  });
  assert.equal(e.kind, "rate_limited");
  assert.equal(e.retryAfterSeconds, 21);
});

test("429 with no retry hint → quota_exhausted (don't guess)", () => {
  assert.equal(classifyGeminiError(429, { error: { message: "Resource exhausted" } }).kind, "quota_exhausted");
});

test("503 high demand → overloaded (retry with backoff)", () => {
  const e = classifyGeminiError(503, { error: { message: "This model is currently experiencing high demand." } });
  assert.equal(e.kind, "overloaded");
});

test("other errors are not retried", () => {
  assert.equal(classifyGeminiError(400, { error: { message: "Invalid argument" } }).kind, "other");
});

test("parseRetrySeconds handles h/m/s and plain seconds", () => {
  assert.equal(parseRetrySeconds({ message: "Please retry in 1h2m3s." }), 3723);
  assert.equal(parseRetrySeconds({ message: "Please retry in 30.5s." }), 30.5);
  assert.equal(parseRetrySeconds({ message: "no hint" }), null);
});
