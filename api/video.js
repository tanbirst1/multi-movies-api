const fs = require("fs");
const path = require("path");

// --------- Helpers ---------
function readBaseURL() {
  const envBase = (process.env.BASE_URL || "").trim();
  if (/^https?:\/\//i.test(envBase)) return envBase.replace(/\/+$/, "");
  try {
    const filePath = path.resolve(process.cwd(), "src", "baseurl.txt");
    if (fs.existsSync(filePath)) {
      const txt = fs.readFileSync(filePath, "utf8").trim();
      if (/^https?:\/\//i.test(txt)) return txt.replace(/\/+$/, "");
    }
  } catch (_) {}
  return "https://multimovies.pro";
}

function toAbs(base, href) {
  if (!href) return "";
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

async function fetchHTML(target, timeoutMs = 20000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const resp = await fetch(target, {
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; VercelScraper/2.0; +https://vercel.com/)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-encoding": "gzip, deflate, br",
      },
      signal: ac.signal,
    });
    if (!resp.ok)
      throw new Error(`Fetch failed ${resp.status} ${resp.statusText}`);
    return await resp.text();
  } finally {
    clearTimeout(t);
  }
}

function parseEpisodePage(html, pageUrl, siteRoot) {
  // Remove <script>, <style>, <link> (lighter string ops)
  html = html.replace(/<script[\s\S]*?<\/script>/gi, "")
             .replace(/<style[\s\S]*?<\/style>/gi, "")
             .replace(/<link[^>]+>/gi, "");

  // ---- Views ----
  let views = 0;
  const noticeMatch = html.match(/id=["']playernotice["'][^>]*data-text=["']([^"']+)/i);
  if (noticeMatch) {
    views = parseInt(noticeMatch[1].replace(/\D/g, ""), 10) || 0;
  }

  // ---- Player Options ----
  const options = [];
  const optionRegex = /<li[^>]*data-type=["']([^"']*)["'][^>]*data-post=["']([^"']*)["'][^>]*data-nume=["']([^"']*)["'][^>]*>(.*?)<\/li>/gi;
  let m;
  while ((m = optionRegex.exec(html))) {
    const inner = m[4].replace(/<[^>]+>/g, "").trim();
    options.push({
      type: m[1] || "",
      post: m[2] || "",
      nume: m[3] || "",
      title: inner || "",
    });
  }

  // ---- Iframe Sources ----
  const sources = [];
  const iframeRegex = /<iframe[^>]+(src|data-src|data-litespeed-src)=["']([^"']+)["'][^>]*>/gi;
  while ((m = iframeRegex.exec(html))) {
    let src = m[2];
    if (src && src !== "about:blank") {
      if (!/^https?:\/\//i.test(src)) src = toAbs(siteRoot, src);
      sources.push(src);
    }
  }

  return { ok: true, scrapedFrom: pageUrl, views, sources, options };
}

// --------- Handler ---------
module.exports = async function handler(req, res) {
  try {
    const q = req.query || {};
    const base = (q.base && String(q.base)) || readBaseURL();

    let target = (q.url && String(q.url).trim()) || "";

    // support ?slug=episodes/naruto-shippuden-1x1/
    if (!target && q.slug) {
      const slug = String(q.slug).replace(/^\/+/, "").replace(/\/+$/, "");
      target = `${base.replace(/\/+$/, "")}/${slug}`;
    }

    if (!target) {
      res.status(400).json({ ok: false, error: "Missing target URL. Provide ?url= or ?slug=" });
      return;
    }

    const siteRoot = (() => {
      try {
        return new URL(base || target).origin;
      } catch {
        return base || target;
      }
    })();

    const html = await fetchHTML(target);
    const data = parseEpisodePage(html, target, siteRoot);

    res.setHeader("cache-control", "s-maxage=500, stale-while-revalidate=600");
    res.status(200).json(data);
  } catch (err) {
    const dev = process.env.NODE_ENV !== "production";
    res.status(500).json({
      ok: false,
      error: err && err.message ? err.message : String(err),
      stack: dev ? (err && err.stack) : undefined,
    });
  }
};
