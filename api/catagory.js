import fs from "fs";
import path from "path";

// Small cache to avoid re-reading files on every request
let cache = null;
let cacheExpiry = 0;

export default async function handler(req, res) {
  try {
    const { genre } = req.query; // ?genre=Action
    if (!genre) {
      return res.status(400).json({ error: "Missing ?genre parameter" });
    }

    const now = Date.now();
    if (!cache || now > cacheExpiry) {
      const baseDir = path.join(process.cwd(), "data");

      const loadFolder = (folder) => {
        const folderPath = path.join(baseDir, folder);
        if (!fs.existsSync(folderPath)) return [];
        return fs.readdirSync(folderPath)
          .filter(f => f.endsWith(".json"))
          .map(f => {
            const filePath = path.join(folderPath, f);
            try {
              return JSON.parse(fs.readFileSync(filePath, "utf-8"));
            } catch {
              return null;
            }
          })
          .filter(Boolean);
      };

      const movies = loadFolder("movies");
      const series = loadFolder("series");

      cache = [...movies, ...series];
      cacheExpiry = now + 1000 * 60 * 60; // 1 hour cache
    }

    // Filter by genre
    const filtered = cache.filter(item =>
      item.genre &&
      item.genre.some(g => g.toLowerCase() === genre.toLowerCase())
    );

    return res.status(200).json({
      ok: true,
      genre,
      count: filtered.length,
      results: filtered,
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
