// pages/api/movies.js
import fetch from "node-fetch";

const GITHUB_TOKEN = "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";
const GITHUB_REPO = "tanbirst1/multi-movies-api";
const GITHUB_BRANCH = "main";
const NETLIFY_BASE = "https://comfy-souffle-dcb730.netlify.app/data/movies/";
const DEFAULT_FIRST_AIR = "Aug. 26, 2015";

export default async function handler(req, res) {
  try {
    // 1️⃣ Get all movie JSON filenames from GitHub repo
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/data/movies?ref=${GITHUB_BRANCH}`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}` },
    });
    const files = await r.json();
    const jsonFiles = files.filter(f => f.name.endsWith(".json")).map(f => f.name);

    // 2️⃣ Fetch all movie JSONs from Netlify
    const moviesData = await Promise.all(
      jsonFiles.map(async (file) => {
        try {
          const r = await fetch(NETLIFY_BASE + file);
          const data = await r.json();

          // Ensure last_updated exists
          const lastUpdated = data.last_updated || data.meta?.firstAirDate || DEFAULT_FIRST_AIR;

          return {
            title: data.title || "Unknown",
            link: data.link || "#",
            date_or_year: data.meta?.firstAirDate || "Unknown",
            rating: data.meta?.rating || "0",
            original_image: data.meta?.poster || null,
            last_updated: new Date(lastUpdated).toISOString(),
          };
        } catch (e) {
          console.error("Error fetching", file, e.message);
          return null;
        }
      })
    );

    // 3️⃣ Remove nulls and sort by last_updated descending
    const sortedMovies = moviesData
      .filter(Boolean)
      .sort((a, b) => new Date(b.last_updated) - new Date(a.last_updated));

    // 4️⃣ Return as "Recently added"
    res.status(200).json({ "Recently added": sortedMovies });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
