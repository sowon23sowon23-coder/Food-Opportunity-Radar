// Classify Gemini API errors so extract.mjs can decide whether to retry,
// wait, or stop the whole run. Kept separate from extract.mjs (which runs on
// import) so it can be unit-tested with mock error bodies.

// Longer waits than this aren't worth holding a CI job open for — treat as
// "quota exhausted for now" and let the next scheduled run continue.
const MAX_WAIT_SECONDS = 90;

export class GeminiError extends Error {
  // kind: quota_exhausted | rate_limited | model_unavailable | overloaded | other
  constructor(kind, message, { retryAfterSeconds = null } = {}) {
    super(message);
    this.name = "GeminiError";
    this.kind = kind;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// "42680s" / "1.5s" (RetryInfo.retryDelay) or "retry in 11h49m19.27s" (message text).
export function parseRetrySeconds(error) {
  const retryInfo = (error?.details ?? []).find((d) => String(d["@type"] ?? "").endsWith("RetryInfo"));
  const fromDetails = retryInfo?.retryDelay?.match(/^([\d.]+)s$/);
  if (fromDetails) return Number(fromDetails[1]);

  const m = String(error?.message ?? "").match(/retry in\s+(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:([\d.]+)s)?/i);
  if (m && (m[1] || m[2] || m[3])) return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return null;
}

export function classifyGeminiError(status, body) {
  const error = body?.error ?? {};
  const message = error.message || `HTTP ${status}`;
  const isQuotaStatus = status === 429 || error.status === "RESOURCE_EXHAUSTED";

  if (isQuotaStatus) {
    const retryAfterSeconds = parseRetrySeconds(error);
    const quotaIds = (error.details ?? [])
      .flatMap((d) => d.violations ?? [])
      .map((v) => `${v.quotaId ?? ""} ${v.quotaMetric ?? ""}`)
      .join(" ");
    const daily = /PerDay/i.test(quotaIds) || /per day|daily/i.test(message);
    if (daily || retryAfterSeconds === null || retryAfterSeconds > MAX_WAIT_SECONDS) {
      return new GeminiError("quota_exhausted", message, { retryAfterSeconds });
    }
    return new GeminiError("rate_limited", message, { retryAfterSeconds });
  }
  // Retired or unknown model name (e.g. "no longer available to new users").
  if (status === 404) {
    return new GeminiError("model_unavailable", message);
  }
  if (status === 503 || status === 500 || /high demand|overloaded/i.test(message)) {
    return new GeminiError("overloaded", message);
  }
  return new GeminiError("other", message);
}
