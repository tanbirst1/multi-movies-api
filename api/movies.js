addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  try {
    const url = new URL(request.url);
    // Expect slug param like ?slug=demon-slayer-kimetsu-no-yaiba-infinity-castle
    const slug = url.searchParams.get("slug");
    if (!slug) {
      return new Response(JSON.stringify({ error: "Missing slug parameter" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Construct movie URL
    const movieUrl = `https://multimovies.coupons/movies/${encodeURIComponent(slug)}/`;

    // Fetch the movie page HTML
    const res = await fetch(movieUrl);
    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch movie page", status: res.status }),
        { status: res.status, headers: { "Content-Type": "application/json" } }
      );
    }
    const html = await res.text();

    // Parse the HTML using DOMParser (in Cloudflare Workers global scope)
    const doc = new DOMParser().parseFromString(html, "text/html");

    // Helper fn to get text content safely
    const getText = (el) => (el ? el.textContent.trim() : null);

    // Extract main info container: div.sheader
    const sheader = doc.querySelector("div.sheader");
    if (!sheader) {
      return new Response(
        JSON.stringify({ error: "Movie header info not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Title
    const title = getText(sheader.querySelector("h1"));

    // Poster image (remove size suffix from URL, e.g. -200x300)
    let poster = sheader.querySelector("div.poster img")?.getAttribute("src") || null;
    if (poster) poster = poster.replace(/-\d+x\d+(\.\w+)$/, "$1");

    // Extract tagline, date, country, rating
    const extra = sheader.querySelector("div.extra");
    const tagline = getText(extra?.querySelector("span.tagline"));
    const releaseDate = getText(extra?.querySelector("span.date"));
    const country = getText(extra?.querySelector("span.country"));
    const contentRating = getText(extra?.querySelector("span.CNR.rated"));

    // Genres - array of genre names from sheader .sgeneros a[href]
    const genres = Array.from(sheader.querySelectorAll("div.sgeneros a")).map(a =>
      a.textContent.trim()
    );

    // Synopsis from #info div (inside .wp-content)
    const infoBox = doc.querySelector("#info div.wp-content");
    const synopsis = getText(infoBox);

    // Ratings: IMDb and TMDb from .custom_fields
    const customFields = doc.querySelectorAll(".custom_fields");
    let imdbRating = null, imdbVotes = null, tmdbRating = null, tmdbVotes = null, originalTitle = null;

    customFields.forEach(field => {
      const label = getText(field.querySelector("b.variante"));
      const val = getText(field.querySelector("span.valor"));
      if (label === "IMDb Rating") {
        // Example: <b id="repimdb"><strong>9.4</strong> 674 votes</b>
        const imdbStrong = field.querySelector("#repimdb strong");
        imdbRating = imdbStrong?.textContent.trim() || null;
        const votesMatch = val.match(/(\d+)\s+votes/);
        imdbVotes = votesMatch ? votesMatch[1] : null;
      } else if (label === "TMDb Rating") {
        const match = val.match(/([\d.]+)\s+(\d+)\s+votes/);
        if (match) {
          tmdbRating = match[1];
          tmdbVotes = match[2];
        }
      } else if (label === "Original title") {
        originalTitle = val;
      }
    });

    // Cast - array of {name, role, profile_url, image_url}
    // Inside #cast div -> .persons > .person
    const castDiv = doc.querySelector("#cast div.persons");
    const cast = [];
    if (castDiv) {
      castDiv.querySelectorAll("div.person").forEach(p => {
        const name = getText(p.querySelector("div.data .name a"));
        const role = getText(p.querySelector("div.data .caracter"));
        const profile_url = p.querySelector("div.data .name a")?.getAttribute("href") || null;
        let image_url = p.querySelector("div.img a img")?.getAttribute("src") || null;
        if (image_url) image_url = image_url.replace(/-\d+x\d+(\.\w+)$/, "$1"); // clean size
        cast.push({ name, role, profile_url, image_url });
      });
    }

    // Video sources from div#dooplay_player_content iframe[src]
    const videoSources = [];
    doc.querySelectorAll("#dooplay_player_content iframe").forEach(iframe => {
      const src = iframe.getAttribute("src");
      if (src) videoSources.push(src);
    });

    // Views count from #playernotice data-text attr e.g. "175607 Views"
    const viewsText = doc.querySelector("#playernotice")?.getAttribute("data-text") || null;
    const views = viewsText ? viewsText.replace(/[^\d]/g, "") : null;

    // Return JSON
    const data = {
      slug,
      url: movieUrl,
      title,
      originalTitle,
      poster,
      tagline,
      releaseDate,
      country,
      contentRating,
      genres,
      synopsis,
      ratings: {
        imdb: { rating: imdbRating, votes: imdbVotes },
        tmdb: { rating: tmdbRating, votes: tmdbVotes },
      },
      cast,
      videoSources,
      views,
    };

    return new Response(JSON.stringify(data, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
