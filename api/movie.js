// pages/api/movies.js
const GITHUB_REPO = "tanbirst1/multi-movies-api";
const GITHUB_BRANCH = "main";
const DEFAULT_FIRST_AIR = "2015-08-26T00:00:00Z"; // fallback date

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
    } catch {
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
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
    });

    if (!ghResp.ok) {
      return res
        .status(500)
        .json({ error: `GitHub API error: ${ghResp.status}` });
    }

    const files = await ghResp.json();
    if (!Array.isArray(files)) {
      return res.status(500).json({ error: "Invalid GitHub API response" });
    }

    // ✅ Only JSON movie files
    const jsonFiles = files
      .filter((f) => f && f.type === "file" && f.name.endsWith(".json"))
      .map((f) => f.name);

    if (jsonFiles.length === 0) {
      return res.status(200).json({
        "Recently added": [],
        total: 0,
        total_pages: 0,
        page: 1,
      });
    }

    // ✅ 2. Get last commit date for a file
    async function getLastCommitDate(file) {
      const commitsUrl = `https://api.github.com/repos/${GITHUB_REPO}/commits?path=data/movies/${file}&sha=${GITHUB_BRANCH}&per_page=1`;
      try {
        const r = await fetchFn(commitsUrl, {
          headers: {
            ...(process.env.GITHUB_TOKEN
              ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
              : {}),
          },
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

    // ✅ 3. Collect lightweight metadata (title from filename + URL)
    const moviesData = [];
    for (const file of jsonFiles) {
      const commitDate = await getLastCommitDate(file);

      const title = file.replace(/\.json$/i, "").replace(/[-_]/g, " ");
      const link = `/data/movies/${file}`; // direct JSON link (frontend fetch full data)

      moviesData.push({
        title,
        url: link,
        last_updated: safeIsoDate(commitDate),
      });
    }

    // ✅ 4. Sort by last commit date
    const sortedMovies = moviesData.sort(
      (a, b) =>
        new Date(b.last_updated).getTime() -
        new Date(a.last_updated).getTime()
    );

    // ✅ 5. Search
    let filtered = sortedMovies;
    if (req.query.q) {
      const q = req.query.q.toLowerCase();
      filtered = sortedMovies.filter((m) =>
        m.title.toLowerCase().includes(q)
      );
    }

    // ✅ 6. Pagination
    const perPage = parseInt(req.query.limit || "20", 10);
    const page = parseInt(req.query.page || "1", 10);
    const total = filtered.length;
    const totalPages = Math.ceil(total / perPage);

    const start = (page - 1) * perPage;
    const end = start + perPage;
    const paginated = filtered.slice(start, end);

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
