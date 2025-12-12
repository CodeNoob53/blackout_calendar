import * as cheerio from "cheerio";
import config from "../config/index.js";

const CHANNEL_URL = config.telegram.channelUrl;

// Fetch raw Telegram channel messages (id, text, datetime)
export async function fetchTelegramUpdates() {
  const response = await fetch(CHANNEL_URL);
  const html = await response.text();
  const $ = cheerio.load(html);

  const messages = [];

  $(".tgme_widget_message_wrap").each((_, el) => {
    const $msg = $(el).find(".tgme_widget_message");
    const text = $msg.find(".tgme_widget_message_text").text().trim();
    const link = $msg.find(".tgme_widget_message_date").attr("href");
    const idMatch = link?.match(/\/(\d+)$/);
    const postId = idMatch ? Number(idMatch[1]) : null;

    const dateElement = $msg.find(".tgme_widget_message_date time");
    const messageDate = dateElement.attr("datetime") || null;

    if (!postId || !text) return;

    messages.push({ id: postId, text, messageDate });
  });

  return messages;
}
