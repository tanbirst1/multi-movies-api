// /api/page.js
import cheerio from "cheerio";

export default async function handler(req, res) {
  const { page } = req.query;
  const TMDB_API_KEY = process.env.TMDB_API_KEY;

  if (!page) {
    return res.status(400).json({ error: "Missing page number" });
  }

  try {
    const url = `https://multimovies-api-eight.vercel.app/api/page?path=/movies/&page=${page}`;
    const resp = await fetch(url);
    const data = await resp.json();

    if (!data.sections || !data.sections["Recently added"]) {
      return res.status(404).json({ error: "No movies found" });
    }

    const movies = await Promise.all(
      data.sections["Recently added"].map(async (m) => {
        let genres = [];
        let videos = [];
        let tmdb_id = null;

        // ✅ Title fallback from slug if missing
        let title = m.title;
        try {
          if (!title && m.link) {
            const slug = m.link.split("/").filter(Boolean).pop();
            title = slug
              .replace(/-/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase());
          }
        } catch {
          title = "Unknown Title";
        }

        // ✅ Scrape iframe sources (Cloudflare style)
        try {
          const htmlRes = await fetch(m.link);
          const html = await htmlRes.text();
          const $ = cheerio.load(html);

          let iframeCount = 0;
          $("#dooplay_player_content iframe").each((_, el) => {
            const src = $(el).attr("src");
            if (src && !src.includes("youtube.com") && !src.includes("youtu.be")) {
              iframeCount++;
              videos.push({
                server: `Server ${iframeCount}`,
                src: [src], // Always as array
              });
            }
          });

          // ✅ Try extracting genres from meta tags if available
          $("meta[property='video:tag']").each((_, el) => {
            const g = $(el).attr("content");
            if (g) genres.push(g);
          });
        } catch (err) {
          console.error("Scrape error:", err.message);
        }

        // ✅ Search TMDB
        try {
          if (title) {
            const tmdbRes = await fetch(
              `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(
                title
              )}`
            );
            const tmdbData = await tmdbRes.json();
            if (tmdbData.results && tmdbData.results.length > 0) {
              tmdb_id = tmdbData.results[0].id;
            }
          }
        } catch (e) {
          console.error("TMDB fetch error:", e.message);
        }

        return {
          title,
          tmdb_id,
          genres,
          videos,
        };
      })
    );

    res.status(200).json({
      ok: true,
      page: parseInt(page, 10),
      total: movies.length,
      movies,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
