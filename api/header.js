addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const targetUrl = "https://multimovies.pro/";

  try {
    const res = await fetch(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const html = await res.text();

    // Extract the menu container
    const menuMatch = html.match(/<div class="menu-menu1-container">([\s\S]*?)<\/div>/i);
    if (!menuMatch) {
      return new Response(JSON.stringify({ error: "Menu container not found" }, null, 2), { status: 404 });
    }

    const menuHtml = menuMatch[1];

    // Recursive function to parse <ul> ... </ul> and <li> items
    function parseUl(ulHtml) {
      const liRegex = /<li[^>]*class="([^"]*)"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>([\s\S]*?)<\/li>/gi;
      const items = [];
      let match;
      while ((match = liRegex.exec(ulHtml)) !== null) {
        const classNames = match[1];
        const url = match[2];
        const title = match[3].trim();
        const innerHtml = match[4];

        const idMatch = classNames.match(/menu-item-(\d+)/);
        const id = idMatch ? idMatch[1] : null;

        let submenu = null;
        const subUlMatch = innerHtml.match(/<ul class="sub-menu">([\s\S]*?)<\/ul>/i);
        if (subUlMatch) {
          submenu = parseUl(subUlMatch[1]);
        }

        const item = { id, title, url };
        if (submenu) item.submenu = submenu;
        items.push(item);
      }
      return items;
    }

    // Extract top-level <ul id="main_header">
    const topUlMatch = menuHtml.match(/<ul id="main_header" class="resp">([\s\S]*?)<\/ul>/i);
    if (!topUlMatch) {
      return new Response(JSON.stringify({ error: "Main menu ul not found" }, null, 2), { status: 404 });
    }

    const menuData = parseUl(topUlMatch[1]);

    return new Response(JSON.stringify(menuData, null, 2), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }, null, 2), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
