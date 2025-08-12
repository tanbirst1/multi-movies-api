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

      // Parse sections except Top Movies and Top TVShows
      const headerRegex = /<header[^>]*>[\s\S]*?<h2[^>]*>([^<]+)<\/h2>[\s\S]*?<\/header>/gi;
      const headers = [];
      let hMatch;
      while ((hMatch = headerRegex.exec(html)) !== null) {
        const name = hMatch[1].trim();
        // Skip top lists here, we will scrape those separately
        if (/top movies|top tvshows/i.test(name)) continue;
        const headerEnd = hMatch.index + hMatch[0].length;
        headers.push({ name, headerEnd });
      }

      function findItemsDivStart(fromPos) {
        const sub = html.slice(fromPos);
        const itemsDivRegex = /<div\b[^>]*\bclass=(?:"|')[^"']*?\bitems\b[^"']*(?:"|')[^>]*>/i;
        const m = itemsDivRegex.exec(sub);
        if (!m) return -1;
        return fromPos + m.index;
      }

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

      function parseArticleBlock(blockHtml) {
        const idMatch = /post(?:-featured)?-(\d+)/i.exec(blockHtml);
        const id = idMatch ? idMatch[1] : null;
        const imgMatch = /<img[^>]*\bsrc=(?:"|')([^"']+)(?:"|')[^>]*>/i.exec(blockHtml);
        let img = imgMatch ? imgMatch[1] : null;
        if (img) img = img.replace(/-\d+x\d+(\.\w{2,6})$/i, "$1");
        const ratingMatch = /<div[^>]*\bclass=(?:"|')[^"']*?\brating\b[^"']*(?:"|')[^>]*>([^<]+)<\/div>/i.exec(blockHtml);
        const rating = ratingMatch ? ratingMatch[1].trim() : null;
        const urlMatch = /<a[^>]*\bhref=(?:"|')([^"']+)(?:"|')[^>]*>[^<]*<div[^>]*class=(?:"|')[^"']*?\bsee\b[^"']*(?:"|')/i.exec(blockHtml)
                       || /<h3>[\s\S]*?<a[^>]*\bhref=(?:"|')([^"']+)(?:"|')[^>]*>/i.exec(blockHtml);
        let url = urlMatch ? urlMatch[1] : null;
        if (url) url = url.replace(/^https?:\/\/[^/]+/i, "");
        const titleMatch = /<h3[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?<\/h3>/i.exec(blockHtml);
        const title = titleMatch ? titleMatch[1].trim() : null;
        const dateMatch = /<h3[\s\S]*?<\/h3>\s*<span[^>]*>([^<]+)<\/span>/i.exec(blockHtml);
        const date = dateMatch ? dateMatch[1].trim() : null;

        return { id, img, rating, url, title, date };
      }

      const sections = {};
      for (let i = 0; i < headers.length; i++) {
        const sec = headers[i];
        const nextHeader = headers[i + 1];
        const divStart = findItemsDivStart(sec.headerEnd);
        if (divStart === -1) continue;
        const scanEnd = nextHeader ? nextHeader.headerEnd : -1;
        const articlesHtml = extractArticlesBetween(divStart, scanEnd);
        const items = [];
        for (const artHtml of articlesHtml) {
          const item = parseArticleBlock(artHtml);
          if (item.title && item.url) items.push(item);
        }
        sections[sec.name] = items;
      }

      // Count per section
      const counts = {};
      for (const k in sections) counts[k] = sections[k].length;

      return new Response(
        JSON.stringify({ status: "ok", counts, sections }, null, 2),
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
