// /api/page.js
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
        let video_src = "";
        let tmdb_id = null;

        // ✅ Title fallback from slug if needed
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

        // ✅ Get details (genres + video_src) from correct API
        try {
          const detailRes = await fetch(
            `https://multi-movies-api.vercel.app/api/tv?url=${encodeURIComponent(m.link)}`
          );
          const detailData = await detailRes.json();

          // Normalize genres: pick only names
          if (Array.isArray(detailData?.meta?.genres)) {
            genres = detailData.meta.genres.map((g) => g.name);
          }

          video_src = detailData?.video || "";
        } catch (e) {
          console.error("tv API fetch error:", e.message);
        }

        // ✅ Search TMDB
        try {
          if (title) {
            const tmdbRes = await fetch(
              `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`
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
          video_src,
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
