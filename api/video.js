// ---------- Helpers ----------
function readBaseURL() {
  // Base URL from environment or fallback
  const base = (process.env.BASE_URL || "").trim();
  if (/^https?:\/\//i.test(base)) return base.replace(/\/+$/, "");
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

async function fetchHTML(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; RexScraper/1.0; +https://rex-scraper.dev/)",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });

    if (!res.ok)
      throw new Error(`fetch failed (${res.status} ${res.statusText})`);

    return await res.text();
  } catch (err) {
    throw new Error(`fetch failed: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

// ---------- Parse HTML using regex ----------
function parseEpisodePage(html, pageUrl, siteRoot) {
  // Views
  let views = 0;
  const playerNoticeMatch = html.match(/id=["']playernotice["'].*?data-text=["']([^"']*)["']/i);
  if (playerNoticeMatch) {
    views = parseInt(playerNoticeMatch[1].replace(/\D/g, ""), 10) || 0;
  } else {
    const metaCounterMatch = html.match(/<meta\s+id=['"]dooplay-ajax-counter['"]\s+data-postid=['"](\d+)['"]/i);
    if (metaCounterMatch) views = parseInt(metaCounterMatch[1], 10) || 0;
  }

  // Options (basic extraction)
  const options = [];
  const optionRegex = /<li[^>]*data-type=['"]([^'"]*)['"][^>]*data-post=['"]([^'"]*)['"][^>]*data-nume=['"]([^'"]*)['"][^>]*>(.*?)<\/li>/gi;
  let m;
  while ((m = optionRegex.exec(html)) !== null) {
    const titleMatch = m[4].match(/<[^>]+class=['"]title['"][^>]*>(.*?)<\/[^>]+>/i);
    options.push({
      type: m[1] || "",
      post: m[2] || "",
      nume: m[3] || "",
      title: titleMatch ? titleMatch[1].trim() : "",
    });
  }

  // Iframe sources (old + new + uppercase)
  const sourcesSet = new Set();
  const iframeRegex = /<iframe[^>]+src=['"]([^'"]+)['"][^>]*>/gi;
  while ((m = iframeRegex.exec(html)) !== null) {
    let src = m[1];
    if (src && src !== "about:blank") {
      if (!/^https?:\/\//i.test(src)) src = toAbs(siteRoot, src);
      sourcesSet.add(src);
    }
  }

  return {
    ok: true,
    scrapedFrom: pageUrl,
    views,
    sources: Array.from(sourcesSet),
    options,
  };
}

// ---------- Handler ----------
module.exports = async function handler(req, res) {
  try {
    const q = req.query || {};
    const base = readBaseURL();

    let target = (q.url && String(q.url).trim()) || "";
    if (!target && q.slug) {
      const slug = String(q.slug).replace(/^\/+/, "").replace(/\/+$/, "");
      target = `${base}/${slug}`;
    }

    if (!target) {
      res
        .status(400)
        .json({ ok: false, error: "Missing target URL. Provide ?url= or ?slug=" });
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

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || "Unknown error",
    });
  }
};
