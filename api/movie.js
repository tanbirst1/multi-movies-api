// pages/api/movies.js
const GITHUB_REPO = "tanbirst1/multi-movies-api";
const GITHUB_BRANCH = "main";
const NETLIFY_BASE = "https://stellular-dango-34f9ba.netlify.app/data/movies/";
const DEFAULT_FIRST_AIR = "2015-08-26T00:00:00Z"; // safe ISO fallback

// --- Simple in-memory cache ---
let cache = { data: null, expiry: 0 };

function safeIsoDate(input) {
  const d = new Date(input || DEFAULT_FIRST_AIR);
  if (isNaN(d.getTime())) return new Date(DEFAULT_FIRST_AIR).toISOString();
  return d.toISOString();
}

export default async function handler(req, res) {
  let fetchFn = globalThis.fetch;
  if (!fetchFn) {
    try {
      const nf = await import("node-fetch");
      fetchFn = nf.default || nf;
    } catch (e) {
      return res.status(500).json({ error: "No fetch available" });
    }
  }

  try {
    const forceRefresh = "rs" in req.query;
    const now = Date.now();

    // ✅ Serve from cache if valid
    if (!forceRefresh && cache.data && cache.expiry > now) {
      return res.status(200).json(cache.data);
    }

    // ✅ 1. Get file list from GitHub
    const ghUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/data/movies?ref=${GITHUB_BRANCH}`;
    const ghResp = await fetchFn(ghUrl, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
    });

    if (!ghResp.ok) {
      return res.status(500).json({ error: `GitHub API error: ${ghResp.status}` });
    }

    const files = await ghResp.json();
    if (!Array.isArray(files)) {
      return res.status(500).json({ error: "Invalid GitHub API response" });
    }

    const jsonFiles = files
      .filter((f) => f && f.type === "file" && f.name.endsWith(".json"))
      .map((f) => f.name);

    if (jsonFiles.length === 0) {
      return res.status(200).json({ "Recently added": [], total: 0, total_pages: 0, page: 1 });
    }

    // ✅ 2. Get last commit date
    async function getLastCommitDate(file) {
      const commitsUrl = `https://api.github.com/repos/${GITHUB_REPO}/commits?path=data/movies/${file}&sha=${GITHUB_BRANCH}&per_page=1`;
      try {
        const r = await fetchFn(commitsUrl, {
          headers: { ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
        });
        if (r.ok) {
          const data = await r.json();
          return data[0]?.commit?.committer?.date || DEFAULT_FIRST_AIR;
        }
      } catch (e) {
        console.warn("Commit fetch failed for", file, e.message);
      }
      return DEFAULT_FIRST_AIR;
    }

    // ✅ 3. Fetch JSON (Netlify → GitHub raw)
    async function fetchMovieJson(file) {
      const netlifyUrl = `${NETLIFY_BASE}${encodeURIComponent(file)}`;
      try {
        const r = await fetchFn(netlifyUrl, { cache: "no-store" });
        if (r.ok) return await r.json();
      } catch {}
      const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/data/movies/${encodeURIComponent(file)}`;
      try {
        const r2 = await fetchFn(rawUrl, { cache: "no-store" });
        if (r2.ok) return await r2.json();
      } catch {}
      return null;
    }

    // ✅ 4. Collect metadata
    const moviesData = [];
    for (const file of jsonFiles) {
      const [commitDate, data] = await Promise.all([getLastCommitDate(file), fetchMovieJson(file)]);
      if (!data) continue;

      const title = data.title || data.name || file.replace(/\.json$/i, "");
      const link = data.scrapedFrom || data.link || "#";
      const date_or_year = data.meta?.firstAirDate || data.year || "Unknown";
      const rating = data.meta?.rating || data.rating || "0";
      const original_image = data.meta?.poster || data.poster || null;

      moviesData.push({
        title,
        link,
        date_or_year,
        rating: String(rating),
        original_image,
        last_updated: safeIsoDate(commitDate),
      });
    }

    // ✅ 5. Sort by last commit date
    const sortedMovies = moviesData.sort(
      (a, b) => new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime()
    );

    // ✅ 6. Pagination
    const perPage = parseInt(req.query.limit || "20", 10);
    const page = parseInt(req.query.page || "1", 10);
    const total = sortedMovies.length;
    const totalPages = Math.ceil(total / perPage);

    const start = (page - 1) * perPage;
    const end = start + perPage;
    const paginated = sortedMovies.slice(start, end);

    const responseData = {
      total,
      total_pages: totalPages,
      page,
      per_page: perPage,
      "Recently added": paginated,
    };

    // ✅ Save to cache for 5 minutes
    cache = { data: responseData, expiry: now + 5 * 60 * 1000 };

    res.status(200).json(responseData);
  } catch (err) {
    console.error("Handler error:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
}
