export default {
  async fetch(request) {
    try {
      const baseUrl = "https://multimovies.coupons"; // target site
      const res = await fetch(baseUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36",
        },
      });

      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: "Failed to fetch site", status: res.status }),
          { status: 500 }
        );
      }

      const html = await res.text();
      const featured = [];

      // Use regex to extract article blocks
      const regex =
        /<article[^>]*?post-featured-(\d+)[\s\S]*?<img\s+src="([^"]+)"\s+alt="([^"]+)".*?<div class="rating">([^<]+)<\/div>[\s\S]*?<a\s+href="([^"]+)">[\s\S]*?<h3><a[^>]+>([^<]+)<\/a><\/h3>\s*<span>([^<]+)<\/span>/g;

      let match;
      while ((match = regex.exec(html)) !== null) {
        featured.push({
          id: match[1],
          img: match[2],
          alt: match[3],
          rating: match[4],
          url: match[5],
          title: match[6],
          year: match[7],
        });
      }

      return new Response(
        JSON.stringify({
          status: "ok",
          base: baseUrl,
          totalFeatured: featured.length,
          featured,
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message || "Unknown error" }),
        { status: 500 }
      );
    }
  },
};
