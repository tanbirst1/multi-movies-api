import fetch from "node-fetch";

const GITHUB_OWNER = "tanbirst1";        // 🔹 change if different
const GITHUB_REPO = "multi-movies-api";  // 🔹 change if different
const DATA_FOLDERS = ["movies", "series"];
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Cache store
let cacheAll = null;
let cacheExpiry = 0;
let cacheByGenre = {};

async function fetchFolder(folder) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/${folder}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!resp.ok) {
    console.error("GitHub API error:", resp.status, await resp.text());
    return [];
  }

  let files = [];
  try {
    files = await resp.json();
  } catch {
    return [];
  }

  const results = [];
  for (const file of files) {
    if (!file.name.endsWith(".json")) continue;
    try {
      const f = await fetch(file.download_url);
      if (!f.ok) continue;
      const data = await f.json();
      results.push({
        rawUrl: file.download_url,
        meta: data.meta || {},
        scrapedFrom: data.scrapedFrom || null,
      });
    } catch (e) {
      console.error("Error parsing", file.name, e.message);
    }
  }
  return results;
}

export default async function handler(req, res) {
  try {
    const { genre } = req.query; // /api/category?genre=Action
    if (!genre) {
      return res.status(400).json({ error: "Missing ?genre parameter" });
    }

    const key = genre.toLowerCase();
    const now = Date.now();

    // 🔹 Return cached genre
    if (cacheByGenre[key] && now < cacheByGenre[key].expiry) {
      return res.status(200).json(cacheByGenre[key].data);
    }

    // 🔹 Refresh global cache if needed
    if (!cacheAll || now > cacheExpiry) {
      let all = [];
      for (const folder of DATA_FOLDERS) {
        const items = await fetchFolder(folder);
        all = [...all, ...items];
      }
      cacheAll = all;
      cacheExpiry = now + 1000 * 60 * 60; // 1 hour
      cacheByGenre = {}; // reset genre cache
    }

    // 🔹 Filter by genre name
    const filtered = cacheAll.filter(
      (item) =>
        Array.isArray(item.meta.genres) &&
        item.meta.genres.some(
          (g) => g.name && g.name.toLowerCase() === key
        )
    );

    const response = {
      ok: true,
      genre,
      count: filtered.length,
      results: filtered.map((f) => ({
        title: f.meta.title || "Untitled",
        poster: f.meta.poster || null,
        genres: f.meta.genres || [],
        scrapedFrom: f.scrapedFrom,
        rawUrl: f.rawUrl,
      })),
    };

    // 🔹 Save cache
    cacheByGenre[key] = {
      data: response,
      expiry: now + 1000 * 60 * 60,
    };

    return res.status(200).json(response);
  } catch (e) {
    console.error("Handler crash:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
}
