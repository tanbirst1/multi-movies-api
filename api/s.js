// pages/api/s.js
const GITHUB_REPO = "tanbirst1/multi-movies-api";
const GITHUB_BRANCH = "main";

// --- In-memory caches ---
let indexCache = { data: null, expiry: 0 };
let hotCache = new Map(); // query -> results
let popularity = {}; // track query frequency

function normalizeText(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default async function handler(req, res) {
  let fetchFn = globalThis.fetch;
  if (!fetchFn) {
    const nf = await import("node-fetch");
    fetchFn = nf.default || nf;
  }

  try {
    const query = normalizeText(req.query.q || "");
    if (!query) {
      return res.status(400).json({ error: "Missing ?q=searchTerm" });
    }

    // ✅ Popularity tracking
    popularity[query] = (popularity[query] || 0) + 1;

    // ✅ Hot cache check
    if (hotCache.has(query)) {
      return res.status(200).json({
        query,
        cached: true,
        total: hotCache.get(query).length,
        results: hotCache.get(query),
      });
    }

    const now = Date.now();

    // --- 1. Build/load index.json (cached 5 mins)
    if (!indexCache.data || indexCache.expiry < now) {
      const folders = ["movies", "series"];
      const index = [];

      async function listFiles(folder) {
        const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/data/${folder}?ref=${GITHUB_BRANCH}`;
        const resp = await fetchFn(url, {
          headers: {
            Accept: "application/vnd.github.v3+json",
            ...(process.env.GITHUB_TOKEN
              ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
              : {}),
          },
        });
        if (!resp.ok) return [];
        const files = await resp.json();
        return files
          .filter((f) => f.type === "file" && f.name.endsWith(".json"))
          .map((f) => ({
            file: f.name,
            folder,
            type: folder === "movies" ? "movie" : "series",
            norm: normalizeText(f.name.replace(/\.json$/i, "")),
          }));
      }

      const [movieFiles, seriesFiles] = await Promise.all([
        listFiles("movies"),
        listFiles("series"),
      ]);
      indexCache = {
        data: [...movieFiles, ...seriesFiles],
        expiry: now + 5 * 60 * 1000,
      };
    }

    const index = indexCache.data;

    // --- 2. Filename/quick lookup
    const quickHits = index.filter((f) => f.norm.includes(query));

    // --- 3. Fetch & format JSON for quick hits
    async function fetchAndFormat(fileObj) {
      const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/data/${fileObj.folder}/${fileObj.file}`;
      try {
        const r = await fetchFn(rawUrl);
        if (!r.ok) return null;
        const data = await r.json();
        return formatResult(data, fileObj);
      } catch {
        return null;
      }
    }

    const results = [];
    if (quickHits.length > 0) {
      const fetched = await Promise.all(quickHits.map(fetchAndFormat));
      results.push(...fetched.filter(Boolean));
    }

    // --- 4. Fallback: deep scan if no hits
    if (results.length === 0) {
      for (const fileObj of index) {
        try {
          const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/data/${fileObj.folder}/${fileObj.file}`;
          const r = await fetchFn(rawUrl);
          if (!r.ok) continue;
          const txt = await r.text();
          if (!normalizeText(txt).includes(query)) continue;

          const data = JSON.parse(txt);
          results.push(formatResult(data, fileObj));
        } catch {
          continue;
        }
      }
    }

    // --- 5. Cache hot queries (top results only)
    hotCache.set(query, results);
    if (hotCache.size > 50) {
      // keep cache small
      hotCache.delete(hotCache.keys().next().value);
    }

    res.status(200).json({
      query,
      cached: false,
      popular: popularity[query],
      total: results.length,
      results,
    });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: err.message });
  }
}

// --- Helper: format result
function formatResult(data, fileObj) {
  const title = data.title || data.name || fileObj.file.replace(/\.json$/i, "");
  const link = data.scrapedFrom || data.link || "#";
  const original_image = data.meta?.poster || data.poster || null;

  const ratings = {};
  if (data["IMDb Rating"]) ratings.imdb = data["IMDb Rating"];
  if (data["TMDb Rating"]) ratings.tmdb = data["TMDb Rating"];
  if (data.rating) ratings.other = data.rating;

  return {
    title,
    link,
    type: fileObj.type,
    ratings: Object.keys(ratings).length ? ratings : { info: "Unknown" },
    original_image,
  };
}
