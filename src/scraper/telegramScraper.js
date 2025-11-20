import * as cheerio from "cheerio";
import { parseScheduleMessage } from "./parser.js";
import { insertParsedSchedule } from "../db.js";
import config from "../config/index.js";

const CHANNEL_URL = config.telegram.channelUrl;

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

    // Отримуємо дату публікації повідомлення
    const dateElement = $msg.find(".tgme_widget_message_date time");
    const messageDate = dateElement.attr("datetime") || null;

    if (!postId || !text) return;

    messages.push({ id: postId, text, messageDate });
  });

  return messages;
}

export async function updateFromTelegram() {
  const msgs = await fetchTelegramUpdates();

  // Беремо тільки повідомлення з ключовими словами
  const relevant = msgs.filter(m =>
    m.text.includes("ГПВ") ||
    m.text.includes("Години відсутності") ||
    m.text.includes("ОНОВЛЕНО")
  );

  // Групуємо повідомлення по датах і беремо тільки останнє (з найбільшим ID) для кожної дати
  const schedulesByDate = new Map();

  for (const msg of relevant) {
    const parsed = parseScheduleMessage(msg.text);
    if (parsed.date && parsed.queues.length > 0) {
      const existing = schedulesByDate.get(parsed.date);

      // Зберігаємо тільки повідомлення з найбільшим ID (останнє оновлення)
      if (!existing || msg.id > existing.msgId) {
        schedulesByDate.set(parsed.date, {
          msgId: msg.id,
          parsed: parsed,
          messageDate: msg.messageDate
        });
      }
    }
  }

  // Тепер вставляємо в БД тільки останні версії для кожної дати
  let updated = 0;
  let skipped = 0;
  const newSchedules = [];
  const updatedSchedules = [];

  for (const [, { msgId, parsed, messageDate }] of schedulesByDate) {
    const result = insertParsedSchedule(parsed, msgId, messageDate);

    if (!result.updated) {
      skipped++;
    } else {
      updated++;

      // Зберігаємо для push-повідомлень
      if (result.changeType === "new") {
        newSchedules.push({
          date: parsed.date,
          messageDate: result.messageDate,
          postId: msgId
        });
      } else if (result.changeType === "updated") {
        updatedSchedules.push({
          date: parsed.date,
          messageDate: result.messageDate,
          postId: msgId
        });
      }
    }
  }

  // Лог буде виведено через Logger.updateSummary() у server.js

  // Повертаємо дані для push-повідомлень
  return {
    total: schedulesByDate.size,
    updated,
    skipped,
    newSchedules,
    updatedSchedules
  };
}
