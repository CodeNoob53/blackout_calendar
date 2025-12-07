/**
 * Schedule Repository
 * Абстрагує всі операції з базою даних для розкладів
 * Відокремлює логіку БД від бізнес-логіки
 */

import { db } from '../db.js';
import Logger from '../utils/logger.js';

export class ScheduleRepository {
  /**
   * Отримати розклад за датою
   * @param {string} date - Дата у форматі YYYY-MM-DD
   * @returns {Array} Масив записів розкладу
   */
  static findByDate(date) {
    const stmt = db.prepare(`
      SELECT * FROM outages
      WHERE date = ?
      ORDER BY queue, start_time
    `);
    return stmt.all(date);
  }

  /**
   * Отримати розклад за чергою та датою
   * @param {string} queue - Номер черги (X.X)
   * @param {string} date - Дата у форматі YYYY-MM-DD
   * @returns {Array} Масив записів розкладу
   */
  static findByQueueAndDate(queue, date) {
    const stmt = db.prepare(`
      SELECT * FROM outages
      WHERE queue = ? AND date = ?
      ORDER BY start_time
    `);
    return stmt.all(queue, date);
  }

  /**
   * Отримати найновішу дату розкладу
   * Пріоритет: сьогодні > найновіша дата
   * @returns {string|null} Дата або null
   */
  static findLatestDate() {
    const today = new Date().toISOString().split('T')[0];

    // Спочатку перевіряємо сьогодні
    const todayStmt = db.prepare(`
      SELECT DISTINCT date FROM outages WHERE date = ?
    `);
    const todayResult = todayStmt.get(today);
    if (todayResult) {
      return todayResult.date;
    }

    // Якщо на сьогодні немає, повертаємо найновішу
    const latestStmt = db.prepare(`
      SELECT DISTINCT date FROM outages ORDER BY date DESC LIMIT 1
    `);
    const result = latestStmt.get();
    return result?.date ?? null;
  }

  /**
   * Отримати всі доступні дати
   * @param {number} limit - Максимальна кількість результатів
   * @param {number} offset - Зсув для пагінації
   * @returns {Array} Масив об'єктів {date}
   */
  static findAllDates(limit = null, offset = 0) {
    let query = `SELECT DISTINCT date FROM outages ORDER BY date DESC`;

    if (limit !== null) {
      query += ` LIMIT ? OFFSET ?`;
      const stmt = db.prepare(query);
      return stmt.all(limit, offset);
    }

    const stmt = db.prepare(query);
    return stmt.all();
  }

  /**
   * Підрахувати загальну кількість дат
   * @returns {number} Кількість унікальних дат
   */
  static countDates() {
    const stmt = db.prepare(`SELECT COUNT(DISTINCT date) as count FROM outages`);
    const result = stmt.get();
    return result.count;
  }

  /**
   * Перевірити наявність розкладу на сьогодні
   * @returns {Object} {date, available, count}
   */
  static checkTodayAvailability() {
    const today = new Date().toISOString().split('T')[0];
    const stmt = db.prepare(`
      SELECT COUNT(*) as count FROM outages WHERE date = ?
    `);
    const result = stmt.get(today);

    return {
      date: today,
      available: result.count > 0,
      count: result.count
    };
  }

  /**
   * Отримати метадані для дати
   * @param {string} date - Дата у форматі YYYY-MM-DD
   * @returns {Object|null} Об'єкт метаданих або null
   */
  static findMetadataByDate(date) {
    const stmt = db.prepare(`
      SELECT * FROM schedule_metadata WHERE date = ?
    `);
    return stmt.get(date);
  }

  /**
   * Отримати історію змін для дати
   * @param {string} date - Дата у форматі YYYY-MM-DD
   * @returns {Array} Масив записів історії
   */
  static findHistoryByDate(date) {
    const stmt = db.prepare(`
      SELECT * FROM schedule_history
      WHERE date = ?
      ORDER BY detected_at DESC
    `);
    return stmt.all(date);
  }

