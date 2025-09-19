// /api/scrape.js
import fetch from "node-fetch";

export default async function handler(req, res) {
  const { page } = req.query;
  const TMDB_API_KEY = process.env.TMDB_API_KEY;

  if (!page) {
    return res.status(400).json({ error: "Missing page number" });
  }

  try {
    // 1. Get page from multimovies
    const baseUrl = `https://multimovies-api-eight.vercel.app/api/page?path=/movies/&page=${page}`;
    const pageRes = await fetch(baseUrl);
    const pageData = await pageRes.json();

    if (!pageData.sections || !pageData.sections["Recently added"]) {
      return res.status(404).json({ error: "No movies found on this page" });
    }

    let movies = [];

    for (let movie of pageData.sections["Recently added"]) {
      const { title, link, tmdb_image, original_image } = movie;

      // 2. Get details from multimoviesbackup (video src + genres)
      let video_src = "";
      let genres = [];
      try {
        const detailRes = await fetch(`https://multimoviesbackup.vercel.app/api/tv?url=${encodeURIComponent(link)}`);
        const detailData = await detailRes.json();
        video_src = detailData?.video || "";
        genres = detailData?.genres || [];
      } catch (e) {
        console.error("Detail fetch error:", e.message);
      }

      // 3. Search TMDB for ID + poster
      let tmdb_id = null;
      let poster_url = tmdb_image || original_image;
      try {
        const tmdbRes = await fetch(
          `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`
        );
        const tmdbData = await tmdbRes.json();
        if (tmdbData.results && tmdbData.results.length > 0) {
          tmdb_id = tmdbData.results[0].id;
          if (tmdbData.results[0].poster_path) {
            poster_url = `https://image.tmdb.org/t/p/w500${tmdbData.results[0].poster_path}`;
          }
        }
      } catch (e) {
        console.error("TMDB fetch error:", e.message);
      }

      movies.push({
        title,
        slug: link.replace("https://multimovies.city/movies/", "").replace("/", ""),
        tmdb_id,
        genres,
        video_src,
        poster_url
      });
    }

    res.status(200).json({
      page: page,
      total: movies.length,
      movies
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
