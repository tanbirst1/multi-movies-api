export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);

    const action = searchParams.get("action");
    const id = searchParams.get("id");
    const address = searchParams.get("address");

    if (!address) {
      return new Response(JSON.stringify({ error: "Missing address" }), {
        status: 400,
      });
    }

    // -----------------------
    // DELETE SINGLE MESSAGE
    // -----------------------
    if (action === "delete") {
      if (!id) {
        return new Response(JSON.stringify({ error: "Missing id" }), {
          status: 400,
        });
      }

      const apiUrl = `https://api.catchmail.io/api/v1/message/${id}?mailbox=${encodeURIComponent(
        address
      )}`;

      const res = await fetch(apiUrl, { method: "DELETE" });

      return new Response(
        JSON.stringify({
          success: true,
          deleted_id: id,
          status: res.status,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // -----------------------
    // DELETE ALL MESSAGES
    // -----------------------
    if (action === "delete_all") {
      const inboxUrl = `https://api.catchmail.io/api/v1/inbox?mailbox=${encodeURIComponent(
        address
      )}`;

      const inboxRes = await fetch(inboxUrl);
      const inboxData = await inboxRes.json();

      if (!inboxData.messages || inboxData.messages.length === 0) {
        return new Response(
          JSON.stringify({ success: true, message: "Inbox already empty" }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      let deleted = [];

      for (const msg of inboxData.messages) {
        const deleteUrl = `https://api.catchmail.io/api/v1/message/${msg.id}?mailbox=${encodeURIComponent(
          address
        )}`;

        await fetch(deleteUrl, { method: "DELETE" });

        deleted.push(msg.id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          deleted_count: deleted.length,
          deleted_ids: deleted,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
    });
  }
}
