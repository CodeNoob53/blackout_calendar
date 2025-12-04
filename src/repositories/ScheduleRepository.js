/**
 * Schedule Repository
 * Абстрагує всі операції з базою даних для розкладів
 * Відокремлює логіку БД від бізнес-логіки
 */

import { db } from '../db.js';

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
      WHERE date > ?
        AND (first_published_at > ? OR (change_type = 'updated' AND last_updated_at > ?))
      ORDER BY date DESC, COALESCE(last_updated_at, first_published_at) DESC
      LIMIT 1
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

    const stmt = db.prepare(`
      SELECT * FROM schedule_metadata
      WHERE date = ?
        AND change_type = 'updated'
        AND last_updated_at > ?
      ORDER BY last_updated_at DESC
      LIMIT 1
    `);

    return stmt.all(today, since);
  }
}
