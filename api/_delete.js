export const config = {
  runtime: "edge",
};

async function deleteMessage(id, address) {
  const url =
    `https://api.catchmail.io/api/v1/message/${id}?mailbox=${encodeURIComponent(address)}`;

  const res = await fetch(url, {
    method: "DELETE",
  });

  return res.status;
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
        { status: 400 }
      );
    }

    // -------------------
    // DELETE SINGLE MAIL
    // -------------------
    if (action === "delete") {

      if (!id) {
        return new Response(
          JSON.stringify({ error: "id required" }),
          { status: 400 }
        );
      }

      await deleteMessage(id, address);

      return new Response(
        JSON.stringify({
          success: true,
          deleted_id: id
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // -------------------
    // DELETE ALL MAILS
    // -------------------
    if (action === "delete_all") {

      const inboxUrl =
        `https://api.catchmail.io/api/v1/messages?address=${encodeURIComponent(address)}`;

      const inboxRes = await fetch(inboxUrl);
      const inbox = await inboxRes.json();

      if (!inbox.messages || inbox.messages.length === 0) {
        return new Response(
          JSON.stringify({
            success: true,
            deleted_total: 0
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      let deleted = 0;

      for (const msg of inbox.messages) {
        await deleteMessage(msg.id, address);
        deleted++;
      }

      return new Response(
        JSON.stringify({
          success: true,
          deleted_total: deleted
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "invalid action" }),
      { status: 400 }
    );

  } catch (err) {

    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500 }
    );

  }
}
