// /api/page.js
export default async function handler(req, res) {
  const { page } = req.query;
  const TMDB_API_KEY = process.env.TMDB_API_KEY;

  if (!page) {
    return res.status(400).json({ error: "Missing page number" });
  }

  // Function to decode HTML entities
  function decodeHtmlEntities(str) {
    if (!str) return str;
    return str.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code));
  }

  // Function to normalize title for TMDB search
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
        let videoData = {}; // ✅ define before using

        // ✅ Title fallback
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

        // Decode & normalize
        const decodedTitle = decodeHtmlEntities(title);
        const normalizedTitle = normalizeTitle(title);

        // ✅ Fetch video data (safe even if fails)
        try {
          const videoRes = await fetch(
            `https://multi-movies-api.vercel.app/api/video?url=${encodeURIComponent(
              m.link
            )}`
          );
          videoData = await videoRes.json();

          // Normalize genres
          if (Array.isArray(videoData?.meta?.genres)) {
            genres = videoData.meta.genres.map((g) => g.name);
          }

          // Map sources + options
          if (
            Array.isArray(videoData?.sources) &&
            Array.isArray(videoData?.options)
          ) {
            videos = videoData.options.map((opt, idx) => {
              let srcList = videoData.sources[idx];
              if (!Array.isArray(srcList)) srcList = [srcList];
              return {
                type: opt.type || "movie",
                post: opt.post || "",
                nume: opt.nume || `${idx + 1}`,
                title: opt.title || `Server ${idx + 1}`,
                src: srcList,
              };
            });
          }
        } catch (e) {
          console.error("video API fetch error:", e.message);
        }

        // ✅ TMDB search
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
          ok: true,
          scrapedFrom: m.link,
          title: decodedTitle,
          tmdb_id,
          genres,
          views: videoData?.views || 0,
          sources: videoData?.sources || [],
          options: videos,
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
