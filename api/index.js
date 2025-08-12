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

      // 1) Find positions of all <header>...<h2>SectionName...</h2>...</header>
      const headerRegex = /<header[^>]*>[\s\S]*?<h2[^>]*>([^<]+)<\/h2>[\s\S]*?<\/header>/gi;
      const headers = [];
      let hMatch;
      while ((hMatch = headerRegex.exec(html)) !== null) {
        const name = hMatch[1].trim();
        const headerEnd = hMatch.index + hMatch[0].length;
        headers.push({ name, headerEnd });
      }

      // Helper to find next <div ... class="... items ..."> after a position
      function findItemsDivStart(fromPos) {
        const sub = html.slice(fromPos);
        const itemsDivRegex = /<div\b[^>]*\bclass=(?:"|')[^"']*?\bitems\b[^"']*(?:"|')[^>]*>/i;
        const m = itemsDivRegex.exec(sub);
        if (!m) return -1;
        return fromPos + m.index; // global index
      }

      // Helper to extract all <article>...</article> between startPos and endPos
      function extractArticlesBetween(startPos, endPos) {
        const scope = html.slice(startPos, endPos === -1 ? undefined : endPos);
        const articleRegex = /<article\b[\s\S]*?<\/article>/gi;
        const out = [];
        let a;
        while ((a = articleRegex.exec(scope)) !== null) {
          out.push(a[0]);
        }
        return out;
      }

      // Flexible extractor for fields from an <article> block
      function parseArticleBlock(blockHtml) {
        // id: matches post-featured-123 or post-123
        const idMatch = /post(?:-featured)?-(\d+)/i.exec(blockHtml);
        const id = idMatch ? idMatch[1] : null;

        // image src
        const imgMatch = /<img[^>]*\bsrc=(?:"|')([^"']+)(?:"|')[^>]*>/i.exec(blockHtml);
        let img = imgMatch ? imgMatch[1] : null;
        if (img) {
          // remove -{width}x{height} before extension, e.g. -185x278.jpg => .jpg
          img = img.replace(/-\d+x\d+(\.\w{2,6})$/i, "$1");
        }

        // rating
        const ratingMatch = /<div[^>]*\bclass=(?:"|')[^"']*?\brating\b[^"']*(?:"|')[^>]*>([^<]+)<\/div>/i.exec(blockHtml);
        const rating = ratingMatch ? ratingMatch[1].trim() : null;

        // url (anchor inside poster or h3)
        const urlMatch = /<a[^>]*\bhref=(?:"|')([^"']+)(?:"|')[^>]*>[^<]*<div[^>]*class=(?:"|')[^"']*?\bsee\b[^"']*(?:"|')/i.exec(blockHtml)
                       || /<h3>[\s\S]*?<a[^>]*\bhref=(?:"|')([^"']+)(?:"|')[^>]*>/i.exec(blockHtml);
        let url = urlMatch ? urlMatch[1] : null;
        if (url) url = url.replace(/^https?:\/\/[^/]+/i, ""); // relative

        // title (from h3 a text)
        const titleMatch = /<h3[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<\/h3>/i.exec(blockHtml);
        const title = titleMatch ? titleMatch[1].trim() : null;

        // year or date (span after h3)
        const dateMatch = /<h3[\s\S]*?<\/h3>\s*<span[^>]*>([^<]+)<\/span>/i.exec(blockHtml);
        const date = dateMatch ? dateMatch[1].trim() : null;

        return { id, img, rating, url, title, date };
      }

      // Build sections map
      const sections = {};
      for (let i = 0; i < headers.length; i++) {
        const sec = headers[i];
        const nextHeader = headers[i + 1];
        // find items div after this header
        const divStart = findItemsDivStart(sec.headerEnd);
        if (divStart === -1) {
          // no items carousel after this header; skip
          continue;
        }
        // define scanning end: position of next header or end of document
        const scanEnd = nextHeader ? nextHeader.headerEnd : -1;
        // extract article blocks between divStart and scanEnd
        const articlesHtml = extractArticlesBetween(divStart, scanEnd);
        const items = [];
        for (const artHtml of articlesHtml) {
          const item = parseArticleBlock(artHtml);
          // skip if no title or url (likely not a valid item)
          if (item.title && item.url) items.push(item);
        }

        sections[sec.name] = items;
      }

      // If no headers detected (fallback: try to parse known sections manually)
      if (Object.keys(sections).length === 0) {
        // fallback: try featured and movies regex captures (simple)
        const fallback = { featured: [], movies: [] };
        const featuredRegex = /<article[^>]*?post-featured-(\d+)[\s\S]*?<img[^>]*src=(?:"|')([^"']+)(?:"|')[\s\S]*?<div[^>]*class=(?:"|')rating(?:"|')[^>]*>([^<]+)<\/div>[\s\S]*?<a[^>]*href=(?:"|')([^"']+)(?:"|')[\s\S]*?<h3[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<\/h3>[\s\S]*?<span[^>]*>([^<]+)<\/span>/gi;
        let fm;
        while ((fm = featuredRegex.exec(html)) !== null) {
          let img = fm[2].replace(/-\d+x\d+(\.\w+)$/, "$1");
          let url = fm[4].replace(/^https?:\/\/[^/]+/, "");
          fallback.featured.push({
            id: fm[1],
            img,
            rating: fm[3].trim(),
            url,
            title: fm[5].trim(),
            date: fm[6].trim(),
          });
        }

        const moviesRegex = /<article[^>]*?id="post-(\d+)"[\s\S]*?<img[^>]*src=(?:"|')([^"']+)(?:"|')[\s\S]*?<div[^>]*class=(?:"|')rating(?:"|')[^>]*>([^<]+)<\/div>[\s\S]*?<a[^>]*href=(?:"|')([^"']+)(?:"|')[\s\S]*?<h3[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<\/h3>[\s\S]*?<span[^>]*>([^<]+)<\/span>/gi;
        while ((fm = moviesRegex.exec(html)) !== null) {
          let img = fm[2].replace(/-\d+x\d+(\.\w+)$/, "$1");
          let url = fm[4].replace(/^https?:\/\/[^/]+/, "");
          fallback.movies.push({
            id: fm[1],
            img,
            rating: fm[3].trim(),
            url,
            title: fm[5].trim(),
            date: fm[6].trim(),
          });
        }
        // add fallback if present
        if (fallback.featured.length) sections["Featured titles"] = fallback.featured;
        if (fallback.movies.length) sections["Movies"] = fallback.movies;
      }

      // Build summary counts
      const summary = {};
      for (const k of Object.keys(sections)) summary[k] = sections[k].length;

      return new Response(
        JSON.stringify({ status: "ok", counts: summary, sections }, null, 2),
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
