// api/header.js
export default async function handler(req, res) {
  try {
    const targetUrl = "https://multimovies.pro/";

    // fetch HTML
    const response = await fetch(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible)" },
    });
    const html = await response.text();

    const htmlLower = html.toLowerCase();

    // Utility: find matching closing tag position (returns index AFTER the closing tag)
    function findMatchingTag(strLower, openIndex, tagName) {
      const openToken = "<" + tagName;
      const closeToken = "</" + tagName + ">";
      // locate the first actual open (could be spaced)
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
          if (depth === 0) return pos; // index right after closing tag
        }
      }
      return -1;
    }

    // 1) extract full menu container (safe matching)
    const menuStart = htmlLower.search(
      /<div[^>]*class=["'][^"']*menu-menu1-container[^"']*["'][^>]*>/
    );
    if (menuStart === -1) {
      // fallback: maybe page structure changed — return helpful debug
      return res.status(404).json({ error: "menu-menu1-container not found" });
    }
    const menuEndPos = findMatchingTag(htmlLower, menuStart, "div");
    if (menuEndPos === -1) {
      return res.status(500).json({ error: "could not find closing </div> for menu container" });
    }
    const menuBlock = html.slice(menuStart, menuEndPos);
    const menuBlockLower = menuBlock.toLowerCase();

    // Helper: parse attributes from an opening tag string
    function parseAttrs(openTag) {
      const attrs = {};
      const attrRegex = /([\w-:]+)\s*=\s*(['"])(.*?)\2/g;
      let m;
      while ((m = attrRegex.exec(openTag))) {
        attrs[m[1].toLowerCase()] = m[3];
      }
      return attrs;
    }

    // Parse a <ul> block string (including its open tag and close tag)
    function parseUlString(ulHtml) {
      const ulHtmlLower = ulHtml.toLowerCase();
      // find end of opening tag
      const firstGT = ulHtml.indexOf(">");
      if (firstGT === -1) return { type: "ul", id: null, class: null, items: [] };
      const openTag = ulHtml.slice(0, firstGT + 1);
      const attrs = parseAttrs(openTag);
      const ulId = attrs.id || null;
      const ulClass = attrs.class || null;

      // find matching closing '</ul>' (we expect ulHtml contains one full UL)
      // content between opening and closing:
      const closeToken = "</ul>";
      const closeIndex = ulHtmlLower.lastIndexOf(closeToken);
      const innerHtml = closeIndex === -1 ? "" : ulHtml.slice(firstGT + 1, closeIndex);

      // parse child <li> blocks by scanning
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

        // extract attributes from the <li ...>
        const liOpenTagEnd = liBlock.indexOf(">");
        const liOpenTag = liOpenTagEnd === -1 ? "" : liBlock.slice(0, liOpenTagEnd + 1);
        const liAttrs = parseAttrs(liOpenTag);
        let id = null;
        if (liAttrs.class) {
          const idm = liAttrs.class.match(/menu-item-(\d+)/);
          if (idm) id = idm[1];
        }

        // extract first <a ...>...</a> inside li
        const aMatch = liBlock.match(/<a[^>]*href=(['"])(.*?)\1[^>]*>([\s\S]*?)<\/a>/i);
        let url = null;
        let title = "";
        if (aMatch) {
          url = aMatch[2].trim();
          // convert site-absolute to relative path when possible
          try {
            if (url.includes("multimovies.pro")) {
              url = new URL(url).pathname;
            }
          } catch (e) { /* ignore */ }
          title = aMatch[3].replace(/<[^>]+>/g, "").trim();
        }

        // find nested <ul> blocks inside this li (can be multiple, but usually one)
        const children = [];
        let subPos = 0;
        const liLower = liBlockLower;
        while (true) {
          const subOpen = liLower.indexOf("<ul", subPos);
          if (subOpen === -1) break;
          const subEnd = findMatchingTag(liLower, subOpen, "ul");
          if (subEnd === -1) break;
          const subHtml = liBlock.slice(subOpen, subEnd);
          const parsedSub = parseUlString(subHtml);
          // parsedSub.items is an array
          parsedSub.items.forEach((it) => children.push(it));
          subPos = subEnd;
        }

        const node = { id, title, url, items: children };
        items.push(node);

        pos = liEnd;
      }

      return { type: "ul", id: ulId, class: ulClass, items };
    }

    // Find all top-level <ul> inside menuBlock that are relevant (id="main_header" and/or classes)
    const ulResults = [];
    let scanPos = 0;
    while (true) {
      const ulIndex = menuBlockLower.indexOf("<ul", scanPos);
      if (ulIndex === -1) break;
      const ulEnd = findMatchingTag(menuBlockLower, ulIndex, "ul");
      if (ulEnd === -1) break;
      const fullUl = menuBlock.slice(ulIndex, ulEnd);
      // parse attributes of opening UL
      const openGt = fullUl.indexOf(">");
      const openTag = openGt === -1 ? fullUl : fullUl.slice(0, openGt + 1);
      const attrs = parseAttrs(openTag);
      // we keep all ULs, but we'll flag ones matching id/class we care about
      ulResults.push({ fullUl, id: attrs.id || null, class: attrs.class || null });
      scanPos = ulEnd;
    }

    // Build final slotted JSON: collect all ULs (desktop and responsive if both exist)
    const menus = ulResults.map((u) => parseUlString(u.fullUl));

    // Extract logo(s) (desktop + responsive) from whole page
    const logos = [];
    const logoRegex = /<div[^>]*class=["']logo["'][^>]*>[\s\S]*?<img[^>]*?(?:data-src|src)=['"]([^'"]+)['"][^>]*>/ig;
    let lm;
    while ((lm = logoRegex.exec(html)) !== null) {
      logos.push(lm[1]);
    }

    // Extract search form actions (desktop and responsive)
    const searchForms = [];
    const searchRegex = /<form[^>]*id=['"]?(searchform|form-search-resp)[\'"]?[^>]*action=['"]([^'"]+)['"][^>]*>/ig;
    let sm;
    while ((sm = searchRegex.exec(html)) !== null) {
      searchForms.push({ id: sm[1], action: sm[2] });
    }

    // Also try generic account/login link
    const loginMatch = html.match(/<a[^>]*href=['"]([^'"]*\/account\/\?action=log-in[^'"]*)['"][^>]*class=['"][^'"]*clicklogin[^'"]*['"][^>]*>/i);
    const loginUrl = loginMatch ? loginMatch[1] : null;

    // Return full slotted JSON result
    const result = {
      menus,          // array of parsed ULs (each has type,id,class,items)
      logos,          // array of logo image URLs (desktop + responsive if present)
      searchForms,    // forms found
      loginUrl,       // login link if found
      raw: { menuStartIndex: menuStart } // small debug info
    };

    res.setHeader("Content-Type", "application/json");
    return res.status(200).json(result);
  } catch (err) {
    console.error("Scrape error:", err);
    res.setHeader("Content-Type", "application/json");
    return res.status(500).json({ error: String(err) });
  }
}
