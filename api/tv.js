// api/index.js
export default {
  async fetch(request) {
    try {
      const reqUrl = new URL(request.url);
      const name = reqUrl.searchParams.get("name");
      const pretty = reqUrl.searchParams.get("pretty") === "1";

      if (!name) {
        return new Response(JSON.stringify({ error: "Missing ?name={slug}" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const BASEURL = "https://multimovies.pro";
      const targetURL = `${BASEURL.replace(/\/+$/, "")}/tvshows/${name}`;

      const r = await fetch(targetURL, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
      });

      if (!r.ok) {
        return new Response(
          JSON.stringify({ error: "fetch_failed", status: r.status }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      const html = await r.text();

      // --- Helpers ---
      const decode = (s) =>
        s
          ? s
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .trim()
          : null;

      const first = (re, src = html, i = 1) => {
        const m = re.exec(src);
        return m ? decode(m[i]) : null;
      };

      const preferDataSrc = (imgTag) => {
        if (!imgTag) return null;
        const ds = /data-src="([^"]+)"/i.exec(imgTag)?.[1];
        const s = /src="([^"]+)"/i.exec(imgTag)?.[1];
        return ds || (s && !/^data:image\//i.test(s) ? s : null);
      };

      // --- Title & Poster ---
      const title =
        first(/<div class="data">[\s\S]*?<h1[^>]*>([^<]+)<\/h1>/i) ||
        decode(name.replace(/-/g, " "));

      const posterTag = first(/<div class="poster">[\s\S]*?(<img[^>]+>)/i, html, 1);
      const poster = preferDataSrc(posterTag);

      // --- Episodes (find all li.mark-XXX) ---
      const liMatches = html.match(/<li class="mark-[^"]+">[\s\S]*?<\/li>/gi) || [];
      const episodes = [];

      for (const li of liMatches) {
        const numRaw = first(/<div class="numerando">([\s\S]*?)<\/div>/i, li);
        let number = numRaw ? numRaw.replace(/\s+/g, "") : null;
        if (number && number.includes("-")) {
          const [s, e] = number.split("-").map((x) => x.trim());
          if (s && e) number = `${s}x${e.padStart(2, "0")}`;
        }

        const epTitle = first(/<div class="episodiotitle">[\s\S]*?<a[^>]*>([^<]+)<\/a>/i, li);
        const epUrl = first(/<div class="episodiotitle">[\s\S]*?<a[^>]+href="([^"]+)"/i, li);
        const epDate = first(/<span class="date">([^<]+)<\/span>/i, li);

        const imgTag = first(/<div class="imagen">[\s\S]*?(<img[^>]+>)/i, li, 1);
        const epPoster = preferDataSrc(imgTag);

        episodes.push({
          number,
          title: epTitle,
          url: epUrl,
          date: epDate,
          poster: epPoster,
        });
      }

      const res = {
        status: "ok",
        slug: name,
        title,
        poster,
        episodes,
      };

      return new Response(JSON.stringify(res, null, pretty ? 2 : 0), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
