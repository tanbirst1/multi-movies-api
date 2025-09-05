addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const targetUrl = "https://multimovies.pro/"; // Page to scrape

  try {
    const res = await fetch(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0" } // mimic browser
    });
    const html = await res.text();

    // Parse HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const menuContainer = doc.querySelector(".menu-menu1-container ul#main_header");
    if (!menuContainer) {
      return new Response(JSON.stringify({ error: "Menu not found" }, null, 2), { status: 404 });
    }

    // Recursive function to extract menu items
    function parseMenu(ul) {
      const items = [];
      ul.querySelectorAll(":scope > li").forEach(li => {
        const a = li.querySelector(":scope > a");
        if (!a) return;

        const item = {
          id: li.className.match(/menu-item-(\d+)/)?.[1] || null,
          title: a.textContent.trim(),
          url: a.href || null
        };

        const subMenu = li.querySelector(":scope > ul.sub-menu");
        if (subMenu) {
          item.submenu = parseMenu(subMenu);
        }

        items.push(item);
      });
      return items;
    }

    const menuData = parseMenu(menuContainer);

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
