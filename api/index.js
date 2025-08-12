export default {
  async fetch(request) {
    try {
      const baseUrl = "https://multimovies.coupons";
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

      // -------- FEATURED SECTION --------
      const featured = [];
      const featuredRegex =
        /<article[^>]*?post-featured-(\d+)[\s\S]*?<img\s+src="([^"]+)".*?<div class="rating">([^<]+)<\/div>[\s\S]*?<a\s+href="([^"]+)">[\s\S]*?<h3><a[^>]+>([^<]+)<\/a><\/h3>\s*<span>([^<]+)<\/span>/g;

      let match;
      while ((match = featuredRegex.exec(html)) !== null) {
        let imgUrl = match[2].replace(/-\d+x\d+(\.\w+)$/, "$1");
        let relativeUrl = match[4].replace(/^https?:\/\/[^/]+/, "");
        featured.push({
          id: match[1],
          img: imgUrl,
          rating: match[3],
          url: relativeUrl,
          title: match[5],
          year: match[6],
        });
      }

      // -------- MOVIES SECTION --------
      const movies = [];
      const moviesRegex =
        /<article[^>]*?id="post-(\d+)"[\s\S]*?<img\s+src="([^"]+)".*?<div class="rating">([^<]+)<\/div>[\s\S]*?<a\s+href="([^"]+)">[\s\S]*?<h3><a[^>]+>([^<]+)<\/a><\/h3>\s*<span>([^<]+)<\/span>/g;

      let movieMatch;
      while ((movieMatch = moviesRegex.exec(html)) !== null) {
        let imgUrl = movieMatch[2].replace(/-\d+x\d+(\.\w+)$/, "$1");
        let relativeUrl = movieMatch[4].replace(/^https?:\/\/[^/]+/, "");
        movies.push({
          id: movieMatch[1],
          img: imgUrl,
          rating: movieMatch[3],
          url: relativeUrl,
          title: movieMatch[5],
          date: movieMatch[6], // full date like "Oct. 11, 2024"
        });
      }

      return new Response(
        JSON.stringify({
          status: "ok",
          totalFeatured: featured.length,
          totalMovies: movies.length,
          featured,
          movies,
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
