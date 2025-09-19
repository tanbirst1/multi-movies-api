// /api/detail.js

export default async function handler(req, res) {
  const TMDB_API_KEY = process.env.TMDB_API_KEY;

  try {
    // ✅ Always connect to page=1
    const detailRes = await fetch(
      "https://multi-movies-api.vercel.app/api/h_movies?page=1"
    );
    const detailData = await detailRes.json();

    if (!detailData.movies || detailData.movies.length === 0) {
      return res.status(404).json({ error: "No movies found on page 1" });
    }

    // ✅ Process each movie
    const movies = await Promise.all(
      detailData.movies.map(async (m) => {
        let tmdb_id = null;

        try {
          const tmdbRes = await fetch(
            `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(
              m.title
            )}`
          );
          const tmdbData = await tmdbRes.json();
          if (tmdbData.results && tmdbData.results.length > 0) {
            tmdb_id = tmdbData.results[0].id;
          }
        } catch (e) {
          console.error("TMDB fetch error:", e.message);
        }

        return {
          title: m.title,
          tmdb_id,
          genres: m.genres || [],
          video_src: m.video || "",
        };
      })
    );

    return res.status(200).json({ page: 1, total: movies.length, movies });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
