// pages/api/movies.js
const GITHUB_REPO = "tanbirst1/multi-movies-api";
const GITHUB_BRANCH = "main";
const NETLIFY_BASE = "https://stellular-dango-34f9ba.netlify.app/data/movies/";
const DEFAULT_FIRST_AIR = "2015-08-26T00:00:00Z"; // safe ISO fallback

function safeIsoDate(input) {
  const d = new Date(input || DEFAULT_FIRST_AIR);
  if (isNaN(d.getTime())) return new Date(DEFAULT_FIRST_AIR).toISOString();
  return d.toISOString();
}

export default async function handler(req, res) {
  // ensure fetch exists (try dynamic import if not)
  let fetchFn = globalThis.fetch;
  if (!fetchFn) {
    try {
      const nf = await import("node-fetch");
      fetchFn = nf.default || nf;
    } catch (e) {
      console.error("No fetch available and node-fetch import failed:", e);
      res.status(500).json({ error: "Server missing fetch and cannot import node-fetch" });
      return;
    }
  }

  try {
    const ghUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/data/movies?ref=${GITHUB_BRANCH}`;
    const ghResp = await fetchFn(ghUrl, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
      },
    });

    if (!ghResp.ok) {
      // allow 404 -> empty list, but surface other errors for debugging
      const msg = `GitHub API responded ${ghResp.status} ${ghResp.statusText}`;
      console.warn(msg);
      if (ghResp.status !== 404) {
        // try to read body for extra info
        let bodyText = "";
        try { bodyText = await ghResp.text(); } catch {}
        throw new Error(`${msg} - ${bodyText}`);
      }
      // 404 -> no files
      return res.status(200).json({ "Recently added": [] });
    }

    const files = await ghResp.json();
    if (!Array.isArray(files)) {
      throw new Error("GitHub API returned non-array response: " + JSON.stringify(files).slice(0, 500));
    }

    // only accept real files with .json
    const jsonFiles = files
      .filter((f) => f && f.type === "file" && typeof f.name === "string" && f.name.endsWith(".json"))
      .map((f) => f.name);

    if (jsonFiles.length === 0) {
      return res.status(200).json({ "Recently added": [] });
    }

    // helper: try Netlify first, fallback to raw.githubusercontent.com
    async function fetchMovieJson(file) {
      const netlifyUrl = `${NETLIFY_BASE}${encodeURIComponent(file)}`;
      try {
        const r = await fetchFn(netlifyUrl, { cache: "no-store" });
        if (r.ok) {
          const ct = (r.headers.get("content-type") || "").toLowerCase();
          if (ct.includes("application/json")) {
            return await r.json();
          }
          // try parse text as JSON as a last resort
          const txt = await r.text();
          try { return JSON.parse(txt); } catch (e) { /* fallthrough to fallback */ }
        } else {
          console.warn(`Netlify fetch failed for ${file}: ${r.status}`);
        }
      } catch (e) {
        console.warn(`Netlify fetch error for ${file}: ${e?.message || e}`);
      }

      // fallback to raw.githubusercontent
      const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/data/movies/${encodeURIComponent(file)}`;
      try {
        const r2 = await fetchFn(rawUrl, { cache: "no-store" });
        if (r2.ok) {
          const ct2 = (r2.headers.get("content-type") || "").toLowerCase();
          if (ct2.includes("application/json")) {
            return await r2.json();
          }
          const txt2 = await r2.text();
          try { return JSON.parse(txt2); } catch (e) { console.warn(`Raw parse JSON failed for ${file}`, e?.message || e); }
        } else {
          console.warn(`Raw GitHub fetch failed for ${file}: ${r2.status}`);
        }
      } catch (e) {
        console.warn(`Raw GitHub fetch error for ${file}: ${e?.message || e}`);
      }

      return null;
    }

    // process in small batches to avoid blowing memory/time on serverless
    const BATCH = 8;
    const moviesData = [];
    for (let i = 0; i < jsonFiles.length; i += BATCH) {
      const batch = jsonFiles.slice(i, i + BATCH);
      const batchResults = await Promise.all(
        batch.map(async (file) => {
          try {
            const data = await fetchMovieJson(file);
            if (!data || typeof data !== "object") {
              console.warn("Skipping file (no JSON):", file);
              return null;
            }

            // pick reasonable fields with fallbacks
            const title = data.title || data.name || "Unknown";
            const link = data.link || data.url || "#";
            const date_or_year = data.meta?.firstAirDate || data.year || data.date || "Unknown";
            const rating = (data.meta && (data.meta.rating ?? data.meta.ratings)) || data.rating || "0";
            const original_image = data.meta?.poster || data.poster || data.image || null;

            // safe last_updated selection
            const lastCandidate =
              data.last_updated ||
              data.updated_at ||
              data.meta?.lastUpdated ||
              data.meta?.firstAirDate ||
              data.published ||
              DEFAULT_FIRST_AIR;

            return {
              title,
              link,
              date_or_year,
              rating: String(rating),
              original_image,
              last_updated: safeIsoDate(lastCandidate),
            };
          } catch (e) {
            console.error("Error processing file:", file, e?.message || e);
            return null;
          }
        })
      );
      moviesData.push(...batchResults);
    }

    const sortedMovies = moviesData
      .filter(Boolean)
      .sort((a, b) => new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime());

    res.setHeader("Content-Type", "application/json");
    res.status(200).json({ "Recently added": sortedMovies });
  } catch (err) {
    console.error("Handler error:", err?.message || err);
    res.status(500).json({ error: (err && err.message) || String(err) });
  }
}
