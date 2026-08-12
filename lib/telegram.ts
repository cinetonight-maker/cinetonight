import "server-only";

/** Posts a message to the configured Telegram channel via the Bot API.
 *  No-op (not an error) when the bot isn't configured yet — lets the rest
 *  of the app call this freely without every caller needing its own
 *  "is this set up?" check. Requires the bot to already be added to the
 *  target channel as an admin (see the setup steps you were given). */
export async function sendTelegramMessage(text: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { ok: false, error: "Telegram bot is not configured." };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) return { ok: false, error: data?.description || `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
