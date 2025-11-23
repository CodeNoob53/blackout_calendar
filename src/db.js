import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Logger from "./utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, "..", "data", "blackout.db");
const db = new Database(dbPath);

// Створення таблиці при ініціалізації
export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS outages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      queue TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      source_msg_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(date, queue, start_time, end_time)
    );

    CREATE TABLE IF NOT EXISTS schedule_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      source_msg_id INTEGER NOT NULL,
      change_type TEXT NOT NULL,
      message_date DATETIME,
      detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      data_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schedule_metadata (
      date TEXT PRIMARY KEY,
      source_msg_id INTEGER NOT NULL,
      message_date DATETIME,
      first_published_at DATETIME NOT NULL,
      last_updated_at DATETIME NOT NULL,
      update_count INTEGER DEFAULT 1,
      change_type TEXT
    );

    CREATE TABLE IF NOT EXISTS addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      street TEXT NOT NULL,
      house TEXT NOT NULL,
      full_address TEXT NOT NULL UNIQUE,
      queue TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_date ON outages(date);
    CREATE INDEX IF NOT EXISTS idx_queue ON outages(queue);
    CREATE INDEX IF NOT EXISTS idx_history_date ON schedule_history(date);
    CREATE INDEX IF NOT EXISTS idx_metadata_updated ON schedule_metadata(last_updated_at);
    CREATE INDEX IF NOT EXISTS idx_addresses_street ON addresses(street);
    CREATE INDEX IF NOT EXISTS idx_addresses_queue ON addresses(queue);
    CREATE INDEX IF NOT EXISTS idx_addresses_full_address ON addresses(full_address);
  `);

  Logger.db(`Initialized at ${dbPath}`);

  // Міграція: додаємо колонки updated_at і created_at якщо їх немає
  const tableInfo = db.prepare("PRAGMA table_info(outages)").all();
  const hasCreatedAt = tableInfo.some(col => col.name === 'created_at');
  const hasUpdatedAt = tableInfo.some(col => col.name === 'updated_at');

  if (!hasCreatedAt) {
    db.exec(`ALTER TABLE outages ADD COLUMN created_at DATETIME`);
    Logger.success('Database', 'Migration: Added created_at column');
  }

  if (!hasUpdatedAt) {
    db.exec(`ALTER TABLE outages ADD COLUMN updated_at DATETIME`);
    Logger.success('Database', 'Migration: Added updated_at column');
  }
}

export function getSourceMessageId(date) {
  const stmt = db.prepare(`
    SELECT source_msg_id
    FROM schedule_metadata
    WHERE date = ?
  `);

  const result = stmt.get(date);
  return result?.source_msg_id ?? null;
}

export function insertParsedSchedule(data, sourceMsgId, messageDate = null) {
  // Перевіряємо чи це той самий source_msg_id
  const existingMsgId = getSourceMessageId(data.date);

  if (existingMsgId === sourceMsgId) {
    Logger.debug('Database', `Skipped ${data.date} - already up to date (post ${sourceMsgId})`);
    return { updated: false, changeType: null };
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

  const getMetadata = db.prepare(`
    SELECT * FROM schedule_metadata WHERE date = ?
  `);

  const insertMetadata = db.prepare(`
    INSERT INTO schedule_metadata (date, source_msg_id, message_date, first_published_at, last_updated_at, update_count, change_type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const updateMetadata = db.prepare(`
    UPDATE schedule_metadata
    SET source_msg_id = ?, message_date = ?, last_updated_at = ?, update_count = update_count + 1, change_type = ?
    WHERE date = ?
  `);

  const upsertSchedule = db.transaction((date, queues, msgId, msgDate, chgType) => {
    // Спочатку видаляємо всі старі записи для цієї дати
    deleteStmt.run(date);

    // Потім додаємо нові
    for (const q of queues) {
      for (const interval of q.intervals) {
        insertStmt.run(date, q.queue, interval.start, interval.end, msgId, now);
      }
    }

    // Зберігаємо в історію
    const historyData = JSON.stringify({ date, queues, source_msg_id: msgId });
    insertHistory.run(date, msgId, chgType, msgDate, historyData);

    // Оновлюємо або створюємо метадані
    const metadata = getMetadata.get(date);
    if (metadata) {
      updateMetadata.run(msgId, msgDate, now, chgType, date);
    } else {
      insertMetadata.run(date, msgId, msgDate, now, now, 0, chgType);
    }
  });

  upsertSchedule(data.date, data.queues, sourceMsgId, messageDate, changeType);

  if (existingMsgId) {
    Logger.success('Database', `Updated ${data.date} (${data.queues.length} queues) post ${existingMsgId} → ${sourceMsgId}`);
  } else {
    Logger.success('Database', `New schedule ${data.date} (${data.queues.length} queues) post ${sourceMsgId}`);
  }

  return { updated: true, changeType, messageDate }; // Дані оновлені
}

