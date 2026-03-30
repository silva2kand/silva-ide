const http = require("http");
const https = require("https");
const net = require("net");

const PORT = Number(process.env.SILVA_RESEARCH_PORT || 12095);
const SEARXNG_URL = (process.env.SEARXNG_URL || "").trim().replace(/\/+$/, "");

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload));
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error("Body too large"));
        try {
          req.destroy();
        } catch {}
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });

const canonicalizeUrl = (raw) => {
  try {
    const u = new URL(raw);
    u.hash = "";
    const drop = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "fbclid",
      "mc_cid",
      "mc_eid",
    ];
    drop.forEach((k) => u.searchParams.delete(k));
    return u.toString();
  } catch {
    return String(raw || "");
  }
};

const isPrivateIp = (ip) => {
  const parts = ip.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 0) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  return false;
};

const isBlockedHost = (hostname) => {
  const host = String(hostname || "").trim().toLowerCase();
  if (!host) return true;
  if (host === "localhost" || host === "0.0.0.0") return true;
  if (host === "::1" || host.endsWith(".local")) return true;
  const ipVersion = net.isIP(host);
  if (ipVersion === 4) return isPrivateIp(host);
  if (ipVersion === 6) return true;
  return false;
};

const sourceQualityScore = (urlStr) => {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    if (host.endsWith(".gov.uk") || host === "legislation.gov.uk") return 95;
    if (host.endsWith(".gov") || host.endsWith(".gov.au") || host.endsWith(".gov.in")) return 92;
    if (host.endsWith(".europa.eu") || host.endsWith(".who.int")) return 92;
    if (host.endsWith(".ac.uk") || host.endsWith(".edu")) return 88;
    if (host === "www.bbc.co.uk" || host.endsWith(".bbc.co.uk")) return 82;
    if (host === "www.reuters.com") return 82;
    if (host.endsWith("wikipedia.org")) return 75;
    return 60;
  } catch {
    return 40;
  }
};

const httpRequest = (urlStr, options = {}) =>
  new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      urlStr,
      {
        method: options.method || "GET",
        headers: options.headers || { "User-Agent": "SilvaDeepResearch/1.0" },
        timeout: options.timeoutMs || 12000,
      },
      (res) => {
        resolve(res);
      },
    );
    req.on("timeout", () => {
      try {
        req.destroy(new Error("timeout"));
      } catch {}
    });
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });

const readResponseBody = (res, maxBytes = 1_500_000) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    res.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("Response too large"));
        try {
          res.destroy();
        } catch {}
        return;
      }
      chunks.push(chunk);
    });
    res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    res.on("error", reject);
  });

const fetchText = async (urlStr, redirectBudget = 3) => {
  const res = await httpRequest(urlStr);
  const status = Number(res.statusCode || 0);
  const location = res.headers.location;
  if (status >= 300 && status < 400 && location && redirectBudget > 0) {
    const nextUrl = new URL(location, urlStr).toString();
    return fetchText(nextUrl, redirectBudget - 1);
  }
  const contentType = String(res.headers["content-type"] || "").toLowerCase();
  const body = await readResponseBody(res);
  return { status, contentType, body };
};

const stripHtml = (html) => {
  const cleaned = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|li|br|h1|h2|h3|h4|h5|h6)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned;
};

const extractTitle = (html) => {
  const m = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return "";
  return String(m[1] || "").replace(/\s+/g, " ").trim();
};

const searchSearxng = async ({ query, count, lang }) => {
  if (!SEARXNG_URL) {
    return { provider: "none", results: [], error: "SEARXNG_URL not set" };
  }
  const params = new URLSearchParams({ q: query, format: "json" });
  if (lang) params.set("language", lang);
  const url = `${SEARXNG_URL}/search?${params.toString()}`;
  const { status, body } = await fetchText(url);
  if (status !== 200) {
    return { provider: "searxng", results: [], error: `HTTP ${status}` };
  }
  const parsed = JSON.parse(body);
  const rawResults = Array.isArray(parsed.results) ? parsed.results : [];
  const normalized = rawResults.slice(0, count).map((r) => {
    const u = String(r.url || "");
    const canonicalUrl = canonicalizeUrl(u);
    return {
      title: String(r.title || ""),
      url: u,
      canonicalUrl,
      snippet: String(r.content || ""),
      engines: Array.isArray(r.engines) ? r.engines : [],
      score: typeof r.score === "number" ? r.score : 0,
      domain: (() => {
        try {
          return new URL(canonicalUrl).hostname;
        } catch {
          return "";
        }
      })(),
      sourceQuality: sourceQualityScore(canonicalUrl),
    };
  });
  return { provider: "searxng", results: normalized };
};

