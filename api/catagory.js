import fetch from "node-fetch";

const GITHUB_OWNER = "tanbirst1"; // change to your username
const GITHUB_REPO = "multi-movies-api"; // change to your repo name
const DATA_FOLDERS = ["movies", "series"];
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Caches
let cacheAll = null;
let cacheExpiry = 0;
let cacheByGenre = {};

async function fetchFromGitHub(folder) {
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
      results.push(data);
    } catch (e) {
      console.error("Error parsing", file.name, e.message);
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

    // return cached genre result if exists
    if (cacheByGenre[key] && now < cacheByGenre[key].expiry) {
      return res.status(200).json(cacheByGenre[key].data);
    }

    // refresh global cache if expired
    if (!cacheAll || now > cacheExpiry) {
      let all = [];
      for (const folder of DATA_FOLDERS) {
        const items = await fetchFromGitHub(folder);
        all = [...all, ...items];
      }
      cacheAll = all;
      cacheExpiry = now + 1000 * 60 * 60; // 1 hour cache
      cacheByGenre = {}; // reset genre cache
    }

    // filter by genre
    const filtered = cacheAll.filter(
      (item) =>
        item.genre &&
        item.genre.some((g) => g.toLowerCase() === key)
    );

    const response = {
      ok: true,
      genre,
      count: filtered.length,
      results: filtered,
    };

    // save per-genre cache
    cacheByGenre[key] = {
      data: response,
      expiry: now + 1000 * 60 * 60, // 1 hour
    };

    return res.status(200).json(response);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
