/**
 * Address Repository
 * Абстрагує всі операції з базою даних для адрес
 */

import { db } from '../db.js';

export class AddressRepository {
  /**
   * Пошук адрес за вулицею
   * @param {string} street - Назва вулиці (частково)
   * @returns {Array} Масив адрес
   */
  static findByStreet(street) {
    // Екранування LIKE спецсимволів
    const escapedStreet = street.replace(/[%_]/g, '\\$&');
    const searchPattern = `%${escapedStreet}%`;

    const stmt = db.prepare(`
      SELECT * FROM addresses
      WHERE street LIKE ? ESCAPE '\\'
      ORDER BY house
    `);

    return stmt.all(searchPattern);
  }

  /**
   * Пошук за точною адресою
   * @param {string} fullAddress - Повна адреса
   * @returns {Object|null} Об'єкт адреси або null
   */
  static findByFullAddress(fullAddress) {
    const stmt = db.prepare(`
      SELECT * FROM addresses WHERE full_address = ?
    `);
    return stmt.get(fullAddress);
  }

  /**
   * Отримати всі адреси для черги
   * @param {string} queue - Номер черги
   * @returns {Array} Масив адрес
   */
  static findByQueue(queue) {
    const stmt = db.prepare(`
      SELECT * FROM addresses
      WHERE queue = ?
      ORDER BY street, house
    `);
    return stmt.all(queue);
  }

  /**
   * Отримати всі унікальні вулиці
   * @returns {Array} Масив об'єктів {street}
   */
  static findAllStreets() {
    const stmt = db.prepare(`
      SELECT DISTINCT street FROM addresses ORDER BY street
    `);
    return stmt.all();
  }

  /**
   * Отримати всі унікальні черги
   * @returns {Array} Масив об'єктів {queue}
   */
  static findAllQueues() {
    const stmt = db.prepare(`
      SELECT DISTINCT queue FROM addresses
      WHERE queue IS NOT NULL
      ORDER BY queue
    `);
    return stmt.all();
  }

  /**
   * Отримати статистику по адресам
   * @returns {Object} Об'єкт зі статистикою
   */
  static getStatistics() {
    const stmt = db.prepare(`
      SELECT
        COUNT(*) as total,
        COUNT(DISTINCT street) as unique_streets,
        COUNT(CASE WHEN queue IS NOT NULL THEN 1 END) as with_queue,
        COUNT(CASE WHEN queue IS NULL THEN 1 END) as without_queue
      FROM addresses
    `);
    return stmt.get();
  }
}
