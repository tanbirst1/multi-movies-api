export const config = {
  runtime: "edge",
};

async function deleteMessage(id, mailbox) {
  const url = `https://api.catchmail.io/api/v1/message/${id}?mailbox=${encodeURIComponent(mailbox)}`;
  const res = await fetch(url, { method: "DELETE" });
  return res.ok;
}

async function fetchAllMessages(address) {
  const allMessages = [];
  let page = 1;
  const pageSize = 50;

  while (true) {
    const inboxUrl =
      `https://api.catchmail.io/api/v1/inbox?mailbox=${encodeURIComponent(address)}&page=${page}&page_size=${pageSize}`;

    const inboxRes = await fetch(inboxUrl);

    if (!inboxRes.ok) break;

    const inbox = await inboxRes.json();

    if (!inbox.messages || inbox.messages.length === 0) break;

    allMessages.push(...inbox.messages);

    // If we got fewer messages than page_size, we've reached the last page
    if (inbox.messages.length < pageSize) break;

    page++;
  }

  return allMessages;
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
    // DELETE SINGLE MAIL
    // -------------------
    if (action === "delete") {
      if (!id) {
        return new Response(
          JSON.stringify({ error: "id required" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const ok = await deleteMessage(id, address);

      return new Response(JSON.stringify({
        success: ok,
        deleted: id
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // -------------------
    // DELETE ALL MAILS
    // -------------------
    if (action === "delete_all") {

      // Step 1: Fetch ALL messages across all pages first
      const allMessages = await fetchAllMessages(address);

      if (allMessages.length === 0) {
        return new Response(JSON.stringify({
          success: true,
          deleted_total: 0,
          message: "Inbox already empty"
        }), {
          headers: { "Content-Type": "application/json" }
        });
      }

      // Step 2: Delete all fetched messages (in parallel for speed)
      const results = await Promise.all(
        allMessages.map((msg) => deleteMessage(msg.id, address))
      );

      const totalDeleted = results.filter(Boolean).length;

      return new Response(JSON.stringify({
        success: true,
        found: allMessages.length,
        deleted_total: totalDeleted
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
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
