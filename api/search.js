export default {
  async fetch(request) {
    try {
      const { searchParams } = new URL(request.url);
      const query = searchParams.get("s") || "Naruto";

      // Target search URL
      const targetUrl = `https://multimovies.pro/?s=${encodeURIComponent(query)}`;

      // Fetch page
      const response = await fetch(targetUrl, {
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      const html = await response.text();

      // Simple scrape using regex (no cheerio/jsdom in workers!)
      const items = [...html.matchAll(
        /<div class="result-item">([\s\S]*?)<\/div>\s*<\/div>/g
      )].map(match => {
        const block = match[1];
        const title = (block.match(/<div class="title"><a[^>]*>(.*?)<\/a>/) || [])[1] || "";
        const link = (block.match(/<div class="title"><a href="([^"]+)/) || [])[1] || "";
        const img = (block.match(/<img src="([^"]+)/) || [])[1] || "";
        const year = (block.match(/<span class="year">([^<]+)/) || [])[1] || "";
        const rating = (block.match(/<span class="rating">([^<]+)/) || [])[1] || "";
        return { title, link, img, year, rating };
      });

      return new Response(JSON.stringify({
        status: "ok",
        count: items.length,
        results: items
      }, null, 2), {
        headers: { "content-type": "application/json" }
      });

    } catch (err) {
      return new Response(JSON.stringify({
        status: "error",
        message: err.message
      }, null, 2), { status: 500 });
    }
  }
}
