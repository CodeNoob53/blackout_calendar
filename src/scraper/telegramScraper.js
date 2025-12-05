import * as cheerio from "cheerio";
import { parseScheduleMessage } from "./parser.js";
import {
  insertParsedSchedule,
  saveTelegramSnapshot,
  getTelegramVersionByPostId,
  getLatestTelegramVersion,
  saveTelegramVersion
} from "../db.js";
import config from "../config/index.js";
import { invalidateScheduleCaches } from "../utils/cacheHelper.js";
import Logger from "../utils/logger.js";
import {
  generateScheduleHash,
  generateTelegramVersionId,
  schedulesAreIdentical,
  findScheduleDifferences,
  formatDifferencesDescription
} from "../utils/versionHelper.js";

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

/**
 * Оновити дані з Telegram каналу
 *
 * НОВА ЛОГІКА ВЕРСІОНУВАННЯ:
 * 1. Зберігаємо кожен пост як snapshot
 * 2. Для кожного графіка генеруємо хеш контенту
 * 3. Якщо хеш змінився - створюємо нову версію
 * 4. Version ID формату: tg-2537, tg-2538...
 */
export async function updateFromTelegram() {
  Logger.info('TgScraper', 'Fetching updates from Telegram channel...');

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
      // Зберігаємо snapshot для кожного поста
      const snapshotId = saveTelegramSnapshot(msg.id, msg.messageDate, msg.text, parsed);

      parsedMessages.push({
        msgId: msg.id,
        parsed: parsed,
        messageDate: msg.messageDate,
        snapshotId: snapshotId
      });
    }
  }

  Logger.info('TgScraper', `Found ${parsedMessages.length} potential schedules`);

  // Сортуємо за ID (від старих до нових), щоб обробляти оновлення в правильному порядку
  parsedMessages.sort((a, b) => a.msgId - b.msgId);

  // Обробляємо всі повідомлення в хронологічному порядку
  let updated = 0;
  let skipped = 0;
  const newSchedules = [];
  const updatedSchedules = [];

  for (const { msgId, parsed, messageDate, snapshotId } of parsedMessages) {
    // Перевіряємо чи вже обробили цей пост
    const existingVersion = getTelegramVersionByPostId(msgId);
    if (existingVersion) {
      Logger.debug('TgScraper', `Post ${msgId} already processed, skipping`);
      skipped++;
      continue;
    }

    // Генеруємо хеш контенту
    const contentHash = generateScheduleHash(parsed);

    // Перевіряємо чи є попередня версія для цієї дати
    const latestVersion = getLatestTelegramVersion(parsed.date);
    let changeType = 'new';

    if (latestVersion) {
      // Є попередня версія - порівнюємо хеші
      if (schedulesAreIdentical(contentHash, latestVersion.content_hash)) {
        // Контент ідентичний - але це новий пост, можливо репост або дублікат
        Logger.debug('TgScraper', `Post ${msgId} for ${parsed.date} has identical content to previous version`);
        // Все одно зберігаємо, бо це окремий пост
        changeType = 'updated'; // Технічно це "оновлення" хоч контент той самий
      } else {
        // Контент змінився
        const oldData = JSON.parse(latestVersion.schedule_data);
        const differences = findScheduleDifferences(oldData, parsed);
        const diffDescription = formatDifferencesDescription(differences);
        Logger.info('TgScraper', `Post ${msgId}: Schedule for ${parsed.date} changed: ${diffDescription}`);
        changeType = 'updated';
      }
    }

    // Створюємо version ID
    const versionId = generateTelegramVersionId(msgId);

    // Зберігаємо версію
    const saved = saveTelegramVersion(
      versionId,
      parsed.date,
      msgId,
      messageDate,
      contentHash,
      parsed,
      snapshotId,
      changeType
    );

    if (!saved) {
      Logger.error('TgScraper', `Failed to save version ${versionId}`);
      continue;
    }

    // Також зберігаємо в старі таблиці для backward compatibility
    const result = insertParsedSchedule(parsed, msgId, messageDate, 'telegram');

    if (!result.updated) {
      skipped++;
    } else {
      updated++;
      Logger.success('TgScraper', `${changeType === 'new' ? 'New' : 'Updated'} ${parsed.date} from post ${msgId} (${versionId})`);

      // Зберігаємо для push-повідомлень тільки останні зміни для кожної дати
      if (changeType === "new") {
        // Видаляємо попередню new-запис для цієї дати (якщо є)
        const existingIndex = newSchedules.findIndex(s => s.date === parsed.date);
        if (existingIndex !== -1) {
          newSchedules.splice(existingIndex, 1);
        }

        newSchedules.push({
          date: parsed.date,
          messageDate: result.messageDate,
          postId: msgId,
          versionId: versionId
        });
      } else {
        // Видаляємо попередній updated-запис для цієї дати (якщо є)
        const existingIndex = updatedSchedules.findIndex(s => s.date === parsed.date);
        if (existingIndex !== -1) {
          updatedSchedules.splice(existingIndex, 1);
        }

        updatedSchedules.push({
          date: parsed.date,
          messageDate: result.messageDate,
          postId: msgId,
          versionId: versionId
        });
      }
    }
  }

  Logger.info('TgScraper', `Processed: ${parsedMessages.length} total, ${updated} updated, ${skipped} skipped`);

  // Інвалідуємо кеш після оновлення даних
  if (updated > 0) {
    invalidateScheduleCaches();
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
