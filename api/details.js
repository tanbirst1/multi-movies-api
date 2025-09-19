// /api/detail.js

export default async function handler(req, res) {
  const { url, title } = req.query;
  const TMDB_API_KEY = process.env.TMDB_API_KEY;

  if (!url || !title) {
    return res.status(400).json({ error: "Missing url or title" });
  }

  try {
    let genres = [];
    let video_src = "";
    let tmdb_id = null;

    // ✅ Get genres + video src from your API
    try {
      const detailRes = await fetch(
        `https://multi-movies-api.vercel.app/api/h_movies?page=1`
      );
      const detailData = await detailRes.json();

      // Try to find matching movie by title
      const found = detailData.movies?.find(
        (m) => m.title.toLowerCase() === title.toLowerCase()
      );

      if (found) {
        genres = found.genres || [];
        video_src = found.video || "";
      }
    } catch (e) {
      console.error("Detail fetch error:", e.message);
    }

    // ✅ Search TMDB for ID
    try {
      const tmdbRes = await fetch(
        `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(
          title
        )}`
      );
      const tmdbData = await tmdbRes.json();
      if (tmdbData.results && tmdbData.results.length > 0) {
        tmdb_id = tmdbData.results[0].id;
      }
    } catch (e) {
      console.error("TMDB fetch error:", e.message);
    }

    return res.status(200).json({ title, tmdb_id, genres, video_src });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
