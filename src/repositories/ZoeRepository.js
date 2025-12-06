import { db } from '../db.js';
import Logger from '../utils/logger.js';

export class ZoeRepository {
    /**
     * Зберегти snapshot з Zoe
     * @param {string} rawHtml - Оригінальний HTML
     * @param {Array} parsedSchedules - Масив розпарсених графіків
     * @returns {number} ID створеного snapshot
     */
    static saveSnapshot(rawHtml, parsedSchedules = null) {
        const stmt = db.prepare(`
      INSERT INTO zoe_snapshots (raw_html, parsed_json, processing_status)
      VALUES (?, ?, ?)
    `);

        const result = stmt.run(
            rawHtml,
            parsedSchedules ? JSON.stringify(parsedSchedules) : null,
            parsedSchedules ? 'processed' : 'pending'
        );

        return result.lastInsertRowid;
    }

    /**
     * Отримати наступний номер версії для Zoe графіка
     * @param {string} scheduleDate - Дата графіка
     * @returns {number} Наступний номер версії
     */
    static getNextVersionNumber(scheduleDate) {
        const stmt = db.prepare(`
      SELECT MAX(version_number) as max_version
      FROM zoe_schedule_versions
      WHERE schedule_date = ?
    `);

        const result = stmt.get(scheduleDate);
        return (result?.max_version || 0) + 1;
    }

    /**
     * Отримати останню версію графіка для дати (Zoe)
     * @param {string} scheduleDate - Дата графіка
     * @returns {Object|null} Остання версія або null
     */
    static getLatestVersion(scheduleDate) {
        const stmt = db.prepare(`
      SELECT * FROM zoe_schedule_versions
      WHERE schedule_date = ?
      ORDER BY version_number DESC
      LIMIT 1
    `);

        return stmt.get(scheduleDate);
    }

    /**
     * Зберегти нову версію графіка з Zoe
     * @param {string} versionId - ID версії (напр. "zoe-2025-12-05-v001")
     * @param {string} scheduleDate - Дата графіка
     * @param {number} versionNumber - Номер версії
     * @param {string} contentHash - Хеш контенту
     * @param {Object} scheduleData - Дані графіка
     * @param {number} snapshotId - ID snapshot
     * @param {string} changeType - Тип зміни (new/updated)
     * @param {string|null} siteUpdateTime - Час оновлення з сайту
     * @param {number|null} pagePosition - Позиція на сторінці (від 0)
     * @returns {boolean} true якщо успішно
     */
    static saveVersion(versionId, scheduleDate, versionNumber, contentHash, scheduleData, snapshotId, changeType, siteUpdateTime = null, pagePosition = null) {
        const stmt = db.prepare(`
      INSERT INTO zoe_schedule_versions
      (version_id, schedule_date, version_number, content_hash, schedule_data, snapshot_id, change_type, site_update_time, page_position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

        try {
            stmt.run(versionId, scheduleDate, versionNumber, contentHash, JSON.stringify(scheduleData), snapshotId, changeType, siteUpdateTime, pagePosition);
            return true;
        } catch (error) {
            Logger.error('ZoeRepository', `Failed to save Zoe version ${versionId}`, error);
            return false;
        }
    }
}