  /**
   * Отримати нові розклади за останні N годин
   * @param {number} hoursAgo - Кількість годин назад
   * @returns {Array} Масив метаданих нових розкладів
   */
  static findNewSchedules(hoursAgo = 24) {
    const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
    const today = new Date().toISOString().split('T')[0];

    const stmt = db.prepare(`
      SELECT * FROM schedule_metadata
      WHERE date >= ?
        AND (first_published_at > ? OR (change_type = 'updated' AND last_updated_at > ?))
      ORDER BY date DESC, COALESCE(last_updated_at, first_published_at) DESC
    `);

    return stmt.all(today, since, since);
  }

  /**
   * Отримати оновлені розклади за останні N годин
   * @param {number} hoursAgo - Кількість годин назад
   * @returns {Array} Масив метаданих оновлених розкладів
   */
  static findUpdatedSchedules(hoursAgo = 24) {
    const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
    const today = new Date().toISOString().split('T')[0];

    Logger.debug('ScheduleRepository', `Finding updates for ${today} since ${since}`);

    // REMOVED change_type = 'updated' filter to show ALL history for debug
    const stmt = db.prepare(`
      SELECT 
        id, 
        date, 
        source_msg_id, 
        change_type, 
        message_date, 
        detected_at as last_updated_at,
        data_json
      FROM schedule_history
      WHERE date = ?
        AND detected_at > ?
      ORDER BY detected_at DESC
    `);

    const rows = stmt.all(today, since);
    Logger.debug('ScheduleRepository', `Found ${rows.length} history items`);

    // Map history rows to expected object structure
    return rows.map(row => {
      let source = 'telegram';
      try {
        const data = JSON.parse(row.data_json);
        if (data.source) source = data.source;
      } catch (e) { /* ignore parse error */ }

      return {
        ...row,
        source,
        update_count: 1 // Each history item is 1 update
      };
    });
  }

