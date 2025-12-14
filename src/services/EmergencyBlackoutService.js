/**
 * Сервіс для обробки аварійних відключень (ГАВ)
 *
 * Основні функції:
 * 1. Моніторинг повідомлень про ГАВ з Telegram
 * 2. Збереження ГАВ в базу даних
 * 3. Відправка push-сповіщень користувачам
 */

import { db } from '../db.js';
import { fetchTelegramUpdates, isEmergencyBlackoutMessage, parseEmergencyBlackoutMessage } from '../scraper/telegramScraper.js';
import { NotificationService } from './NotificationService.js';
import Logger from '../utils/logger.js';

/**
 * Створює таблицю для зберігання ГАВ
 */
export function initEmergencyBlackoutsTable() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS emergency_blackouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      affected_groups TEXT NOT NULL,
      message_id INTEGER NOT NULL UNIQUE,
      message_date TEXT,
      raw_text TEXT,
      notified BOOLEAN DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `;

  db.prepare(createTableSQL).run();

  // Індекс для швидкого пошуку по даті
  db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_emergency_date
    ON emergency_blackouts(date)
  `).run();

  Logger.info('EmergencyBlackoutService', 'Emergency blackouts table initialized');
}

/**
 * Зберігає ГАВ в базу даних
 */
export function saveEmergencyBlackout(emergencyData, messageId, messageDate) {
  const { date, affectedGroups, rawText } = emergencyData;

  // Перевіряємо чи вже є таке повідомлення
  const existing = db.prepare(`
    SELECT id FROM emergency_blackouts WHERE message_id = ?
  `).get(messageId);

  if (existing) {
    Logger.debug('EmergencyBlackoutService', `Emergency blackout already exists: message_id=${messageId}`);
    return existing.id;
  }

  // Вставляємо новий запис
  const result = db.prepare(`
    INSERT INTO emergency_blackouts (date, affected_groups, message_id, message_date, raw_text)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    date,
    JSON.stringify(affectedGroups),
    messageId,
    messageDate,
    rawText
  );

  Logger.info('EmergencyBlackoutService', `Saved emergency blackout: id=${result.lastInsertRowid}, date=${date}, groups=${affectedGroups.join(',')}`);

  return result.lastInsertRowid;
}

/**
 * Отримує всі активні ГАВ (сьогодні і майбутні)
 */
export function getActiveEmergencyBlackouts() {
  const today = new Date().toISOString().split('T')[0];

  const rows = db.prepare(`
    SELECT
      id,
      date,
      affected_groups,
      message_id,
      message_date,
      raw_text,
      notified,
      created_at
    FROM emergency_blackouts
    WHERE date >= ?
    ORDER BY date DESC, created_at DESC
  `).all(today);

  return rows.map(row => ({
    ...row,
    affected_groups: JSON.parse(row.affected_groups)
  }));
}

/**
 * Отримує ГАВ для конкретної дати
 */
export function getEmergencyBlackoutsByDate(date) {
  const rows = db.prepare(`
    SELECT
      id,
      date,
      affected_groups,
      message_id,
      message_date,
      raw_text,
      notified,
      created_at
    FROM emergency_blackouts
    WHERE date = ?
    ORDER BY created_at DESC
  `).all(date);

  return rows.map(row => ({
    ...row,
    affected_groups: JSON.parse(row.affected_groups)
  }));
}

/**
 * Позначає ГАВ як сповіщений
 */
export function markAsNotified(id) {
  db.prepare(`
    UPDATE emergency_blackouts
    SET notified = 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);

  Logger.debug('EmergencyBlackoutService', `Marked emergency blackout as notified: id=${id}`);
}

/**
 * Сканує Telegram на нові ГАВ повідомлення
 */
export async function scanForEmergencyBlackouts() {
  Logger.info('EmergencyBlackoutService', 'Scanning for emergency blackouts...');

  const messages = await fetchTelegramUpdates();
  let newEmergencies = 0;

  for (const msg of messages) {
    if (isEmergencyBlackoutMessage(msg.text)) {
      const parsed = parseEmergencyBlackoutMessage(msg.text);

      // Якщо не змогли розпарсити дату, пропускаємо
      if (!parsed.date) {
        Logger.warning('EmergencyBlackoutService', `Could not parse date from message ${msg.id}`);
        continue;
      }

      try {
        const emergencyId = saveEmergencyBlackout(parsed, msg.id, msg.messageDate);

        // Якщо це новий запис, відправляємо сповіщення
        if (emergencyId) {
          await sendEmergencyNotification(emergencyId, parsed);
          newEmergencies++;
        }
      } catch (error) {
        Logger.error('EmergencyBlackoutService', `Error saving emergency blackout: ${error.message}`, error);
      }
    }
  }

  Logger.info('EmergencyBlackoutService', `Scan completed: ${newEmergencies} new emergency blackouts`);

  return newEmergencies;
}

/**
 * Відправляє push-сповіщення про ГАВ
 */
async function sendEmergencyNotification(emergencyId, emergencyData) {
  const { date, affectedGroups } = emergencyData;

  // Формуємо текст сповіщення
  let groupText = '';
  if (affectedGroups.includes('industrial')) {
    groupText = 'для промислових споживачів';
  } else if (affectedGroups.includes('residential')) {
    groupText = 'для населення';
  } else if (affectedGroups.includes('business')) {
    groupText = 'для бізнесу';
  } else {
    groupText = 'для всіх споживачів';
  }

  const dateFormatted = new Date(date).toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'long'
  });

  const title = '⚠️ Аварійні відключення';
  const body = `${dateFormatted} введено графіки аварійних відключень ${groupText}`;

  Logger.debug('EmergencyBlackoutService', `Sending notification: ${title} - ${body}`);

  try {
    // Відправляємо через NotificationService
    // Використовуємо новий метод notifyEmergency який не залежить від метаданих розкладу
    await NotificationService.notifyEmergency({
      date,
      title,
      body,
      affectedGroups
    });

    Logger.info('EmergencyBlackoutService', `Emergency notification sent for ${date}`);

    // Позначаємо як сповіщений
    markAsNotified(emergencyId);

    return { success: true };
  } catch (error) {
    Logger.error('EmergencyBlackoutService', `Failed to send notification: ${error.message}`, error);
    // Не кидаємо помилку - дозволяємо зберегти запис навіть якщо сповіщення не відправилось
    return { success: false, error: error.message };
  }
}

/**
 * Видаляє старі ГАВ (старіші за 30 днів)
 */
export function cleanupOldEmergencyBlackouts() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoffDate = thirtyDaysAgo.toISOString().split('T')[0];

  const result = db.prepare(`
    DELETE FROM emergency_blackouts
    WHERE date < ?
  `).run(cutoffDate);

  Logger.info('EmergencyBlackoutService', `Cleaned up ${result.changes} old emergency blackouts (before ${cutoffDate})`);

  return result.changes;
}

export default {
  initEmergencyBlackoutsTable,
  saveEmergencyBlackout,
  getActiveEmergencyBlackouts,
  getEmergencyBlackoutsByDate,
  markAsNotified,
  scanForEmergencyBlackouts,
  cleanupOldEmergencyBlackouts
};
