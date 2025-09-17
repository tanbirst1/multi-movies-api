import fetch from "node-fetch";

const GITHUB_OWNER = "tanbirst1";       // change to your username
const GITHUB_REPO = "multi-movies-api"; // change to your repo
const DATA_FOLDERS = ["movies", "series"]; // folders to scan
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Caches
let cacheAll = null;
let cacheExpiry = 0;
let cacheByGenre = {};

async function fetchFolder(folder) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/${folder}`;
  const resp = await fetch(url, {
    headers: { Authorization: `token ${GITHUB_TOKEN}` },
  });
  if (!resp.ok) return [];
  const files = await resp.json();

  const results = [];
  for (const file of files) {
    if (!file.name.endsWith(".json")) continue;
    try {
      const f = await fetch(file.download_url);
      const data = await f.json();
      results.push({
        url: file.download_url, // keep raw url
        ...data,
      });
    } catch (e) {
      console.error("Parse error:", file.name, e.message);
    }
  }
  return results;
}

export default async function handler(req, res) {
  try {
    const { genre } = req.query; // ?genre=Action
    if (!genre) {
      return res.status(400).json({ error: "Missing ?genre parameter" });
    }

    const key = genre.toLowerCase();
    const now = Date.now();

    // return cached genre if exists
    if (cacheByGenre[key] && now < cacheByGenre[key].expiry) {
      return res.status(200).json(cacheByGenre[key].data);
    }

    // refresh global cache if expired
    if (!cacheAll || now > cacheExpiry) {
      let all = [];
      for (const folder of DATA_FOLDERS) {
        const items = await fetchFolder(folder);
        all = [...all, ...items];
      }
      cacheAll = all;
      cacheExpiry = now + 1000 * 60 * 60; // 1 hour
      cacheByGenre = {};
    }

    // filter by genre name in meta.genres
    const filtered = cacheAll.filter(
      (item) =>
        item.meta &&
        item.meta.genres &&
        item.meta.genres.some((g) => g.name.toLowerCase() === key)
    );

    const response = {
      ok: true,
      genre,
      count: filtered.length,
      results: filtered.map((f) => ({
        title: f.meta?.title,
        poster: f.meta?.poster,
        genres: f.meta?.genres,
        scrapedFrom: f.scrapedFrom,
        rawUrl: f.url, // link to raw JSON
      })),
    };

    // save in per-genre cache
    cacheByGenre[key] = {
      data: response,
      expiry: now + 1000 * 60 * 60,
    };

    return res.status(200).json(response);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
