// /api/page.js

export default async function handler(req, res) {
  const { page } = req.query;
  if (!page) {
    return res.status(400).json({ error: "Missing page number" });
  }

  try {
    const url = `https://multimovies-api-eight.vercel.app/api/page?path=/movies/&page=${page}`;
    const resp = await fetch(url); // native fetch in Vercel
    const data = await resp.json();

    if (!data.sections || !data.sections["Recently added"]) {
      return res.status(404).json({ error: "No movies found" });
    }

    // Only return a few fields to keep response light
    const movies = data.sections["Recently added"].map(m => ({
      title: m.title,
      link: m.link
    }));

    res.status(200).json({
      ok: true,
      page: parseInt(page, 10),
      total: movies.length,
      movies
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
