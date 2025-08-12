const DEFAULT_BASE_URL = "https://multimovies.coupons";

export default {
  async fetch(request, env) {
    // Get base URL from environment variable BASE_URL or fallback
    const BASE_URL = env.BASE_URL?.trim() || DEFAULT_BASE_URL;

    try {
      const r = await fetch(BASE_URL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36",
        },
      });
      if (!r.ok) {
        return new Response(
          JSON.stringify({ error: "fetch_failed", status: r.status }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      const html = await r.text();

      // Extract Top Items helper: uses loose div capturing and improved regex
      function extractTopItems(sectionName) {
        // Find <h3> with sectionName (case insensitive)
        const headerRegex = new RegExp(
          `<h3[^>]*>\\s*${sectionName}\\s*<a[^>]*>[^<]*<\\/a>\\s*<\\/h3>`,
          "i"
        );
        const headerMatch = headerRegex.exec(html);
        if (!headerMatch) return [];

        const startIndex = headerMatch.index + headerMatch[0].length;
        const htmlAfter = html.slice(startIndex);

        // Grab all consecutive .top-imdb-item divs until next <h3> or end
        // Each .top-imdb-item div looks like <div class="top-imdb-item" id="top-xxxx">...</div>
        // We'll use a global regex to match each one

        const itemRegex = /<div class="top-imdb-item"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;

        // This regex was too strict previously; instead, let's match individual top-imdb-item divs
        // Each top-imdb-item div is self-contained; better to match with balanced divs or just non-greedy

        // Let's try simpler: match <div class="top-imdb-item" ...> ... </div> non-greedy
        const simpleItemRegex = /<div class="top-imdb-item"[^>]*>[\s\S]*?<\/div>/gi;

        const limitedHtml = (() => {
          const nextH3 = htmlAfter.search(/<h3[^>]*>/i);
          return nextH3 === -1 ? htmlAfter : htmlAfter.slice(0, nextH3);
        })();

        const items = [];
        let match;
        while ((match = simpleItemRegex.exec(limitedHtml)) !== null) {
          const block = match[0];

          // id
          const idMatch = /id="top-(\d+)"/i.exec(block);
          const id = idMatch ? idMatch[1] : null;

          // image src
          const imgMatch = /<img[^>]*\bsrc=(?:"|')([^"']+)(?:"|')[^>]*>/i.exec(block);
          let img = imgMatch ? imgMatch[1] : null;
          if (img) img = img.replace(/-\d+x\d+(\.\w{2,6})$/i, "$1");

          // rating
          const ratingMatch = /<div[^>]*class=(?:"|')rating(?:"|')[^>]*>([^<]+)<\/div>/i.exec(
            block
          );
          const rating = ratingMatch ? ratingMatch[1].trim() : null;

          // url (from poster anchor or title anchor)
          const urlMatch =
            /<div class="poster">[\s\S]*?<a[^>]*href=(?:"|')([^"']+)(?:"|')[^>]*>/i.exec(
              block
            ) ||
            /<div class="title">[\s\S]*?<a[^>]*href=(?:"|')([^"']+)(?:"|')[^>]*>/i.exec(
              block
            );
          let url = urlMatch ? urlMatch[1] : null;
          if (url) url = url.replace(new RegExp(`^${BASE_URL.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}`, "i"), "");

          // title (alt attr or title link text)
          const titleMatch =
            /<img[^>]*alt=(?:"|')([^"']+)(?:"|')[^>]*>/i.exec(block) ||
            /<div class="title">[\s\S]*?<a[^>]*>([^<]+)<\/a>/i.exec(block);
          const title = titleMatch ? titleMatch[1].trim() : null;

          if (id && title && url) {
            items.push({ id, img, rating, url, title });
          }
        }

        return items;
      }

      const topMovies = extractTopItems("TOP Movies");
      const topTvShows = extractTopItems("TOP TVShows");

      return new Response(
        JSON.stringify(
          {
            status: "ok",
            counts: { topMovies: topMovies.length, topTvShows: topTvShows.length },
            topMovies,
            topTvShows,
          },
          null,
          2
        ),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } catch (e) {
      return new Response(
        JSON.stringify({ error: e.message || String(e) }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  },
};
