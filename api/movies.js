addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug");

    if (!slug) {
      return new Response(JSON.stringify({ error: "Missing slug parameter" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // -------- Get base URL from GitHub --------
    const baseUrlRes = await fetch(
      "https://raw.githubusercontent.com/tanbirst1/multi-movies-api/refs/heads/main/src/baseurl.txt"
    );
    if (!baseUrlRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch base URL", status: baseUrlRes.status }),
        { status: baseUrlRes.status, headers: { "Content-Type": "application/json" } }
      );
    }
    const baseUrl = (await baseUrlRes.text()).trim().replace(/\/+$/, ""); // remove trailing /

    // Construct movie URL dynamically
    const movieUrl = `${baseUrl}/movies/${encodeURIComponent(slug)}/`;

    // Fetch movie page HTML
    const res = await fetch(movieUrl);
    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch movie page", status: res.status }),
        { status: res.status, headers: { "Content-Type": "application/json" } }
      );
    }
    const html = await res.text();

    // Parse HTML
    const doc = new DOMParser().parseFromString(html, "text/html");
    const getText = el => (el ? el.textContent.trim() : null);

    // ----------------- Extract Data -----------------
    const sheader = doc.querySelector("div.sheader");
    if (!sheader) {
      return new Response(
        JSON.stringify({ error: "Movie header info not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const title = getText(sheader.querySelector("h1"));
    let poster = sheader.querySelector("div.poster img")?.getAttribute("src") || null;
    if (poster) poster = poster.replace(/-\d+x\d+(\.\w+)$/, "$1");

    const extra = sheader.querySelector("div.extra");
    const tagline = getText(extra?.querySelector("span.tagline"));
    const releaseDate = getText(extra?.querySelector("span.date"));
    const country = getText(extra?.querySelector("span.country"));
    const contentRating = getText(extra?.querySelector("span.CNR.rated"));

    const genres = Array.from(sheader.querySelectorAll("div.sgeneros a")).map(a =>
      a.textContent.trim()
    );

    const infoBox = doc.querySelector("#info div.wp-content");
    const synopsis = getText(infoBox);

    const customFields = doc.querySelectorAll(".custom_fields");
    let imdbRating = null,
      imdbVotes = null,
      tmdbRating = null,
      tmdbVotes = null,
      originalTitle = null;

    customFields.forEach(field => {
      const label = getText(field.querySelector("b.variante"));
      const val = getText(field.querySelector("span.valor"));
      if (label === "IMDb Rating") {
        const imdbStrong = field.querySelector("#repimdb strong");
        imdbRating = imdbStrong?.textContent.trim() || null;
        const votesMatch = val?.match(/(\d+)\s+votes/);
        imdbVotes = votesMatch ? votesMatch[1] : null;
      } else if (label === "TMDb Rating") {
        const match = val?.match(/([\d.]+)\s+(\d+)\s+votes/);
        if (match) {
          tmdbRating = match[1];
          tmdbVotes = match[2];
        }
      } else if (label === "Original title") {
        originalTitle = val;
      }
    });

    const cast = [];
    const castDiv = doc.querySelector("#cast div.persons");
    if (castDiv) {
      castDiv.querySelectorAll("div.person").forEach(p => {
        const name = getText(p.querySelector("div.data .name a"));
        const role = getText(p.querySelector("div.data .caracter"));
        const profile_url = p.querySelector("div.data .name a")?.getAttribute("href") || null;
        let image_url = p.querySelector("div.img a img")?.getAttribute("src") || null;
        if (image_url) image_url = image_url.replace(/-\d+x\d+(\.\w+)$/, "$1");
        cast.push({ name, role, profile_url, image_url });
      });
    }

    const videoSources = [];
    doc.querySelectorAll("#dooplay_player_content iframe").forEach(iframe => {
      const src = iframe.getAttribute("src");
      if (src) videoSources.push(src);
    });

    const viewsText = doc.querySelector("#playernotice")?.getAttribute("data-text") || null;
    const views = viewsText ? viewsText.replace(/[^\d]/g, "") : null;

    // ----------------- Response -----------------
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
