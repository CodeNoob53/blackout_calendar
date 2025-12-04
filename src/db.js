import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";
import Logger from "./utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Створюємо папку для бази даних, якщо вона не існує
const dataDir = join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = join(dataDir, "blackout.db");
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
      source TEXT DEFAULT 'telegram',
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

  // Міграція: додаємо колонку source до schedule_metadata якщо її немає
  const metadataInfo = db.prepare("PRAGMA table_info(schedule_metadata)").all();
  const hasSource = metadataInfo.some(col => col.name === 'source');

  if (!hasSource) {
    db.exec(`ALTER TABLE schedule_metadata ADD COLUMN source TEXT DEFAULT 'telegram'`);
    // Оновлюємо існуючі записи: якщо ID < 1000000000 то це Telegram, інакше Zoe
    db.exec(`UPDATE schedule_metadata SET source = CASE WHEN source_msg_id < 1000000000 THEN 'telegram' ELSE 'zoe' END WHERE source IS NULL`);
    Logger.success('Database', 'Migration: Added source column to schedule_metadata');
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

export function insertParsedSchedule(data, sourceMsgId, messageDate = null, source = 'telegram') {
  const metadata = getScheduleMetadata(data.date);
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

  // 2. Якщо це те саме повідомлення з того самого джерела - ігноруємо
  if (existingMsgId === sourceMsgId && existingSource === source) {
    // Те саме повідомлення, пропускаємо
    return { updated: false, changeType: null };
  }

  // 3. Якщо повідомлення новіше, перевіряємо чи змінився контент
  if (existingMsgId) {
    const existingSchedule = getScheduleByDate(data.date);
    if (schedulesAreEqual(data.queues, existingSchedule)) {
      // Контент той самий, просто оновлюємо ID повідомлення (щоб знати що ми "бачили" новіше)
      const updateMetadataIdOnly = db.prepare(`
        UPDATE schedule_metadata
        SET source_msg_id = ?, message_date = ?
        WHERE date = ?
      `);
      updateMetadataIdOnly.run(sourceMsgId, messageDate, data.date);

      // Контент ідентичний, пропускаємо
      return { updated: false, changeType: null };
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

  const upsertSchedule = db.transaction((date, queues, msgId, msgDate, chgType, src) => {
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
  });

  upsertSchedule(data.date, data.queues, sourceMsgId, messageDate, changeType, source);

  if (existingMsgId) {
    Logger.success('Database', `Updated ${data.date} from ${source} (${data.queues.length} queues) ${existingSource} ${existingMsgId} → ${source} ${sourceMsgId}`);
  } else {
    Logger.success('Database', `New schedule ${data.date} from ${source} (${data.queues.length} queues) post ${sourceMsgId}`);
  }

  return { updated: true, changeType, messageDate }; // Дані оновлені
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

  return JSON.stringify(newFlat) === JSON.stringify(existingFlat);
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
    WHERE date > ? 
      AND (first_published_at > ? OR (change_type = 'updated' AND last_updated_at > ?))
    ORDER BY date DESC, COALESCE(last_updated_at, first_published_at) DESC
    LIMIT 1
  `);

  return stmt.all(today, since, since);
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
