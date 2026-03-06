export const config = {
  runtime: "edge",
};

async function deleteMessage(id, mailbox) {
  const url = `https://api.catchmail.io/api/v1/message/${id}?mailbox=${encodeURIComponent(mailbox)}`;
  const res = await fetch(url, { method: "DELETE" });
  return { ok: res.ok, status: res.status };
}

async function fetchAllMessages(address) {
  const allMessages = [];
  let page = 1;
  const pageSize = 50;

  while (true) {
    const inboxUrl =
      `https://api.catchmail.io/api/v1/mailbox?address=${encodeURIComponent(address)}&page=${page}&page_size=${pageSize}`;

    let inboxRes;
    try {
      inboxRes = await fetch(inboxUrl);
    } catch (fetchErr) {
      return { error: `Network error on page ${page}: ${fetchErr.message}`, messages: allMessages };
    }

    const rawText = await inboxRes.text();

    if (!inboxRes.ok) {
      return { error: `API returned ${inboxRes.status}: ${rawText}`, messages: allMessages };
    }

    let inbox;
    try {
      inbox = JSON.parse(rawText);
    } catch (parseErr) {
      return { error: `JSON parse failed: ${rawText.slice(0, 200)}`, messages: allMessages };
    }

    if (!inbox.messages || inbox.messages.length === 0) break;

    allMessages.push(...inbox.messages);
    if (inbox.messages.length < pageSize) break;
    page++;
  }

  return { messages: allMessages };
}

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);

    const action = searchParams.get("action");
    const id = searchParams.get("id");
    const address = searchParams.get("address");

    if (!address) {
      return new Response(
        JSON.stringify({ error: "address required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // -------------------
    // DEBUG: RAW INBOX
    // -------------------
    if (action === "debug_inbox") {
      const inboxUrl = `https://api.catchmail.io/api/v1/mailbox?address=${encodeURIComponent(address)}`;
      const res = await fetch(inboxUrl);
      const raw = await res.text();
      return new Response(JSON.stringify({
        http_status: res.status,
        raw_response: raw
      }, null, 2), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // -------------------
    // DELETE SINGLE MAIL
    // -------------------
    if (action === "delete") {
      if (!id) {
        return new Response(
          JSON.stringify({ error: "id required" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const url = `https://api.catchmail.io/api/v1/message/${id}?mailbox=${encodeURIComponent(address)}`;
      const res = await fetch(url, { method: "DELETE" });
      const body = await res.text();

      return new Response(JSON.stringify({
        success: res.ok,
        deleted: id,
        api_status: res.status,
        api_response: body
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // -------------------
    // DELETE ALL MAILS
    // -------------------
    if (action === "delete_all") {

      const result = await fetchAllMessages(address);

      if (result.error) {
        return new Response(JSON.stringify({
          success: false,
          fetch_error: result.error
        }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }

      const allMessages = result.messages;

      if (allMessages.length === 0) {
        return new Response(JSON.stringify({
          success: false,
          message: "API returned 0 messages",
          hint: "Call ?action=debug_inbox&address=YOUR_ADDRESS to inspect raw API response"
        }), {
          headers: { "Content-Type": "application/json" }
        });
      }

      // Delete all in parallel
      const deleteResults = await Promise.allSettled(
        allMessages.map(async (msg) => {
          const result = await deleteMessage(msg.id, address);
          return { id: msg.id, ...result };
        })
      );

      const settled = deleteResults.map(r => r.value ?? { error: r.reason });
      const totalDeleted = settled.filter(r => r.ok).length;

      return new Response(JSON.stringify({
        success: true,
        found: allMessages.length,
        deleted_total: totalDeleted,
        failed: allMessages.length - totalDeleted,
        details: settled
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(
      JSON.stringify({ error: "invalid action" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message, stack: err.stack }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