export function getScheduleByDate(date) {
  const stmt = db.prepare(`
    SELECT * FROM outages
    WHERE date = ?
    ORDER BY queue, start_time
  `);

  return stmt.all(date);
}

export function getLatestDate() {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Спочатку перевіряємо, чи є графік на сьогодні
  const todayStmt = db.prepare(`
    SELECT DISTINCT date
    FROM outages
    WHERE date = ?
  `);

  const todayResult = todayStmt.get(today);
  if (todayResult) {
    return todayResult.date;
  }

  // Якщо на сьогодні немає, повертаємо найновішу дату
  const latestStmt = db.prepare(`
    SELECT DISTINCT date
    FROM outages
    ORDER BY date DESC
    LIMIT 1
  `);

  const result = latestStmt.get();
  return result?.date ?? null;
}

export function getAllDates() {
  const stmt = db.prepare(`
    SELECT DISTINCT date
    FROM outages
    ORDER BY date DESC
  `);

  return stmt.all();
}

export function getScheduleByQueueAndDate(queue, date) {
  const stmt = db.prepare(`
    SELECT * FROM outages
    WHERE queue = ? AND date = ?
    ORDER BY start_time
  `);

  return stmt.all(queue, date);
}

// Отримати останній графік для конкретної черги
export function getLatestScheduleByQueue(queue) {
  const latestDate = getLatestDate();
  if (!latestDate) return null;

  return getScheduleByQueueAndDate(queue, latestDate);
}

// Перевірити наявність графіку на сьогодні
export function getTodayScheduleStatus() {
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

// Отримати метадані для дати
export function getScheduleMetadata(date) {
  const stmt = db.prepare(`
    SELECT * FROM schedule_metadata WHERE date = ?
  `);

  return stmt.get(date);
}

// Отримати всі метадані з останніми оновленнями
export function getRecentUpdates(limit = 10) {
  const stmt = db.prepare(`
    SELECT * FROM schedule_metadata
    ORDER BY last_updated_at DESC
    LIMIT ?
  `);

  return stmt.all(limit);
}

// Отримати історію змін для дати
export function getScheduleHistory(date) {
  const stmt = db.prepare(`
    SELECT * FROM schedule_history
    WHERE date = ?
    ORDER BY detected_at DESC
  `);

  return stmt.all(date);
}

// Отримати всі нові/оновлені графіки для майбутніх дат + пізні публікації на сьогодні
// Для push: "Графік на завтра", "Зміни в завтрашньому графіку", "Графік на сьогодні (пізня публікація)"
export function getNewSchedules(hoursAgo = 24) {
  const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const stmt = db.prepare(`
    SELECT * FROM schedule_metadata
    WHERE (
      -- Майбутні дати (завтра і далі): нові або оновлені
      (date > ? AND (first_published_at > ? OR (change_type = 'updated' AND last_updated_at > ?)))
      OR
      -- Сьогодні: тільки нові (пізня публікація)
      (date = ? AND change_type = 'new' AND first_published_at > ?)
    )
    ORDER BY date DESC, COALESCE(last_updated_at, first_published_at) DESC
    LIMIT 1
  `);

  return stmt.all(today, since, since, today, since);
}

// Отримати ТІЛЬКИ ОДНЕ останнє оновлення графіку на СЬОГОДНІ
// Для push: "Увага! Поточний графік змінено о 14:30"
export function getUpdatedSchedules(hoursAgo = 24) {
  const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

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

// ========== Функції для роботи з адресами ==========

// Пошук адреси за повною адресою
export function findAddressByFullAddress(fullAddress) {
  const stmt = db.prepare(`
    SELECT * FROM addresses WHERE full_address = ?
  `);
  return stmt.get(fullAddress);
}

// Пошук адрес за вулицею
export function findAddressesByStreet(street) {
  const stmt = db.prepare(`
    SELECT * FROM addresses WHERE street LIKE ?
    ORDER BY house
  `);
  return stmt.all(`%${street}%`);
}

// Пошук адрес за чергою
export function findAddressesByQueue(queue) {
  const stmt = db.prepare(`
    SELECT * FROM addresses WHERE queue = ?
    ORDER BY street, house
  `);
  return stmt.all(queue);
}

// Отримати всі унікальні вулиці
export function getAllStreets() {
  const stmt = db.prepare(`
    SELECT DISTINCT street FROM addresses
    ORDER BY street
  `);
  return stmt.all();
}

// Отримати всі унікальні черги
export function getAllQueues() {
  const stmt = db.prepare(`
    SELECT DISTINCT queue FROM addresses
    WHERE queue IS NOT NULL
    ORDER BY queue
  `);
  return stmt.all();
}

// Статистика по адресам
export function getAddressStats() {
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

export { db };
