// /api/page.js
import cheerio from "cheerio";

export default async function handler(req, res) {
  const { page } = req.query;
  const TMDB_API_KEY = process.env.TMDB_API_KEY;

  if (!page) {
    return res.status(400).json({ error: "Missing page number" });
  }

  // Function to decode HTML entities (keep punctuation and numbers intact)
  function decodeHtmlEntities(str) {
    if (!str) return str;
    return str.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code));
  }

  // Function to normalize title for TMDB search only
  function normalizeTitle(str) {
    if (!str) return str;
    str = decodeHtmlEntities(str);
    str = str.replace(/[\u2013\u2014–—]/g, "-"); // Normalize dashes
    str = str.replace(/[’‘`]/g, "'"); // Normalize quotes
    str = str.replace(/\s+/g, " ").trim(); // Normalize spaces
    return str;
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

        const decodedTitle = decodeHtmlEntities(title);
        const normalizedTitle = normalizeTitle(title);

        // ✅ Scrape actual iframe sources directly from HTML
        try {
          const htmlRes = await fetch(m.link);
          const html = await htmlRes.text();
          const $ = cheerio.load(html);

          const iframes = [];
          $("#dooplay_player_content iframe").each((_, el) => {
            const src = $(el).attr("src");
            if (
              src &&
              !src.includes("youtube.com") &&
              !src.includes("youtu.be")
            ) {
              iframes.push(src);
            }
          });

          // ✅ Add all valid iframe srcs as multiple sources
          if (iframes.length > 0) {
            videos.push({
              server: "Multi Source",
              src: iframes,
            });
          }

          // ✅ Try getting genres if available
          $("meta[property='video:tag']").each((_, el) => {
            const g = $(el).attr("content");
            if (g) genres.push(g);
          });
        } catch (err) {
          console.error("Scrape error:", err.message);
        }

        // ✅ Search TMDB with normalized title
        try {
          if (normalizedTitle) {
            const tmdbRes = await fetch(
              `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(
                normalizedTitle
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
          title: decodedTitle,
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
