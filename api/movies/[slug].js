import { parse } from "node-html-parser";

export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");

  if (!slug) {
    return new Response(
      JSON.stringify({ error: "Missing slug parameter" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const targetURL = `https://multimovies.coupons/movies/${slug}`;

  try {
    // Fetch the movie page HTML
    const res = await fetch(targetURL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36",
      },
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch movie page" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const html = await res.text();
    const root = parse(html);

    // Extract poster
    const posterEl = root.querySelector(".poster img");
    const poster = posterEl ? posterEl.getAttribute("src") : null;

    // Extract title
    const titleEl = root.querySelector(".data h1");
    const title = titleEl ? titleEl.text.trim() : null;

    // Extract tagline and date
    const taglineEl = root.querySelector(".extra .tagline");
    const tagline = taglineEl ? taglineEl.text.trim() : null;
    const dateEl = root.querySelector(".extra .date");
    const releaseDate = dateEl ? dateEl.text.trim() : null;

    // Extract synopsis
    const synopsisEl = root.querySelector("#info .wp-content p");
    const synopsis = synopsisEl ? synopsisEl.text.trim() : null;

    // Extract IMDb rating
    const imdbEl = root.querySelector(".custom_fields b#repimdb strong");
    const imdbRating = imdbEl ? imdbEl.text.trim() : null;

    // Extract TMDb rating
    const tmdbEl = root.querySelector(".custom_fields span strong");
    const tmdbRating = tmdbEl ? tmdbEl.text.trim() : null;

    // Extract genres (array)
    const genreEls = root.querySelectorAll(".sgeneros a");
    const genres = genreEls.map((a) => a.text.trim());

    // Extract views count
    const viewsEl = root.querySelector("#playernotice");
    const views = viewsEl ? viewsEl.getAttribute("data-text") || viewsEl.text.trim() : null;

    // Extract trailer and main embed iframe URLs
    const trailerIframe = root.querySelector("#source-player-trailer iframe");
    const trailerUrl = trailerIframe ? trailerIframe.getAttribute("src") : null;

    const mainIframe = root.querySelector("#source-player-1 iframe");
    const mainUrl = mainIframe ? mainIframe.getAttribute("src") : null;

    // Extract cast list
    const castNodes = root.querySelectorAll("#cast .person");
    const cast = castNodes.map((person) => {
      const name = person.querySelector("[itemprop=name]")?.getAttribute("content") || "";
      const character = person.querySelector(".caracter")?.text.trim() || "";
      const image = person.querySelector("img")?.getAttribute("src") || "";
      const profileUrl = person.querySelector("a")?.getAttribute("href") || "";
      return { name, character, image, profileUrl };
    });

    // Prepare JSON response
    const data = {
      title,
      poster,
      tagline,
      releaseDate,
      synopsis,
      imdbRating,
      tmdbRating,
      genres,
      views,
      trailerUrl,
      mainUrl,
      cast,
      sourceUrl: targetURL,
    };

    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Server error", details: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
