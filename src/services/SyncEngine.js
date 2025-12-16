/**
 * Sync Engine для об'єднання графіків з Telegram та Zoe
 *
 * Основні принципи:
 * 1. Лайнографіки (parsed.date < today) завжди ігноруються
 * 2. Zoe з раннішим часом має пріоритет над Telegram з тим самим контентом
 * 3. Один день = один запис в БД (фінальний стан)
 * 4. update_count = реальна кількість змін (не інкремент)
 */

import { fetchTelegramUpdates } from "../scraper/telegramScraper.js";
import { fetchZoeUpdates, parseZoeHTML } from "../scraper/zoeScraper.js";
import { parseScheduleMessage } from "../scraper/parser.js";
import { db } from "../db.js";
import { invalidateScheduleCaches } from "../utils/cacheHelper.js";
import Logger from "../utils/logger.js";
import { NotificationService } from "./NotificationService.js";
import { rescheduleNotifications } from "./ScheduleNotificationService.js";

/**
 * Фільтрує лайнографіки (графіки з датою меншою за сьогодні)
 */
function filterLineographs(updates, skipDateFilter = false) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  return updates.filter(update => {
    if (!update.parsed.date) return false;

    // Фільтруємо графіки старші за 7 днів (тільки для orchestrator, не для bootstrap)
    if (!skipDateFilter) {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const minDateStr = sevenDaysAgo.toISOString().split('T')[0];

      if (update.parsed.date < minDateStr) {
        Logger.debug('SyncEngine', `Filtered old schedule: date=${update.parsed.date} (min=${minDateStr})`);
        return false;
      }
    }

    return true;
  });
}

/**
 * Нормалізує контент для порівняння (видаляє порядок та форматування)
 */
function normalizeQueuesForComparison(queues) {
  // Сортуємо черги та інтервали для коректного порівняння
  const normalized = queues.map(q => ({
    queue: q.queue,
    intervals: [...q.intervals].sort((a, b) => {
      if (a.start !== b.start) return a.start.localeCompare(b.start);
      return a.end.localeCompare(b.end);
    })
  })).sort((a, b) => a.queue.localeCompare(b.queue));

  return JSON.stringify(normalized);
}

/**
 * Перевіряє чи два апдейти є дублікатами (однаковий контент)
 */
function areDuplicates(update1, update2) {
  const content1 = normalizeQueuesForComparison(update1.parsed.queues);
  const content2 = normalizeQueuesForComparison(update2.parsed.queues);
  return content1 === content2;
}

/**
 * Будує хронологію апдейтів для однієї дати
 *
 * Логіка пріоритетів:
 * 1. Zoe без messageDate вважається раннім (має пріоритет)
 * 2. При однаковому контенті - ранній апдейт має пріоритет
 * 3. При різному контенті - всі апдейти враховуються
 */
function buildTimeline(updates) {
  if (updates.length === 0) return [];

  const timeline = [];

  // Сортуємо апдейти:
  // 1. Zoe без messageDate (найраніший)
  // 2. За messageDate (якщо є)
  // 3. За sourceId (для однакових дат)
  const sorted = [...updates].sort((a, b) => {
    // Zoe без messageDate завжди першим
    const aHasDate = !!a.messageDate;
    const bHasDate = !!b.messageDate;

    if (!aHasDate && bHasDate) return -1;
    if (aHasDate && !bHasDate) return 1;

    // Якщо обидва мають дату - порівнюємо
    if (aHasDate && bHasDate) {
      const diff = new Date(a.messageDate) - new Date(b.messageDate);
      if (diff !== 0) return diff;
    }

    // Якщо дати однакові або обидва без дати - за sourceId
    return a.sourceId - b.sourceId;
  });

  // Будуємо timeline, видаляючи дублікати або замінюючи старіші версії
  for (const update of sorted) {
    // Перевіряємо чи є дублікат в timeline
    const duplicateIndex = timeline.findIndex(existing => areDuplicates(existing, update));

    if (duplicateIndex !== -1) {
      const existing = timeline[duplicateIndex];

      // Якщо новий апдейт пізніший, замінюємо старий
      const existingTime = existing.messageDate ? new Date(existing.messageDate).getTime() : 0;
      const updateTime = update.messageDate ? new Date(update.messageDate).getTime() : 0;

      if (updateTime > existingTime) {
        Logger.debug('SyncEngine', `Replacing duplicate: old source=${existing.source} (${existing.messageDate}), new source=${update.source} (${update.messageDate})`);
        timeline[duplicateIndex] = update;
      } else {
        Logger.debug('SyncEngine', `Duplicate detected: source=${update.source}, id=${update.sourceId}, date=${update.parsed.date}`);
      }
      continue;
    }

    timeline.push(update);
  }

  // Сортуємо timeline хронологічно (найраніший -> найпізніший)
  timeline.sort((a, b) => {
    const aTime = a.messageDate ? new Date(a.messageDate).getTime() : 0;
    const bTime = b.messageDate ? new Date(b.messageDate).getTime() : 0;
    return aTime - bTime;
  });

  return timeline;
}

