export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);

    const action = searchParams.get("action");
    const id = searchParams.get("id");
    const address = searchParams.get("address");

    if (action !== "delete") {
      return new Response(
        JSON.stringify({ error: "Invalid action" }),
        { status: 400 }
      );
    }

    if (!id || !address) {
      return new Response(
        JSON.stringify({ error: "Missing id or address" }),
        { status: 400 }
      );
    }

    const apiUrl = `https://api.catchmail.io/api/v1/message/${id}?mailbox=${encodeURIComponent(address)}`;

    const response = await fetch(apiUrl, {
      method: "DELETE",
    });

    const data = await response.text();

    return new Response(
      JSON.stringify({
        success: true,
        api_response: data,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500 }
    );
  }
}
