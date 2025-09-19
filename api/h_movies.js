// /api/page.js
import fetch from "node-fetch";

export default async function handler(req, res) {
  const { page } = req.query;
  if (!page) return res.status(400).json({ error: "Missing page number" });

  try {
    const url = `https://multimovies-api-eight.vercel.app/api/page?path=/movies/&page=${page}`;
    const resp = await fetch(url);
    const data = await resp.json();

    if (!data.sections || !data.sections["Recently added"]) {
      return res.status(404).json({ error: "No movies found" });
    }

    const movies = data.sections["Recently added"].map(m => ({
      title: m.title,
      link: m.link
    }));

    res.status(200).json({ page, total: movies.length, movies });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
