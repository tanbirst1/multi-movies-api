// api/h_movies.js
import fs from "fs";
import path from "path";

const BASE_URL = "https://multi-movies-api.vercel.app/api/page?path=/movies/";
const SLUG_URL = "https://multi-movies-api.vercel.app/api/tv.js?url=";

const DATA_DIR = path.join(process.cwd(), "data/movies/page");
const SLUG_DIR = path.join(process.cwd(), "data");

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed ${url}`);
  return res.json();
}

// Save file helper
function saveFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export default async function handler(req, res) {
  try {
    // Fetch latest movies from page 1
    const data = await fetchJSON(BASE_URL + "&page=1");
    const movies = data?.results || [];

    if (!movies.length) {
      return res.status(200).json({ ok: false, msg: "No movies found" });
    }

    // Load existing pages
    let allMovies = [];
    const files = fs.existsSync(DATA_DIR) ? fs.readdirSync(DATA_DIR) : [];
    files.forEach((file) => {
      const content = JSON.parse(
        fs.readFileSync(path.join(DATA_DIR, file), "utf-8")
      );
      allMovies.push(...content);
    });

    // Merge latest movies at top (avoid duplicates by link)
    const seen = new Set(allMovies.map((m) => m.link));
    const newMovies = movies.filter((m) => !seen.has(m.link));
    allMovies = [...newMovies, ...allMovies];

    // Split into pages of 20
    const pages = [];
    for (let i = 0; i < allMovies.length; i += 20) {
      pages.push(allMovies.slice(i, i + 20));
    }

    // Save to /data/movies/page/{n}.json
    pages.forEach((page, idx) => {
      const filePath = path.join(DATA_DIR, `${idx + 1}.json`);
      saveFile(filePath, page);
    });

    // Also fetch slug details for each new movie
    for (const movie of newMovies) {
      const slug = movie.link.split("/movies/")[1]?.replace("/", "");
      if (slug) {
        const slugData = await fetchJSON(SLUG_URL + movie.link);
        saveFile(path.join(SLUG_DIR, `${slug}.json`), slugData);
      }
    }

    return res.status(200).json({
      ok: true,
      msg: `Updated ${newMovies.length} new movies`,
      totalPages: pages.length,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e.message });
  }
  }
