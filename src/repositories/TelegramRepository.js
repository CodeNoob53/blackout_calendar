import { db } from '../db.js';
import Logger from '../utils/logger.js';

export class TelegramRepository {
    /**
     * Зберегти snapshot з Telegram
     * @param {number} postId - ID поста
     * @param {string} messageDate - Дата публікації
     * @param {string} rawText - Оригінальний текст
     * @param {Object} parsedSchedule - Розпарсений графік
     * @returns {number} ID створеного snapshot або існуючого
     */
    static saveSnapshot(postId, messageDate, rawText, parsedSchedule = null) {
        // Перевіряємо чи вже є такий snapshot
        const existing = db.prepare('SELECT id FROM telegram_snapshots WHERE post_id = ?').get(postId);
        if (existing) {
            return existing.id;
        }

        const stmt = db.prepare(`
      INSERT INTO telegram_snapshots (post_id, message_date, raw_text, parsed_json, processing_status)
      VALUES (?, ?, ?, ?, ?)
    `);

        const result = stmt.run(
            postId,
            messageDate,
            rawText,
            parsedSchedule ? JSON.stringify(parsedSchedule) : null,
            parsedSchedule ? 'processed' : 'pending'
        );

        return result.lastInsertRowid;
    }

    /**
     * Отримати останню версію графіка для дати (Telegram)
     * @param {string} scheduleDate - Дата графіка
     * @returns {Object|null} Остання версія або null
     */
    static getLatestVersion(scheduleDate) {
        const stmt = db.prepare(`
      SELECT * FROM telegram_schedule_versions
      WHERE schedule_date = ?
      ORDER BY post_id DESC
      LIMIT 1
    `);

        return stmt.get(scheduleDate);
    }

    /**
     * Перевірити чи існує Telegram версія з таким post_id
     * @param {number} postId - ID поста
     * @returns {Object|null} Версія або null
     */
    static getVersionByPostId(postId) {
        const stmt = db.prepare(`
      SELECT * FROM telegram_schedule_versions
      WHERE post_id = ?
    `);

        return stmt.get(postId);
    }

    /**
     * Зберегти нову версію графіка з Telegram
     * @param {string} versionId - ID версії (напр. "tg-2537")
     * @param {string} scheduleDate - Дата графіка
     * @param {number} postId - ID поста
     * @param {string} messageDate - Дата повідомлення
     * @param {string} contentHash - Хеш контенту
     * @param {Object} scheduleData - Дані графіка
     * @param {number} snapshotId - ID snapshot
     * @param {string} changeType - Тип зміни (new/updated)
     * @returns {boolean} true якщо успішно
     */
    static saveVersion(versionId, scheduleDate, postId, messageDate, contentHash, scheduleData, snapshotId, changeType) {
        // Перевіряємо чи вже є версія з таким post_id
        const existing = this.getVersionByPostId(postId);
        if (existing) {
            Logger.debug('TelegramRepository', `Telegram version ${versionId} already exists, skipping`);
            return false;
        }

        const stmt = db.prepare(`
      INSERT INTO telegram_schedule_versions
      (version_id, schedule_date, post_id, message_date, content_hash, schedule_data, snapshot_id, change_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

        try {
            stmt.run(versionId, scheduleDate, postId, messageDate, contentHash, JSON.stringify(scheduleData), snapshotId, changeType);
            return true;
        } catch (error) {
            Logger.error('TelegramRepository', `Failed to save Telegram version ${versionId}`, error);
            return false;
        }
    }
}
