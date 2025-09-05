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
addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest() {
  const targetUrl = "https://multimovies.pro/";

  try {
    const res = await fetch(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const html = await res.text();

    // 1. Extract menu container
    const menuStart = html.indexOf('<div class="menu-menu1-container">');
    const menuEnd = html.indexOf('</div>', menuStart);
    if (menuStart === -1 || menuEnd === -1) {
      return new Response(JSON.stringify({ error: "Menu container not found" }, null, 2), { status: 404 });
    }
    const menuHtml = html.slice(menuStart, menuEnd + 6);

    // 2. Parse all <li> recursively
    function parseMenu(htmlChunk) {
      const items = [];
      let pos = 0;

      while (true) {
        const liStart = htmlChunk.indexOf('<li', pos);
        if (liStart === -1) break;
        const liEnd = htmlChunk.indexOf('</li>', liStart);
        if (liEnd === -1) break;

        const liHtml = htmlChunk.slice(liStart, liEnd + 5);

        // Extract class/id
        const classMatch = liHtml.match(/class="([^"]+)"/);
        const idMatch = classMatch ? classMatch[1].match(/menu-item-(\d+)/) : null;
        const id = idMatch ? idMatch[1] : null;

        // Extract <a> link
        const aMatch = liHtml.match(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/);
        const url = aMatch ? aMatch[1] : null;
        const title = aMatch ? aMatch[2].trim() : null;

        // Extract submenu recursively
        let submenu = null;
        const subUlStart = liHtml.indexOf('<ul class="sub-menu">');
        const subUlEnd = liHtml.indexOf('</ul>', subUlStart);
        if (subUlStart !== -1 && subUlEnd !== -1) {
          const subUlHtml = liHtml.slice(subUlStart + 18, subUlEnd);
          submenu = parseMenu(subUlHtml);
        }

        const item = { id, title, url };
        if (submenu) item.submenu = submenu;

        items.push(item);
        pos = liEnd + 5;
      }

      return items;
    }

    // 3. Extract main <ul id="main_header">
    const ulStart = menuHtml.indexOf('<ul id="main_header"');
    const ulEnd = menuHtml.indexOf('</ul>', ulStart);
    if (ulStart === -1 || ulEnd === -1) {
      return new Response(JSON.stringify({ error: "Main menu not found" }, null, 2), { status: 404 });
    }
    const ulHtml = menuHtml.slice(ulStart, ulEnd + 5);

    const menuData = parseMenu(ulHtml);

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
