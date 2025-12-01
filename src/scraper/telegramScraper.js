import * as cheerio from "cheerio";
import { parseScheduleMessage } from "./parser.js";
import { insertParsedSchedule } from "../db.js";
import config from "../config/index.js";
import cache from "../utils/cache.js";

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

  // Парсимо всі повідомлення та сортуємо їх за ID (від старих до нових)
  const parsedMessages = [];

  for (const msg of relevant) {
    const parsed = parseScheduleMessage(msg.text);
    if (parsed.date && parsed.queues.length > 0) {
      parsedMessages.push({
        msgId: msg.id,
        parsed: parsed,
        messageDate: msg.messageDate
      });
    }
  }

  // Сортуємо за ID (від старих до нових), щоб обробляти оновлення в правильному порядку
  parsedMessages.sort((a, b) => a.msgId - b.msgId);

  // Обробляємо всі повідомлення в хронологічному порядку
  let updated = 0;
  let skipped = 0;
  const newSchedules = [];
  const updatedSchedules = [];

  for (const { msgId, parsed, messageDate } of parsedMessages) {
    const result = insertParsedSchedule(parsed, msgId, messageDate);

    if (!result.updated) {
      skipped++;
    } else {
      updated++;

      // Зберігаємо для push-повідомлень тільки останні зміни для кожної дати
      if (result.changeType === "new") {
        // Видаляємо попередню new-запис для цієї дати (якщо є)
        const existingIndex = newSchedules.findIndex(s => s.date === parsed.date);
        if (existingIndex !== -1) {
          newSchedules.splice(existingIndex, 1);
        }

        newSchedules.push({
          date: parsed.date,
          messageDate: result.messageDate,
          postId: msgId
        });
      } else if (result.changeType === "updated") {
        // Видаляємо попередній updated-запис для цієї дати (якщо є)
        const existingIndex = updatedSchedules.findIndex(s => s.date === parsed.date);
        if (existingIndex !== -1) {
          updatedSchedules.splice(existingIndex, 1);
        }

        updatedSchedules.push({
          date: parsed.date,
          messageDate: result.messageDate,
          postId: msgId
        });
      }
    }
  }

  // Лог буде виведено через Logger.updateSummary() у server.js

  // Інвалідуємо кеш після оновлення даних
  if (updated > 0) {
    cache.delete('schedules:all-dates');
    cache.delete('schedules:latest');
    cache.delete('schedules:today-status');
  }

  // Повертаємо дані для push-повідомлень
  return {
    total: parsedMessages.length,
    updated,
    skipped,
    newSchedules,
    updatedSchedules
  };
}