/**
 * Збирає всі апдейти з Telegram (dry-run, без запису в БД)
 */
async function fetchAllTelegramUpdates() {
  Logger.info('SyncEngine', 'Fetching Telegram updates (dry-run)...');

  const messages = await fetchTelegramUpdates();

  // Фільтруємо релевантні повідомлення
  const relevant = messages.filter(m =>
    m.text.includes("ГПВ") ||
    m.text.includes("Години відсутності") ||
    m.text.includes("ОНОВЛЕНО")
  );

  // Парсимо всі повідомлення
  const updates = [];

  for (const msg of relevant) {
    const parsed = parseScheduleMessage(msg.text);
    if (parsed.date && parsed.queues.length > 0) {
      updates.push({
        sourceId: msg.id,
        source: 'telegram',
        messageDate: msg.messageDate,
        parsed: parsed
      });
    }
  }

  Logger.info('SyncEngine', `Fetched ${updates.length} Telegram updates`);
  return updates;
}

/**
 * Збирає всі апдейти з Zoe (dry-run, без запису в БД)
 */
async function fetchAllZoeUpdates() {
  Logger.info('SyncEngine', 'Fetching Zoe updates (dry-run)...');

  const html = await fetchZoeUpdates();
  if (!html) {
    Logger.warning('SyncEngine', 'No HTML from Zoe, skipping');
    return [];
  }

  const parsedSchedules = parseZoeHTML(html);

  // Конвертуємо в формат апдейтів
  const updates = parsedSchedules.map((schedule, index) => {
    // Генеруємо унікальний sourceId на основі pagePosition або індексу
    // Наприклад: 20251204001 (дата + позиція на сторінці)
    const dateId = parseInt(schedule.parsed.date.replace(/-/g, ''), 10);
    const position = schedule.pagePosition ?? index;
    const sourceId = dateId * 1000 + position; // Комбінація дати та позиції

    return {
      sourceId: sourceId, // Унікальний ID для кожного оновлення
      source: 'zoe',
      messageDate: schedule.messageDate || null, // Час оновлення з заголовка "(оновлено о XX:XX)"
      parsed: schedule.parsed
    };
  });

  Logger.info('SyncEngine', `Fetched ${updates.length} Zoe updates`);
  const uniqDates = [...new Set(updates.map(u => u.parsed?.date).filter(Boolean))].sort();
  Logger.debug('SyncEngine', `Zoe parsed dates: ${uniqDates.join(', ')}`);
  return updates;
}

/**
 * Групує апдейти по датах
 */
function groupByDate(updates) {
  const grouped = new Map();

  for (const update of updates) {
    const date = update.parsed.date;
    if (!grouped.has(date)) {
      grouped.set(date, []);
    }
    grouped.get(date).push(update);
  }

  return grouped;
}

/**
 * Записує синхронізовані дані в БД
 *
 * Використовує транзакцію для запису:
 * 1. Очищає існуючі дані для дати
 * 2. Записує фінальний стан
 * 3. Оновлює update_count (не інкремент, а реальна кількість)
 *
 * @param {string} date - Дата графіка
 * @param {Array} timeline - Масив оновлень
 * @param {boolean} sendNotifications - Чи надсилати push-сповіщення (false для bootstrap)
 */
