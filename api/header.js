export default async function handler(req, res) {
  try {
    const targetUrl = "https://multimovies.pro/";

    // Fetch raw HTML
    const response = await fetch(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const html = await response.text();

    // Extract menu container
    const menuStart = html.indexOf('<div class="menu-menu1-container">');
    const menuEnd = html.indexOf('</div>', menuStart) + 6;
    if (menuStart === -1 || menuEnd === -1) {
      return res.status(404).json({ error: "Menu not found" });
    }
    const menuHtml = html.slice(menuStart, menuEnd);

    // ---- Parser: turns <ul>/<li> into JSON ----
    function parseMenu(html) {
      const items = [];
      let liRegex = /<li([^>]*)>([\s\S]*?)<\/li>/gi;
      let match;

      while ((match = liRegex.exec(html)) !== null) {
        const liAttrs = match[1];
        const liContent = match[2];

        // Extract ID from class
        const idMatch = liAttrs.match(/menu-item-(\d+)/);
        const id = idMatch ? idMatch[1] : null;

        // Extract <a> (link)
        let title = "";
        let url = null;
        const aMatch = liContent.match(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
        if (aMatch) {
          url = aMatch[1].trim();
          title = aMatch[2].replace(/<[^>]+>/g, "").trim(); // strip nested tags
        }

        // Extract nested submenu
        let submenu = [];
        const subMenuMatch = liContent.match(/<ul[^>]*>([\s\S]*?)<\/ul>/i);
        if (subMenuMatch) {
          submenu = parseMenu(subMenuMatch[1]);
        }

        const node = {
          id,
          title,
          url,
          items: submenu // slotted children
        };

        items.push(node);
      }

      return items;
    }

    // Extract top-level <ul id="main_header">
    const ulMatch = menuHtml.match(/<ul id="main_header"[^>]*>([\s\S]*?)<\/ul>/i);
    if (!ulMatch) {
      return res.status(404).json({ error: "Main menu not found" });
    }

    const slottedJson = {
      type: "ul",
      id: "main_header",
      items: parseMenu(ulMatch[1])
    };

    res.status(200).json(slottedJson);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
