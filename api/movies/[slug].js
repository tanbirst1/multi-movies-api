export default {
  async fetch(request, { params }) {
    const TARGET_BASE = "https://multimovies.coupons/movies";
    const slug = params.slug;  // dynamic slug from URL
    const url = `${TARGET_BASE}/${slug}/`;

    try {
      // Fetch the page
      const res = await fetch(url, {
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

      // Basic extraction example using regex or simple DOMParser
      // Since this is edge, DOMParser might not be available,
      // so we use regex for key info as example.

      // Extract movie title
      const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      const title = titleMatch ? titleMatch[1].trim() : null;

      // Extract poster URL
      const posterMatch = html.match(
        /<div class="poster">[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>/i
      );
      const poster = posterMatch ? posterMatch[1] : null;

      // Extract synopsis from #info section
      const synopsisMatch = html.match(
        /<div id="info"[^>]*>[\s\S]*?<div itemprop="description"[^>]*>([\s\S]*?)<\/div>/i
      );
      let synopsis = synopsisMatch ? synopsisMatch[1] : null;
      if (synopsis) {
        // Strip HTML tags from synopsis
        synopsis = synopsis.replace(/<[^>]+>/g, "").trim();
      }

      // Extract rating (example TMDb rating)
      const tmdbRatingMatch = html.match(
        /<div class="custom_fields">[\s\S]*?<b class="variante">TMDb Rating<\/b>[\s\S]*?<span class="valor"><strong>([\d.]+)<\/strong>/i
      );
      const tmdbRating = tmdbRatingMatch ? tmdbRatingMatch[1] : null;

      // Extract genres (all <a> inside .sgeneros)
      const genreMatches = [...html.matchAll(/<div class="sgeneros">([\s\S]*?)<\/div>/i)];
      let genres = [];
      if (genreMatches.length) {
        const genreHtml = genreMatches[0][1];
        const genreLinks = [...genreHtml.matchAll(/<a[^>]+>([^<]+)<\/a>/g)];
        genres = genreLinks.map((m) => m[1]);
      }

      // Extract embedded video iframe URLs (for example gdmirror and youtube trailer)
      const iframeMatches = [...html.matchAll(/<iframe[^>]+src="([^"]+)"[^>]*>/g)];
      const videoSources = iframeMatches.map((m) => m[1]);

      // Compose response JSON
      const data = {
        title,
        poster,
        synopsis,
        tmdbRating,
        genres,
        videoSources,
      };

      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Error scraping movie", details: err.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  },
};