  /**
   * Зберегти або оновити розклад
   * ported from db.insertParsedSchedule
   */
  static upsertSchedule(data, sourceMsgId, messageDate = null, source = 'telegram') {
    const metadata = this.findMetadataByDate(data.date);
    const existingMsgId = metadata?.source_msg_id;
    const existingSource = metadata?.source || 'telegram';

    // Визначаємо тип ID: Telegram (малі числа) vs Zoe (timestamp)
    const isNewFromTelegram = source === 'telegram';
    const isExistingFromTelegram = existingSource === 'telegram';

    // 1. Якщо повідомлення старіше за те, що ми вже обробили - ігноруємо
    if (existingMsgId) {
      // Якщо обидва з одного джерела - просте порівняння
      if (isNewFromTelegram === isExistingFromTelegram) {
        if (sourceMsgId < existingMsgId) {
          // Старіше повідомлення, пропускаємо
          return { updated: false, changeType: null };
        }
      }
      // Якщо з різних джерел - порівнюємо за часом публікації (messageDate)
      else if (messageDate && metadata.message_date) {
        const newTime = new Date(messageDate).getTime();
        const existingTime = new Date(metadata.message_date).getTime();
        if (newTime < existingTime) {
          // Старіше оновлення, пропускаємо
          return { updated: false, changeType: null };
        }
      }
    }



    // 3. Перевірка на зміни
    if (existingMsgId) {
      // Якщо це те саме повідомлення (Edit), перевіряємо чи змінився контент
      if (existingMsgId === sourceMsgId) {
        const existingSchedule = this.findByDate(data.date);
        // Якщо контент ідентичний - ігноруємо
        if (schedulesAreEqual(data.queues, existingSchedule)) {
          return { updated: false, changeType: null };
        }
        // Якщо контент змінився - це Edit, йдемо далі до upsert
      } else {
        // Якщо це НОВЕ повідомлення (New ID), ми його записуємо,
        // навіть якщо контент ідентичний (щоб зафіксувати факт оновлення від обленерго)
        // АЛЕ перевідимо, чи не є це "старе" повідомлення (Condition 1 handled this earlier?)
        // Condition 1 checks "if sourceMsgId < existingMsgId".
        // So here we know it IS new or equal.

        // Optional: If you want to skip identical reposts, keep the check.
        // But user wants to see "3 updates", so we should allow it.
      }
    }

    const now = new Date().toISOString();
    const changeType = existingMsgId ? "updated" : "new";

    const deleteStmt = db.prepare(`
      DELETE FROM outages WHERE date = ?
    `);

    const insertStmt = db.prepare(`
      INSERT INTO outages (date, queue, start_time, end_time, source_msg_id, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertHistory = db.prepare(`
      INSERT INTO schedule_history (date, source_msg_id, change_type, message_date, data_json)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertMetadata = db.prepare(`
      INSERT INTO schedule_metadata (date, source_msg_id, source, message_date, first_published_at, last_updated_at, update_count, change_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateMetadata = db.prepare(`
      UPDATE schedule_metadata
      SET source_msg_id = ?, source = ?, message_date = ?, last_updated_at = ?, update_count = update_count + 1, change_type = ?
      WHERE date = ?
    `);

    const upsertAction = db.transaction((date, queues, msgId, msgDate, chgType, src) => {
      try {
        // Спочатку видаляємо всі старі записи для цієї дати
        deleteStmt.run(date);

        // Потім додаємо нові
        for (const q of queues) {
          for (const interval of q.intervals) {
            insertStmt.run(date, q.queue, interval.start, interval.end, msgId, now);
          }
        }

        // Зберігаємо в історію
        const historyData = JSON.stringify({ date, queues, source_msg_id: msgId, source: src });
        insertHistory.run(date, msgId, chgType, msgDate, historyData);

        // Оновлюємо або створюємо метадані
        if (metadata) {
          updateMetadata.run(msgId, src, msgDate, now, chgType, date);
        } else {
          insertMetadata.run(date, msgId, src, msgDate, now, now, 0, chgType);
        }
      } catch (error) {
        Logger.error('Database', `Transaction failed for date ${date}`, error);
        throw error; // Re-throw to trigger transaction rollback
      }
    });

    try {
      upsertAction(data.date, data.queues, sourceMsgId, messageDate, changeType, source);
    } catch (error) {
      Logger.error('Database', `Failed to insert schedule for ${data.date}`, error);
      return { updated: false, changeType: null, error: error.message };
    }

    if (existingMsgId) {
      Logger.success('Database', `Updated ${data.date} from ${source} (${data.queues.length} queues) ${existingSource} ${existingMsgId} → ${source} ${sourceMsgId}`);
    } else {
      Logger.success('Database', `New schedule ${data.date} from ${source} (${data.queues.length} queues) post ${sourceMsgId}`);
    }

    return { updated: true, changeType, messageDate };
  }
}

function schedulesAreEqual(newQueues, existingOutages) {
  // Flatten newQueues
  const newFlat = [];
  for (const q of newQueues) {
    for (const i of q.intervals) {
      newFlat.push({ queue: q.queue, start: i.start, end: i.end });
    }
  }

  // Map existingOutages to same format
  const existingFlat = existingOutages.map(o => ({
    queue: o.queue,
    start: o.start_time,
    end: o.end_time
  }));

  if (newFlat.length !== existingFlat.length) return false;

  // Sort both
  const sortFn = (a, b) => {
    if (a.queue !== b.queue) return a.queue.localeCompare(b.queue);
    if (a.start !== b.start) return a.start.localeCompare(b.start);
    return a.end.localeCompare(b.end);
  };

  newFlat.sort(sortFn);
  existingFlat.sort(sortFn);

  // Порівнюємо безпосередньо замість JSON.stringify (швидше для великих масивів)
  for (let i = 0; i < newFlat.length; i++) {
    const a = newFlat[i];
    const b = existingFlat[i];
    if (a.queue !== b.queue || a.start !== b.start || a.end !== b.end) {
      return false;
    }
  }

  return true;
}