const searchDuckDuckGoHtml = async ({ query, count }) => {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const { status, body } = await fetchText(url);
  if (status !== 200) {
    return { provider: "duckduckgo", results: [], error: `HTTP ${status}` };
  }

  const results = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(body)) && results.length < count) {
    const href = String(m[1] || "");
    const title = String(m[2] || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    const canonicalUrl = canonicalizeUrl(href);
    results.push({
      title,
      url: href,
      canonicalUrl,
      snippet: "",
      engines: ["duckduckgo-html"],
      score: 0,
      domain: (() => {
        try {
          return new URL(canonicalUrl).hostname;
        } catch {
          return "";
        }
      })(),
      sourceQuality: sourceQualityScore(canonicalUrl),
    });
  }
  return { provider: "duckduckgo", results };
};

const dedupeAndRank = (items) => {
  const byUrl = new Map();
  for (const it of items) {
    const key = it.canonicalUrl || it.url;
    if (!key) continue;
    const prev = byUrl.get(key);
    if (!prev) {
      byUrl.set(key, it);
      continue;
    }
    const prevScore = (prev.sourceQuality || 0) + (prev.score || 0);
    const nextScore = (it.sourceQuality || 0) + (it.score || 0);
    if (nextScore > prevScore) byUrl.set(key, it);
  }
  const merged = Array.from(byUrl.values()).map((it) => ({
    ...it,
    rankScore: (it.sourceQuality || 0) + Math.min(50, Number(it.score || 0)),
  }));
  merged.sort((a, b) => (b.rankScore || 0) - (a.rankScore || 0));
  return merged;
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    if (url.pathname === "/health" && req.method === "GET") {
      sendJson(res, 200, { status: "ok", port: PORT });
      return;
    }

    if (url.pathname === "/research/health" && req.method === "GET") {
      sendJson(res, 200, {
        status: "ok",
        providers: {
          searxng: Boolean(SEARXNG_URL),
          duckduckgoHtml: true,
        },
      });
      return;
    }

    if (url.pathname === "/research/search" && (req.method === "GET" || req.method === "POST")) {
      const startedAt = Date.now();
      let query = String(url.searchParams.get("q") || "").trim();
      let count = Number(url.searchParams.get("count") || "10");
      let lang = String(url.searchParams.get("lang") || "").trim() || undefined;
      let provider = String(url.searchParams.get("provider") || "").trim().toLowerCase();

      if (req.method === "POST") {
        const body = await readBody(req);
        const parsed = body ? JSON.parse(body) : {};
        query = String(parsed.query || parsed.q || query || "").trim();
        count = Number(parsed.count ?? count);
        lang = String(parsed.lang || lang || "").trim() || undefined;
        provider = String(parsed.provider || provider || "").trim().toLowerCase();
      }

      if (!query) {
        sendJson(res, 400, { error: "Missing query" });
        return;
      }

      count = Number.isFinite(count) ? Math.max(1, Math.min(25, count)) : 10;
      const preferSearxng = Boolean(SEARXNG_URL) && provider !== "duckduckgo";

      const r = preferSearxng
        ? await searchSearxng({ query, count, lang })
        : await searchDuckDuckGoHtml({ query, count });

      const results = dedupeAndRank(r.results || []);

      sendJson(res, 200, {
        query,
        provider: r.provider,
        count: results.length,
        ms: Date.now() - startedAt,
        results: results.map((x) => ({
          title: x.title,
          url: x.url,
          canonicalUrl: x.canonicalUrl,
          snippet: x.snippet,
          domain: x.domain,
          engines: x.engines,
          sourceQuality: x.sourceQuality,
          rankScore: x.rankScore,
        })),
        error: r.error || undefined,
      });
      return;
    }

    if (url.pathname === "/research/read" && req.method === "GET") {
      const target = String(url.searchParams.get("url") || "").trim();
      if (!target) {
        sendJson(res, 400, { error: "Missing url" });
        return;
      }

      let u;
      try {
        u = new URL(target);
      } catch {
        sendJson(res, 400, { error: "Invalid url" });
        return;
      }

      if (!(u.protocol === "http:" || u.protocol === "https:")) {
        sendJson(res, 400, { error: "Only http/https allowed" });
        return;
      }

      if (isBlockedHost(u.hostname)) {
        sendJson(res, 403, { error: "Blocked host" });
        return;
      }

      const startedAt = Date.now();
      const { status, contentType, body } = await fetchText(u.toString());
      const title = extractTitle(body);
      const text = contentType.includes("html") ? stripHtml(body) : String(body || "").trim();

      sendJson(res, 200, {
        url: u.toString(),
        status,
        contentType,
        title,
        text,
        ms: Date.now() - startedAt,
      });
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    sendJson(res, 500, { error: String(err && err.message ? err.message : err) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`Silva Deep Research backend listening on http://127.0.0.1:${PORT}\n`);
});
