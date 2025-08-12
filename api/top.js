export default {
  async fetch(request) {
    const TARGET = "https://multimovies.coupons";

    try {
      const r = await fetch(TARGET, {
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

      // Helper: extract top items by selector text in h3 and class top-imdb-item
      function extractTopItems(sectionName) {
        // Locate <h3> sectionName ... </h3>
        // Then grab all <div class="top-imdb-item" ...> after it until next <h3> or end

        const sectionRegex = new RegExp(
          `<h3[^>]*>\\s*${sectionName}\\s*<a[^>]*>[^<]*<\\/a>\\s*<\\/h3>`,
          "i"
        );
        const startMatch = sectionRegex.exec(html);
        if (!startMatch) return [];

        const startIndex = startMatch.index + startMatch[0].length;
        const restHtml = html.slice(startIndex);

        // Find all top-imdb-item divs after startIndex but before next <h3>
        const nextH3Index = restHtml.search(/<h3[^>]*>/i);
        const limitHtml =
          nextH3Index === -1 ? restHtml : restHtml.slice(0, nextH3Index);

        // Extract each top-imdb-item block
        const itemRegex = /<div class="top-imdb-item"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi;
        // Note: The blocks seem nested 3 divs, so to capture full block I match 3 closing divs

        const items = [];
        let m;
        while ((m = itemRegex.exec(limitHtml)) !== null) {
          const block = m[0];

          // Extract id from id="top-12345"
          const idMatch = /id="top-(\d+)"/i.exec(block);
          const id = idMatch ? idMatch[1] : null;

          // Extract image src
          const imgMatch = /<img[^>]*\bsrc=(?:"|')([^"']+)(?:"|')[^>]*>/i.exec(block);
          let img = imgMatch ? imgMatch[1] : null;
          if (img) img = img.replace(/-\d+x\d+(\.\w{2,6})$/i, "$1");

          // Extract rating div
          const ratingMatch = /<div[^>]*class=(?:"|')rating(?:"|')[^>]*>([^<]+)<\/div>/i.exec(
            block
          );
          const rating = ratingMatch ? ratingMatch[1].trim() : null;

          // Extract url from <a> inside poster or title div
          const urlMatch =
            /<div class="poster">[\s\S]*?<a[^>]*href=(?:"|')([^"']+)(?:"|')[^>]*>/i.exec(
              block
            ) ||
            /<div class="title">[\s\S]*?<a[^>]*href=(?:"|')([^"']+)(?:"|')[^>]*>/i.exec(
              block
            );
          let url = urlMatch ? urlMatch[1] : null;
          if (url) url = url.replace(/^https?:\/\/[^/]+/i, "");

          // Extract title (from alt or link text)
          const titleMatch =
            /<img[^>]*alt=(?:"|')([^"']+)(?:"|')[^>]*>/i.exec(block) ||
            /<div class="title">[\s\S]*?<a[^>]*>([^<]+)<\/a>/i.exec(block);
          const title = titleMatch ? titleMatch[1].trim() : null;

          items.push({ id, img, rating, url, title });
        }

        return items;
      }

      const topMovies = extractTopItems("TOP Movies");
      const topTvShows = extractTopItems("TOP TVShows");

      return new Response(
        JSON.stringify(
          {
            status: "ok",
            counts: {
              topMovies: topMovies.length,
              topTvShows: topTvShows.length,
            },
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
