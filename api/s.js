// pages/api/s.js
const GITHUB_REPO = "tanbirst1/multi-movies-api";
const GITHUB_BRANCH = "main";

function normalizeText(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD") // remove accents
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ") // remove special chars
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

    // --- 1. Get all files from movies + series folders
    async function listFiles(folder) {
      const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/data/${folder}?ref=${GITHUB_BRANCH}`;
      const resp = await fetchFn(url, {
        headers: {
          Accept: "application/vnd.github.v3+json",
          ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
        },
      });
      if (!resp.ok) return [];
      const files = await resp.json();
      return files.filter((f) => f.type === "file" && f.name.endsWith(".json")).map((f) => f.name);
    }

    const [movieFiles, seriesFiles] = await Promise.all([listFiles("movies"), listFiles("series")]);

    // --- 2. Helper to fetch and search JSON
    async function searchFiles(files, folder, type) {
      const results = [];
      for (const file of files) {
        const normalizedFile = normalizeText(file.replace(/\.json$/i, ""));
        if (!normalizedFile.includes(query)) {
          // check inside JSON only if filename not matched
          const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/data/${folder}/${file}`;
          try {
            const r = await fetchFn(rawUrl);
            if (!r.ok) continue;
            const txt = await r.text();
            if (!normalizeText(txt).includes(query)) continue;

            // parse only matched
            const data = JSON.parse(txt);
            results.push(formatResult(data, file, type));
          } catch {
            continue;
          }
        } else {
          // quick hit by filename → fetch JSON
          const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/data/${folder}/${file}`;
          try {
            const r = await fetchFn(rawUrl);
            if (!r.ok) continue;
            const data = await r.json();
            results.push(formatResult(data, file, type));
          } catch {
            continue;
          }
        }
      }
      return results;
    }

    // --- 3. Format result
    function formatResult(data, file, type) {
      const title = data.title || data.name || file.replace(/\.json$/i, "");
      const link = data.scrapedFrom || data.link || "#";
      const original_image = data.meta?.poster || data.poster || null;
      const ratings = {};
      if (data["IMDb Rating"]) ratings.imdb = data["IMDb Rating"];
      if (data["TMDb Rating"]) ratings.tmdb = data["TMDb Rating"];
      if (data.rating) ratings.other = data.rating;
      return {
        title,
        link,
        type,
        ratings: Object.keys(ratings).length ? ratings : { info: "Unknown" },
        original_image,
      };
    }

    // --- 4. Run search on both
    const [movieResults, seriesResults] = await Promise.all([
      searchFiles(movieFiles, "movies", "movie"),
      searchFiles(seriesFiles, "series", "series"),
    ]);

    const finalResults = [...movieResults, ...seriesResults];

    res.status(200).json({
      query,
      total: finalResults.length,
      results: finalResults,
    });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: err.message });
  }
}