function writeSyncedData(date, timeline, sendNotifications = true) {
  if (timeline.length === 0) return { updated: false };

  // Фінальний апдейт = останній в timeline
  const finalUpdate = timeline[timeline.length - 1];
  const updateCount = timeline.length;

  // Перевіряємо чи існують дані в БД і чи вони змінились
  const existingMetadata = db.prepare('SELECT * FROM schedule_metadata WHERE date = ?').get(date);

  Logger.debug('SyncEngine', `Checking ${date}: existingMetadata=${existingMetadata ? 'EXISTS' : 'NULL'}`);

  if (existingMetadata) {
    // Отримуємо існуючі outages для порівняння
    const existingOutages = db.prepare('SELECT queue, start_time, end_time FROM outages WHERE date = ? ORDER BY queue, start_time').all(date);

    // FIX: Якщо метадані є, але графік порожній (наприклад, після ручного видалення або помилки)
    // то вважаємо, що дані треба перезаписати
    if (existingOutages.length === 0) {
      Logger.debug('SyncEngine', `Metadata exists but no outages found for ${date}, forcing write`);
      // Продовжуємо виконання (skip return)
    } else {
      // Конвертуємо в формат queues для порівняння
      const existingQueues = [];
      const queueMap = new Map();

      for (const outage of existingOutages) {
        if (!queueMap.has(outage.queue)) {
          queueMap.set(outage.queue, { queue: outage.queue, intervals: [] });
        }
        queueMap.get(outage.queue).intervals.push({
          start: outage.start_time,
          end: outage.end_time
        });
      }

      queueMap.forEach(q => existingQueues.push(q));

      // Порівнюємо контент
      const existingContent = normalizeQueuesForComparison(existingQueues);
      const newContent = normalizeQueuesForComparison(finalUpdate.parsed.queues);

      if (existingContent === newContent) {
        Logger.debug('SyncEngine', `✅ ${date}: Content IDENTICAL, skipping (no push will be sent)`);
        return { updated: false, reason: 'no-changes' };
      } else {
        Logger.info('SyncEngine', `🔄 ${date}: Content CHANGED, will update DB and send push`);
      }
    }
  }

  Logger.debug('SyncEngine', `Writing synced data for ${date}: ${updateCount} updates, final from ${finalUpdate.source}`);

  // changeType для метаданих та повідомлень
  // ВАЖЛИВО: визначаємо по наявності існуючих метаданих, а не по кількості оновлень!
  const metadataChangeType = existingMetadata ? 'updated' : 'new';

  // Використовуємо транзакцію для атомарного запису
  const transaction = db.transaction(() => {
    // 1. Видаляємо існуючі дані
    db.prepare('DELETE FROM outages WHERE date = ?').run(date);
    db.prepare('DELETE FROM schedule_history WHERE date = ?').run(date);
    db.prepare('DELETE FROM schedule_metadata WHERE date = ?').run(date);

    // 2. Записуємо outages (фінальний стан)
    const insertOutage = db.prepare(`
      INSERT INTO outages (date, queue, start_time, end_time, source_msg_id, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();

    // Дедуплікація: збираємо унікальні інтервали
    const uniqueOutages = new Set();

    for (const q of finalUpdate.parsed.queues) {
      for (const interval of q.intervals) {
        const key = `${q.queue}|${interval.start}|${interval.end}`;

        if (!uniqueOutages.has(key)) {
          uniqueOutages.add(key);
          insertOutage.run(
            date,
            q.queue,
            interval.start,
            interval.end,
            finalUpdate.sourceId,
            now
          );
        } else {
          Logger.debug('SyncEngine', `Skipping duplicate outage: ${date} ${key}`);
        }
      }
    }

    // 3. Записуємо ВСІ апдейти в історію (не тільки фінальний)
    const insertHistory = db.prepare(`
      INSERT INTO schedule_history (date, source_msg_id, change_type, message_date, data_json, detected_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Записуємо всі оновлення з timeline
    for (let i = 0; i < timeline.length; i++) {
      const update = timeline[i];
      const changeType = i === 0 ? 'new' : 'updated';
      const historyData = JSON.stringify({
        date,
        queues: update.parsed.queues,
        source_msg_id: update.sourceId,
        source: update.source
      });

      // Використовуємо messageDate як detected_at щоб зберегти правильний час
      const detectedAt = update.messageDate || new Date().toISOString();

      insertHistory.run(
        date,
        update.sourceId,
        changeType,
        update.messageDate,
        historyData,
        detectedAt
      );
    }

    // 4. Записуємо метадані з правильним update_count
    const insertMetadata = db.prepare(`
      INSERT INTO schedule_metadata (
        date,
        source_msg_id,
        source,
        message_date,
        first_published_at,
        last_updated_at,
        update_count,
        change_type
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // first_published_at = час першого апдейту
    const firstUpdate = timeline[0];
    const firstPublishedAt = firstUpdate.messageDate || now;

    insertMetadata.run(
      date,
      finalUpdate.sourceId,
      finalUpdate.source,
      finalUpdate.messageDate,
      firstPublishedAt,
      now,
      updateCount - 1, // update_count = кількість змін (не включаючи перший запис)
      metadataChangeType
    );

    Logger.info('SyncEngine', `Synced ${date}`);
  });

  transaction();

  // Send Push Notification ТІЛЬКИ якщо:
  // 1. це НЕ bootstrap (sendNotifications = true)
  // 2. контент РЕАЛЬНО змінився (якщо дійшли до цього місця - значить змінився, бо раніше був return)
  // 3. (для сьогодні - ТІЛЬКИ оновлення) АБО (для завтра+ - нові або оновлені графіки)

  if (sendNotifications) {
    // Визначаємо чи це сьогодні або завтра
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // Логіка відправки push:
    // - Для СЬОГОДНІ: надсилаємо ТІЛЬКИ оновлення (change_type='updated')
    // - Для ЗАВТРА+: надсилаємо І нові графіки (change_type='new') І оновлення (change_type='updated')
    const shouldSendPush =
      (date === today && metadataChangeType === 'updated') ||
      (date >= tomorrowStr); // Для завтра+ надсилаємо завжди (і 'new' і 'updated')

    if (shouldSendPush) {
      Logger.info('SyncEngine', `📨 Sending push notification: date=${date}, type=${metadataChangeType}`);
      NotificationService.notifyScheduleChange(finalUpdate.parsed, metadataChangeType, 'schedule_change').catch(err => {
        Logger.error('SyncEngine', 'Failed to send notification', err);
      });
    } else {
      Logger.debug('SyncEngine', `⏭️  Skipping push: date=${date}, type=${metadataChangeType} (not matching criteria)`);
    }

    // Перепланувати автоматичні сповіщення
    if (date === today || date === tomorrowStr) {
      try {
        rescheduleNotifications(date);
      } catch (err) {
        Logger.error('SyncEngine', 'Failed to reschedule notifications', err);
      }
    }
  }

  return { updated: true, updateCount, changeType: metadataChangeType };
}

/**
 * Синхронізує апдейти для заданих дат
 * @param {Array} telegramUpdates - Оновлення з Telegram
 * @param {Array} zoeUpdates - Оновлення з Zoe
 * @param {boolean} skipDateFilter - Чи пропускати фільтр по датах
 * @param {boolean} sendNotifications - Чи надсилати push-сповіщення
 */
async function syncUpdates(telegramUpdates, zoeUpdates, skipDateFilter = false, sendNotifications = true) {
  Logger.info('SyncEngine', 'Starting sync process...');

  // 1. Об'єднуємо всі апдейти
  const allUpdates = [...telegramUpdates, ...zoeUpdates];
  Logger.debug('SyncEngine', `Total updates before filtering: ${allUpdates.length}`);

  // 2. Фільтруємо лайнографіки
  const filtered = filterLineographs(allUpdates, skipDateFilter);
  Logger.debug('SyncEngine', `Updates after filtering: ${filtered.length} (removed ${allUpdates.length - filtered.length} lineographs)`);

  // 3. Групуємо по датах
  const grouped = groupByDate(filtered);
  Logger.info('SyncEngine', `Grouped into ${grouped.size} dates`);

  // 4. Будуємо timeline для кожної дати
  const results = {
    total: grouped.size,
    synced: 0,
    skipped: 0,
    dates: []
  };

  for (const [date, updates] of grouped) {
    Logger.debug('SyncEngine', `Processing ${date}: ${updates.length} updates`);

    // Будуємо timeline (фільтруємо дублікати, визначаємо пріоритети)
    const timeline = buildTimeline(updates);
    Logger.debug('SyncEngine', `Timeline for ${date}: ${timeline.length} unique updates (removed ${updates.length - timeline.length} duplicates)`);

    if (timeline.length === 0) {
      results.skipped++;
      continue;
    }

    // Записуємо синхронізовані дані
    const result = writeSyncedData(date, timeline, sendNotifications);

    if (result.updated) {
      results.synced++;
      results.dates.push({
        date,
        updateCount: result.updateCount,
        changeType: result.changeType
      });
    } else {
      results.skipped++;
      const reason = result.reason || 'no-updates';
      Logger.debug('SyncEngine', `Skipped ${date}: ${reason}`);
    }
  }

  // 5. Інвалідуємо кеш
  if (results.synced > 0) {
    invalidateScheduleCaches();
    Logger.success('SyncEngine', 'Cache invalidated');
  }

  return results;
}

/**
 * Bootstrap: початкова синхронізація всіх даних
 * Обробляє всі дані з обох джерел
 * БЕЗ надсилання push-сповіщень (тільки заповнення БД)
 */
export async function bootstrap() {
  Logger.info('SyncEngine', '=== BOOTSTRAP: Starting initial sync ===');

  try {
    // 1. Збираємо всі дані
    const [telegramUpdates, zoeUpdates] = await Promise.all([
      fetchAllTelegramUpdates(),
      fetchAllZoeUpdates()
    ]);

    // 2. Синхронізуємо БЕЗ надсилання сповіщень (тільки заповнення БД)
    const results = await syncUpdates(telegramUpdates, zoeUpdates, true, false);

    Logger.success('SyncEngine', `=== BOOTSTRAP COMPLETED ===`);
    Logger.info('SyncEngine', `Total dates: ${results.total}, Synced: ${results.synced}, Skipped: ${results.skipped}`);

    return results;
  } catch (error) {
    Logger.error('SyncEngine', 'Bootstrap failed', error);
    throw error;
  }
}

/**
 * Orchestrator: регулярна синхронізація (останні 7 днів)
 * Викликається кожні 5 хвилин
 * Надсилає push-сповіщення ТІЛЬКИ якщо знайдено РЕАЛЬНІ зміни (для сьогодні/завтра)
 */
export async function orchestrator() {
  Logger.info('SyncEngine', '=== ORCHESTRATOR: Starting periodic sync ===');

  try {
    // 1. Збираємо дані (та сама логіка що й bootstrap)
    const [telegramUpdates, zoeUpdates] = await Promise.all([
      fetchAllTelegramUpdates(),
      fetchAllZoeUpdates()
    ]);

    // 2. Фільтруємо тільки останні 7 днів
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    const recentTelegram = telegramUpdates.filter(u => u.parsed.date >= sevenDaysAgoStr);
    const recentZoe = zoeUpdates.filter(u => u.parsed.date >= sevenDaysAgoStr);

    Logger.debug('SyncEngine', `Filtered to last 7 days: Telegram=${recentTelegram.length}, Zoe=${recentZoe.length}`);

    // 3. Синхронізуємо з надсиланням push (тільки якщо є зміни для сьогодні/завтра)
    const results = await syncUpdates(recentTelegram, recentZoe);

    Logger.success('SyncEngine', `=== ORCHESTRATOR COMPLETED ===`);
    Logger.info('SyncEngine', `Total dates: ${results.total}, Synced: ${results.synced}, Skipped: ${results.skipped}`);

    return results;
  } catch (error) {
    Logger.error('SyncEngine', 'Orchestrator failed', error);
    throw error;
  }
}

/**
 * Ручний запуск синхронізації для конкретної дати
 * Корисно для тестування та дебагу
 */
export async function syncDate(date) {
  Logger.info('SyncEngine', `=== SYNC DATE: ${date} ===`);

  try {
    // 1. Збираємо дані
    const [telegramUpdates, zoeUpdates] = await Promise.all([
      fetchAllTelegramUpdates(),
      fetchAllZoeUpdates()
    ]);

    // 2. Фільтруємо тільки задану дату
    const dateTelegram = telegramUpdates.filter(u => u.parsed.date === date);
    const dateZoe = zoeUpdates.filter(u => u.parsed.date === date);

    Logger.info('SyncEngine', `Found updates for ${date}: Telegram=${dateTelegram.length}, Zoe=${dateZoe.length}`);

    // 3. Синхронізуємо
    const results = await syncUpdates(dateTelegram, dateZoe);

    Logger.success('SyncEngine', `=== SYNC DATE COMPLETED ===`);

    return results;
  } catch (error) {
    Logger.error('SyncEngine', `Sync date ${date} failed`, error);
    throw error;
  }
}
