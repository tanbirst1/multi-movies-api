// index.js
import fs from "fs";
import path from "path";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const nameParam = url.searchParams.get("name");
    if (!nameParam) {
      return new Response(
        JSON.stringify({ error: "Missing name parameter" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Load base URL from ../src/baseurl.txt
    let BASEURL = "https://multimovies.pro";
    try {
      const baseurlPath = path.resolve("./src/baseurl.txt");
      if (fs.existsSync(baseurlPath)) {
        const text = fs.readFileSync(baseurlPath, "utf-8").trim();
        if (text) BASEURL = text;
      }
    } catch (e) {
      // fallback to default
    }

    const targetURL = `${BASEURL}/tvshows/${nameParam}`;

    try {
      const res = await fetch(targetURL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36",
          "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        },
      });

      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: "fetch_failed", status: res.status }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      const html = await res.text();

      // Extract episode list
      const episodeRegex =
        /<li[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>\s*<\/li>/gi;

      let episodes = [];
      let match;
      while ((match = episodeRegex.exec(html)) !== null) {
        episodes.push({
          url: match[1].replace(/^https?:\/\/[^/]+/i, ""),
          title: match[2].trim(),
        });
      }

      // Extract main show info
      const titleMatch = /<h1[^>]*>([^<]+)<\/h1>/i.exec(html);
      const title = titleMatch ? titleMatch[1].trim() : nameParam;

      const imgMatch = /<img[^>]*class="[^"]*wp-post-image[^"]*"[^>]*src="([^"]+)"/i.exec(html);
      const img = imgMatch ? imgMatch[1] : null;

      const summary = { total_episodes: episodes.length };

      return new Response(
        JSON.stringify(
          { status: "ok", title, img, summary, episodes },
          null,
          2
        ),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message || String(err) }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  },
};
