// Instagram competitor post collection via the Meta Graph API Business
// Discovery endpoint. Used by collect.mjs for sources with
// collection_method = 'instagram_graph' (identifier = Instagram username).
//
// Network, storage and sleep are injected so the logic can be tested with
// mock responses (see instagram.test.mjs) without a real token.

const GRAPH_BASE = "https://graph.facebook.com";
const PAGE_SIZE = 25;
// Instagram lets accounts pin up to 3 posts at the top of the feed, and pinned
// posts can be old. Only stop paging after this many known posts in a row.
const STOP_AFTER_KNOWN = 3;
const MAX_RETRIES = 2;

export class InstagramError extends Error {
  // kind: config | auth_expired | permission | account_not_found | rate_limit | transient | network | api
  constructor(kind, message, { retryable = false } = {}) {
    super(message);
    this.name = "InstagramError";
    this.kind = kind;
    this.retryable = retryable;
  }
}

export function readConfig(env = process.env) {
  const accessToken = env.META_ACCESS_TOKEN?.trim();
  const igUserId = env.INSTAGRAM_USER_ID?.trim();
  const apiVersion = env.META_GRAPH_API_VERSION?.trim() || "v26.0";
  const maxPerAccount = Number.parseInt(env.INSTAGRAM_MAX_POSTS_PER_ACCOUNT ?? "", 10) || 25;
  const missing = [!accessToken && "META_ACCESS_TOKEN", !igUserId && "INSTAGRAM_USER_ID"].filter(Boolean);
  if (missing.length) throw new InstagramError("config", `${missing.join(", ")} not set`);
  if (!/^\d+$/.test(igUserId)) throw new InstagramError("config", "INSTAGRAM_USER_ID must be numeric");
  if (!/^v\d+\.\d+$/.test(apiVersion)) throw new InstagramError("config", "META_GRAPH_API_VERSION must look like v26.0");
  return { accessToken, igUserId, apiVersion, maxPerAccount };
}

// Never let the token reach logs or the sources.last_error column.
export function redact(message, token) {
  let out = String(message ?? "");
  if (token) out = out.split(token).join("[REDACTED]");
  return out.replace(/access_token=[^&\s"]+/gi, "access_token=[REDACTED]");
}

export function buildDiscoveryUrl({ apiVersion, igUserId }, username, limit, after) {
  const media = `media.limit(${limit})${after ? `.after(${after})` : ""}{id,caption,permalink,timestamp}`;
  const fields = `business_discovery.username(${username}){username,${media}}`;
  return `${GRAPH_BASE}/${apiVersion}/${igUserId}?fields=${encodeURIComponent(fields)}`;
}

// Map a Graph API error body / HTTP status to an InstagramError.
// https://developers.facebook.com/docs/graph-api/guides/error-handling
export function classifyGraphError(status, body) {
  const err = body?.error ?? {};
  const code = Number(err.code);
  const sub = Number(err.error_subcode);
  const msg = `${err.message ?? `HTTP ${status}`}${code ? ` (code ${code}${sub ? `/${sub}` : ""})` : ""}`;

  if (code === 190 || code === 102) {
    return new InstagramError("auth_expired", `access token invalid or expired — ${msg}`);
  }
  if (code === 10 || (code >= 200 && code <= 299)) {
    return new InstagramError("permission", `missing permission — ${msg}`);
  }
  if ([4, 17, 32, 613, 80002].includes(code) || status === 429) {
    // App/user/BUC rate limits reset over an hour; retrying now just burns quota.
    return new InstagramError("rate_limit", `rate limited — ${msg}`);
  }
  if (code === 110 || sub === 2207013 || (code === 100 && /username|business_discovery|cannot be found|does not exist/i.test(err.message ?? ""))) {
    return new InstagramError("account_not_found", `account not found or not a Business/Creator account — ${msg}`);
  }
  if (code === 1 || code === 2 || err.is_transient || status >= 500) {
    return new InstagramError("transient", `temporary Meta error — ${msg}`, { retryable: true });
  }
  return new InstagramError("api", msg);
}

async function graphGet(url, { accessToken, fetchImpl, sleep, log }) {
  for (let attempt = 0; ; attempt++) {
    let error;
    try {
      // Token goes in a header, never the URL, so it can't leak via logged URLs.
      const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      const body = await res.json().catch(() => ({}));
      if (res.ok && !body.error) return body;
      error = classifyGraphError(res.status, body);
    } catch (e) {
      error = e instanceof InstagramError ? e : new InstagramError("network", `network error — ${e.message}`, { retryable: true });
    }
    error.message = redact(error.message, accessToken);
    if (!error.retryable || attempt >= MAX_RETRIES) throw error;
    const wait = 2000 * 2 ** attempt;
    log?.(`  retry ${attempt + 1}/${MAX_RETRIES} after ${wait / 1000}s — ${error.message}`);
    await sleep(wait);
  }
}

// Fetch new posts for one account, newest first, and store them.
// knownIds: Set of media IDs already stored for this account.
// insertPost(post) -> "inserted" | "duplicate"
export async function collectInstagramAccount({ username, config, knownIds, insertPost, fetchImpl = fetch, sleep, log }) {
  if (!/^[A-Za-z0-9._]{1,30}$/.test(username ?? "")) {
    throw new InstagramError("config", `invalid Instagram username in sources.identifier: ${JSON.stringify(username)}`);
  }
  sleep ??= (ms) => new Promise((r) => setTimeout(r, ms));

  const stats = { fetched: 0, inserted: 0, duplicates: 0, pages: 0, stoppedAt: "end of feed" };
  let after = null;
  let knownStreak = 0;

  while (stats.fetched < config.maxPerAccount) {
    const limit = Math.min(PAGE_SIZE, config.maxPerAccount - stats.fetched);
    const body = await graphGet(buildDiscoveryUrl(config, username, limit, after), {
      accessToken: config.accessToken,
      fetchImpl,
      sleep,
      log,
    });
    stats.pages++;
    const discovery = body.business_discovery;
    if (!discovery) throw new InstagramError("account_not_found", `no business_discovery result for @${username}`);
    const media = discovery.media?.data ?? [];

    for (const item of media) {
      if (stats.fetched >= config.maxPerAccount) break;
      stats.fetched++;
      if (knownIds.has(item.id)) {
        stats.duplicates++;
        if (++knownStreak >= STOP_AFTER_KNOWN) {
          stats.stoppedAt = "reached already-collected posts";
          return stats;
        }
        continue;
      }
      knownStreak = 0;
      const result = await insertPost({
        id: item.id,
        username: discovery.username ?? username,
        caption: item.caption ?? "",
        permalink: item.permalink ?? `https://www.instagram.com/${username}/`,
        timestamp: item.timestamp ?? null,
      });
      if (result === "duplicate") stats.duplicates++;
      else {
        stats.inserted++;
        knownIds.add(item.id);
      }
    }

    after = discovery.media?.paging?.cursors?.after;
    if (!after || media.length === 0) return stats;
  }
  stats.stoppedAt = `per-run limit (${config.maxPerAccount})`;
  return stats;
}

// Shape stored in raw_contents for one post.
export function toRawContentRow(sourceId, post, hash) {
  return {
    source_id: sourceId,
    content_type: "instagram_post",
    external_id: post.id,
    title: `@${post.username} Instagram post`,
    url: post.permalink,
    content_text: post.caption,
    content_hash: hash(`${post.id}\n${post.caption}`),
    published_at: post.timestamp,
  };
}
