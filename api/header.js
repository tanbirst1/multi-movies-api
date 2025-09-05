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
    if (menuStart === -1) return res.status(404).json({ error: "Menu not found" });

    const menuHtml = html.slice(menuStart, menuEnd);

    // Pure string-based parser
    function parseMenu(html) {
      const items = [];
      let liRegex = /<li([^>]*)>([\s\S]*?)<\/li>/gi;
      let match;

      while ((match = liRegex.exec(html)) !== null) {
        const liAttrs = match[1];
        const liContent = match[2];

        // Get ID from class
        const idMatch = liAttrs.match(/menu-item-(\d+)/);
        const id = idMatch ? idMatch[1] : null;

        // Get <a> text & href
        let title = "";
        let url = null;
        const aMatch = liContent.match(/<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/i);
        if (aMatch) {
          url = aMatch[1].trim();
          title = aMatch[2].trim();
        }

        // Check for nested <ul class="sub-menu">
        const subMenuMatch = liContent.match(/<ul class="sub-menu">([\s\S]*?)<\/ul>/i);
        let submenu = [];
        if (subMenuMatch) {
          submenu = parseMenu(subMenuMatch[1]); // Recursive
        }

        const item = { id, title, url };
        if (submenu.length) item.submenu = submenu;
        items.push(item);
      }

      return items;
    }

    const menuData = parseMenu(menuHtml);

    res.status(200).json(menuData);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
