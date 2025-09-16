// pages/api/s.js
const GITHUB_REPO = "tanbirst1/multi-movies-api";
const GITHUB_BRANCH = "main";

// --- In-memory caches ---
let indexCache = { data: null, expiry: 0 };
let hotCache = new Map(); // query -> results
let dailyCache = { data: {}, expiry: 0 }; // popular/random cache reset every 24h
let popularity = {}; // query frequency

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

    const now = Date.now();

    // ✅ Reset daily cache every 24h
    if (!dailyCache.expiry || dailyCache.expiry < now) {
      dailyCache = { data: {}, expiry: now + 24 * 60 * 60 * 1000 };
      popularity = {}; // reset counters too
    }

    // ✅ Popularity tracking
    popularity[query] = (popularity[query] || 0) + 1;

    // ✅ Daily cache check
    if (dailyCache.data[query]) {
      return res.status(200).json({
        query,
        cached: "daily",
        total: dailyCache.data[query].length,
        results: dailyCache.data[query],
      });
    }

    // ✅ Hot cache check
    if (hotCache.has(query)) {
      return res.status(200).json({
        query,
        cached: "hot",
        total: hotCache.get(query).length,
        results: hotCache.get(query),
      });
    }

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
      // return at least filenames instantly (for live search)
      const instant = quickHits.map((f) => ({
        title: f.file.replace(/\.json$/i, ""),
        link: null,
        type: f.type,
        ratings: { info: "loading" },
        original_image: null,
      }));

      // fire async JSON fetches (not blocking live search)
      const fetched = await Promise.all(quickHits.map(fetchAndFormat));
      results.push(...fetched.filter(Boolean));

      // Save fallback instant response for live search
      if (results.length === 0) {
        return res.status(200).json({
          query,
          cached: "instant",
          total: instant.length,
          results: instant,
        });
      }
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

    // --- 5. Save in caches
    if (results.length > 0) {
      hotCache.set(query, results);
      dailyCache.data[query] = results;

      if (hotCache.size > 50) {
        hotCache.delete(hotCache.keys().next().value); // keep small
      }
    }

    // --- 6. Fallback suggestion slot (popular/random)
    if (results.length === 0) {
      const randomFile = index[Math.floor(Math.random() * index.length)];
      const suggestion = randomFile
        ? [{ title: randomFile.file.replace(/\.json$/i, ""), type: randomFile.type, link: null }]
        : [];
      return res.status(200).json({
        query,
        total: 0,
        results: [],
        suggestion,
        message: "No exact match, showing suggestion",
      });
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
