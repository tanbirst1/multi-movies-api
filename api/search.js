export default {
  async fetch(request) {
    try {
      const { searchParams } = new URL(request.url);
      const query = searchParams.get("s") || "Naruto";
      const page = searchParams.get("page") || "1";

      // Build target search URL
      const targetUrl = `https://multimovies.pro/page/${page}/?s=${encodeURIComponent(query)}`;

      // Fetch the page
      const response = await fetch(targetUrl, {
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      const html = await response.text();

      // Scrape result items
      const items = [...html.matchAll(
        /<div class="result-item">([\s\S]*?)<\/article>/g
      )].map(match => {
        const block = match[1];

        const title = (block.match(/<div class="title"><a[^>]*>(.*?)<\/a>/) || [])[1] || "";
        const link = (block.match(/<div class="title"><a href="([^"]+)/) || [])[1] || "";
        let img = (block.match(/<img src="([^"]+)/) || [])[1] || "";

        // ✅ Fix thumbnails -> full size
        if (img) {
          img = img.replace(/-150x150(?=\.\w+$)/, "");

          // ✅ Convert to TMDB real URL if possible
          const fileName = img.split("/").pop(); // erEVbUNiNwbH8Pns2texFV1u5Xi.jpg
          if (fileName && fileName.length > 10) {
            img = `https://image.tmdb.org/t/p/w500/${fileName}`;
          }
        }

        const year = (block.match(/<span class="year">([^<]+)/) || [])[1] || "";
        const rating = (block.match(/<span class="rating">([^<]+)/) || [])[1] || "";

        return { title, link, img, year, rating };
      });

      // ✅ Scrape pagination info
      const paginationMatch = html.match(/Page\s+(\d+)\s+of\s+(\d+)/i);
      const currentPage = paginationMatch ? parseInt(paginationMatch[1], 10) : parseInt(page, 10);
      const totalPages = paginationMatch ? parseInt(paginationMatch[2], 10) : 1;

      return new Response(JSON.stringify({
        status: "ok",
        query,
        page: currentPage,
        total_pages: totalPages,
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
