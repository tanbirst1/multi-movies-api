// api/search.js
export const config = {
  runtime: "edge", // <- Important for Vercel Edge Function
};

const BASE_URL = "https://multimovies.pro";

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("s");
    if (!query) return new Response(JSON.stringify({ error: "Missing ?s=" }), { status: 400 });

    const res = await fetch(`${BASE_URL}/?s=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error("Failed to fetch search results");

    const html = await res.text();

    // Parse HTML using DOMParser (works in Edge runtime)
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const results = [];
    const articles = doc.querySelectorAll(".result-item article");

    articles.forEach(article => {
      const linkEl = article.querySelector(".thumbnail a");
      const imgEl = article.querySelector(".thumbnail img");
      const typeEl = article.querySelector(".thumbnail span");
      const titleEl = article.querySelector(".details .title a");
      const yearEl = article.querySelector(".details .meta .year");
      const ratingEl = article.querySelector(".details .meta .rating");
      const descEl = article.querySelector(".details .contenido p");

      results.push({
        title: titleEl?.textContent?.trim() || "",
        link: linkEl?.href || "",
        img: imgEl?.src || "",
        type: typeEl?.textContent?.trim() || "",
        year: yearEl?.textContent?.trim() || "",
        rating: ratingEl?.textContent?.trim() || "",
        description: descEl?.textContent?.trim() || "",
      });
    });

    return new Response(JSON.stringify({ status: "ok", query, results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ status: "error", message: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
