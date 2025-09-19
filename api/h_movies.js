// /api/scrape.js
import fetch from "node-fetch";

export default async function handler(req, res) {
  const { page } = req.query;
  const TMDB_API_KEY = process.env.TMDB_API_KEY;

  if (!page) {
    return res.status(400).json({ error: "Missing page number" });
  }

  try {
    // 1. Get movie list
    const listUrl = `https://multimovies-api-eight.vercel.app/api/page?path=/movies/&page=${page}`;
    const listRes = await fetch(listUrl);
    const listData = await listRes.json();

    if (!listData.sections || !listData.sections["Recently added"]) {
      return res.status(404).json({ error: "No movies found" });
    }

    let results = [];

    // 2. Loop movies
    for (let movie of listData.sections["Recently added"]) {
      const { title, link } = movie;
      let genres = [];
      let video_src = "";
      let tmdb_id = null;

      // 2a. Get details from backup API
      try {
        const detailRes = await fetch(`https://multimoviesbackup.vercel.app/api/tv?url=${encodeURIComponent(link)}`);
        const detailData = await detailRes.json();
        genres = detailData?.genres || [];
        video_src = detailData?.video || "";
      } catch (e) {
        console.error("Detail fetch error for", title, e.message);
      }

      // 2b. Get TMDB ID
      try {
        const tmdbRes = await fetch(
          `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`
        );
        const tmdbData = await tmdbRes.json();
        if (tmdbData.results && tmdbData.results.length > 0) {
          tmdb_id = tmdbData.results[0].id;
        }
      } catch (e) {
        console.error("TMDB fetch error for", title, e.message);
      }

      results.push({
        title,
        tmdb_id,
        genres,
        video_src
      });
    }

    res.status(200).json({
      page: page,
      total: results.length,
      movies: results
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
