// api/header.js

export const config = {
  runtime: "edge", // Run on Vercel Edge
};

export default async function handler(req) {
  try {
    // 1) Fetch base URL from GitHub raw
    const baseUrlTxt =
      "https://raw.githubusercontent.com/tanbirst1/multi-movies-api/refs/heads/main/src/baseurl.txt";

    const baseRes = await fetch(baseUrlTxt);
    if (!baseRes.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to load baseurl.txt" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    const targetUrl = (await baseRes.text()).trim();

    // 2) Fetch HTML from the base URL
    const response = await fetch(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible)" },
    });
    const html = await response.text();
    const htmlLower = html.toLowerCase();

    // ---------- Helpers ----------
    function findMatchingTag(strLower, openIndex, tagName) {
      const openToken = "<" + tagName;
      const closeToken = "</" + tagName + ">";
      const firstOpen = strLower.indexOf(openToken, openIndex);
      if (firstOpen === -1) return -1;
      let pos = firstOpen + openToken.length;
      let depth = 1;
      while (pos < strLower.length) {
        const nextOpen = strLower.indexOf(openToken, pos);
        const nextClose = strLower.indexOf(closeToken, pos);
        if (nextClose === -1) return -1;
        if (nextOpen !== -1 && nextOpen < nextClose) {
          depth++;
          pos = nextOpen + openToken.length;
        } else {
          depth--;
          pos = nextClose + closeToken.length;
          if (depth === 0) return pos;
        }
      }
      return -1;
    }

    function parseAttrs(openTag) {
      const attrs = {};
      const attrRegex = /([\w-:]+)\s*=\s*(['"])(.*?)\2/g;
      let m;
      while ((m = attrRegex.exec(openTag))) {
        attrs[m[1].toLowerCase()] = m[3];
      }
      return attrs;
    }

    function parseUlString(ulHtml) {
      const ulHtmlLower = ulHtml.toLowerCase();
      const firstGT = ulHtml.indexOf(">");
      if (firstGT === -1)
        return { type: "ul", id: null, class: null, items: [] };
      const openTag = ulHtml.slice(0, firstGT + 1);
      const attrs = parseAttrs(openTag);
      const ulId = attrs.id || null;
      const ulClass = attrs.class || null;

      const closeToken = "</ul>";
      const closeIndex = ulHtmlLower.lastIndexOf(closeToken);
      const innerHtml =
        closeIndex === -1 ? "" : ulHtml.slice(firstGT + 1, closeIndex);

      const items = [];
      const innerLower = innerHtml.toLowerCase();
      let pos = 0;
      while (true) {
        const liOpen = innerLower.indexOf("<li", pos);
        if (liOpen === -1) break;
        const liEnd = findMatchingTag(innerLower, liOpen, "li");
        if (liEnd === -1) break;
        const liBlock = innerHtml.slice(liOpen, liEnd);
        const liBlockLower = liBlock.toLowerCase();

        const liOpenTagEnd = liBlock.indexOf(">");
        const liOpenTag =
          liOpenTagEnd === -1 ? "" : liBlock.slice(0, liOpenTagEnd + 1);
        const liAttrs = parseAttrs(liOpenTag);

        let id = null;
        if (liAttrs.class) {
          const idm = liAttrs.class.match(/menu-item-(\d+)/);
          if (idm) id = idm[1];
        }

        const aMatch = liBlock.match(
          /<a[^>]*href=(['"])(.*?)\1[^>]*>([\s\S]*?)<\/a>/i
        );
        let url = null;
        let title = "";
        if (aMatch) {
          url = aMatch[2].trim();
          try {
            if (url.includes("multimovies.pro")) {
              url = new URL(url).pathname;
            }
          } catch {}
          title = aMatch[3].replace(/<[^>]+>/g, "").trim();
        }

        const children = [];
        let subPos = 0;
        while (true) {
          const subOpen = liBlockLower.indexOf("<ul", subPos);
          if (subOpen === -1) break;
          const subEnd = findMatchingTag(liBlockLower, subOpen, "ul");
          if (subEnd === -1) break;
          const subHtml = liBlock.slice(subOpen, subEnd);
          const parsedSub = parseUlString(subHtml);
          parsedSub.items.forEach((it) => children.push(it));
          subPos = subEnd;
        }

        items.push({ id, title, url, items: children });
        pos = liEnd;
      }

      return { type: "ul", id: ulId, class: ulClass, items };
    }
    // ---------- End Helpers ----------

    // 3) Extract menu
    const menuStart = htmlLower.search(
      /<div[^>]*class=["'][^"']*menu-menu1-container[^"']*["'][^>]*>/
    );
    if (menuStart === -1) {
      return new Response(JSON.stringify({ error: "menu not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const menuEndPos = findMatchingTag(htmlLower, menuStart, "div");
    const menuBlock = html.slice(menuStart, menuEndPos);
    const menuBlockLower = menuBlock.toLowerCase();

    const ulResults = [];
    let scanPos = 0;
    while (true) {
      const ulIndex = menuBlockLower.indexOf("<ul", scanPos);
      if (ulIndex === -1) break;
      const ulEnd = findMatchingTag(menuBlockLower, ulIndex, "ul");
      if (ulEnd === -1) break;
      const fullUl = menuBlock.slice(ulIndex, ulEnd);
      const openGt = fullUl.indexOf(">");
      const openTag = openGt === -1 ? fullUl : fullUl.slice(0, openGt + 1);
      const attrs = parseAttrs(openTag);
      ulResults.push({
        fullUl,
        id: attrs.id || null,
        class: attrs.class || null,
      });
      scanPos = ulEnd;
    }
    const menus = ulResults.map((u) => parseUlString(u.fullUl));

    // 4) Logos
    const logos = [];
    const logoRegex =
      /<div[^>]*class=["']logo["'][^>]*>[\s\S]*?<img[^>]*?(?:data-src|src)=['"]([^'"]+)['"][^>]*>/gi;
    let lm;
    while ((lm = logoRegex.exec(html)) !== null) {
      logos.push(lm[1]);
    }

    // 5) Search forms
    const searchForms = [];
    const searchRegex =
      /<form[^>]*id=['"]?(searchform|form-search-resp)['"]?[^>]*action=['"]([^'"]+)['"][^>]*>/gi;
    let sm;
    while ((sm = searchRegex.exec(html)) !== null) {
      searchForms.push({ id: sm[1], action: sm[2] });
    }

    // 6) Login
    const loginMatch = html.match(
      /<a[^>]*href=['"]([^'"]*\/account\/\?action=log-in[^'"]*)['"][^>]*class=['"][^'"]*clicklogin[^'"]*['"][^>]*>/i
    );
    const loginUrl = loginMatch ? loginMatch[1] : null;

    // 7) Final result
    const result = {
      targetUrl,
      menus,
      logos,
      searchForms,
      loginUrl,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
