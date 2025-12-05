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

    -- Базові індекси для outages
    CREATE INDEX IF NOT EXISTS idx_date ON outages(date);
    CREATE INDEX IF NOT EXISTS idx_queue ON outages(queue);
    CREATE INDEX IF NOT EXISTS idx_date_queue ON outages(date, queue);

    -- Індекси для schedule_history
    CREATE INDEX IF NOT EXISTS idx_history_date ON schedule_history(date);
    CREATE INDEX IF NOT EXISTS idx_history_date_detected ON schedule_history(date, detected_at DESC);
    CREATE INDEX IF NOT EXISTS idx_history_date_source ON schedule_history(date, source_msg_id);
    CREATE INDEX IF NOT EXISTS idx_history_detected ON schedule_history(detected_at DESC);

    -- Індекси для schedule_metadata
    CREATE INDEX IF NOT EXISTS idx_metadata_updated ON schedule_metadata(last_updated_at);
    CREATE INDEX IF NOT EXISTS idx_metadata_date_updated ON schedule_metadata(date, last_updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_metadata_source ON schedule_metadata(source);

    -- Індекси для addresses
    CREATE INDEX IF NOT EXISTS idx_addresses_street ON addresses(street);
    CREATE INDEX IF NOT EXISTS idx_addresses_queue ON addresses(queue);
    CREATE INDEX IF NOT EXISTS idx_addresses_full_address ON addresses(full_address);
    CREATE INDEX IF NOT EXISTS idx_addresses_street_queue ON addresses(street, queue);
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

  // Міграція: створюємо нові таблиці для версіонування графіків
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const tableNames = tables.map(t => t.name);

  if (!tableNames.includes('zoe_snapshots')) {
    db.exec(`
      CREATE TABLE zoe_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fetch_timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        raw_html TEXT NOT NULL,
        parsed_json TEXT,
        processing_status TEXT DEFAULT 'pending',
        processing_error TEXT
      );

      CREATE INDEX idx_zoe_snapshots_fetch ON zoe_snapshots(fetch_timestamp DESC);
      CREATE INDEX idx_zoe_snapshots_status ON zoe_snapshots(processing_status);
    `);
    Logger.success('Database', 'Migration: Created zoe_snapshots table');
  }

  if (!tableNames.includes('telegram_snapshots')) {
    db.exec(`
      CREATE TABLE telegram_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL UNIQUE,
        message_date DATETIME NOT NULL,
        fetch_timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        raw_text TEXT NOT NULL,
        raw_html TEXT,
        parsed_json TEXT,
        processing_status TEXT DEFAULT 'pending',
        processing_error TEXT
      );

      CREATE INDEX idx_tg_snapshots_post ON telegram_snapshots(post_id);
      CREATE INDEX idx_tg_snapshots_msg ON telegram_snapshots(message_date DESC);
      CREATE INDEX idx_tg_snapshots_status ON telegram_snapshots(processing_status);
    `);
    Logger.success('Database', 'Migration: Created telegram_snapshots table');
  }

  if (!tableNames.includes('zoe_schedule_versions')) {
    db.exec(`
      CREATE TABLE zoe_schedule_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version_id TEXT NOT NULL UNIQUE,
        schedule_date TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        detected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        site_update_time TEXT,
        content_hash TEXT NOT NULL,
        schedule_data TEXT NOT NULL,
        snapshot_id INTEGER NOT NULL,
        change_type TEXT NOT NULL,
        FOREIGN KEY (snapshot_id) REFERENCES zoe_snapshots(id),
        UNIQUE(schedule_date, version_number)
      );

      CREATE INDEX idx_zoe_versions_date ON zoe_schedule_versions(schedule_date, version_number DESC);
      CREATE INDEX idx_zoe_versions_detected ON zoe_schedule_versions(detected_at DESC);
      CREATE INDEX idx_zoe_versions_hash ON zoe_schedule_versions(content_hash);
      CREATE INDEX idx_zoe_versions_version_id ON zoe_schedule_versions(version_id);
    `);
    Logger.success('Database', 'Migration: Created zoe_schedule_versions table');
  }

  if (!tableNames.includes('telegram_schedule_versions')) {
    db.exec(`
      CREATE TABLE telegram_schedule_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version_id TEXT NOT NULL UNIQUE,
        schedule_date TEXT NOT NULL,
        post_id INTEGER NOT NULL,
        message_date DATETIME NOT NULL,
        detected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        content_hash TEXT NOT NULL,
        schedule_data TEXT NOT NULL,
        snapshot_id INTEGER NOT NULL,
        change_type TEXT NOT NULL,
        FOREIGN KEY (snapshot_id) REFERENCES telegram_snapshots(id),
        UNIQUE(post_id)
      );

      CREATE INDEX idx_tg_versions_date ON telegram_schedule_versions(schedule_date, post_id DESC);
      CREATE INDEX idx_tg_versions_detected ON telegram_schedule_versions(detected_at DESC);
      CREATE INDEX idx_tg_versions_post ON telegram_schedule_versions(post_id);
      CREATE INDEX idx_tg_versions_hash ON telegram_schedule_versions(content_hash);
      CREATE INDEX idx_tg_versions_version_id ON telegram_schedule_versions(version_id);
    `);
    Logger.success('Database', 'Migration: Created telegram_schedule_versions table');
  }

  // PHASE 1 MIGRATION: Додаємо page_position для Zoe версій
  const zoeVersionsInfo = db.prepare("PRAGMA table_info(zoe_schedule_versions)").all();
  const hasPagePosition = zoeVersionsInfo.some(col => col.name === 'page_position');

  if (!hasPagePosition) {
    db.exec(`ALTER TABLE zoe_schedule_versions ADD COLUMN page_position INTEGER`);
    Logger.success('Database', 'Migration: Added page_position to zoe_schedule_versions');
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
    upsertSchedule(data.date, data.queues, sourceMsgId, messageDate, changeType, source);
  } catch (error) {
    Logger.error('Database', `Failed to insert schedule for ${data.date}`, error);
    return { updated: false, changeType: null, error: error.message };
  }

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

// Отримати ОСТАННЄ оновлення графіку за останні N годин
// Повертає найсвіжіше оновлення тільки для сьогодні та майбутніх дат
// (виключає лайнографіки - оновлення графіків з минулими датами)
export function getUpdatedSchedules(hoursAgo = 24) {
  const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const stmt = db.prepare(`
    SELECT * FROM schedule_metadata
    WHERE change_type = 'updated'
      AND last_updated_at > ?
      AND date >= ?
    ORDER BY last_updated_at DESC
    LIMIT 1
  `);

  return stmt.all(since, today);
}

// ========== Функції для роботи з адресами ==========

/**
 * Екранує спеціальні символи LIKE для безпечного пошуку
 * Запобігає SQL injection через wildcards % та _
 */
function escapeLikePattern(pattern) {
  if (!pattern || typeof pattern !== 'string') {
    return '';
  }
  // Екранування спеціальних символів LIKE: % та _
  return pattern.replace(/[%_]/g, '\\$&');
}

// Пошук адреси за повною адресою
export function findAddressByFullAddress(fullAddress) {
  const stmt = db.prepare(`
    SELECT * FROM addresses WHERE full_address = ?
  `);
  return stmt.get(fullAddress);
}

// Пошук адрес за вулицею
export function findAddressesByStreet(street) {
  // Екануємо спеціальні символи для безпеки
  const escapedStreet = escapeLikePattern(street);
  const searchPattern = `%${escapedStreet}%`;

  const stmt = db.prepare(`
    SELECT * FROM addresses WHERE street LIKE ? ESCAPE '\\'
    ORDER BY house
  `);
  return stmt.all(searchPattern);
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

// ========== Функції для роботи з версіонуванням графіків ==========

/**
 * Зберегти snapshot з Zoe
 * @param {string} rawHtml - Оригінальний HTML
 * @param {Array} parsedSchedules - Масив розпарсених графіків
 * @returns {number} ID створеного snapshot
 */
export function saveZoeSnapshot(rawHtml, parsedSchedules = null) {
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
 * Зберегти snapshot з Telegram
 * @param {number} postId - ID поста
 * @param {string} messageDate - Дата публікації
 * @param {string} rawText - Оригінальний текст
 * @param {Object} parsedSchedule - Розпарсений графік
 * @returns {number} ID створеного snapshot або існуючого
 */
export function saveTelegramSnapshot(postId, messageDate, rawText, parsedSchedule = null) {
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
 * Отримати наступний номер версії для Zoe графіка
 * @param {string} scheduleDate - Дата графіка
 * @returns {number} Наступний номер версії
 */
export function getNextZoeVersionNumber(scheduleDate) {
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
export function getLatestZoeVersion(scheduleDate) {
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
export function saveZoeVersion(versionId, scheduleDate, versionNumber, contentHash, scheduleData, snapshotId, changeType, siteUpdateTime = null, pagePosition = null) {
  const stmt = db.prepare(`
    INSERT INTO zoe_schedule_versions
    (version_id, schedule_date, version_number, content_hash, schedule_data, snapshot_id, change_type, site_update_time, page_position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    stmt.run(versionId, scheduleDate, versionNumber, contentHash, JSON.stringify(scheduleData), snapshotId, changeType, siteUpdateTime, pagePosition);
    return true;
  } catch (error) {
    Logger.error('Database', `Failed to save Zoe version ${versionId}`, error);
    return false;
  }
}

/**
 * Отримати останню версію графіка для дати (Telegram)
 * @param {string} scheduleDate - Дата графіка
 * @returns {Object|null} Остання версія або null
 */
export function getLatestTelegramVersion(scheduleDate) {
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
export function getTelegramVersionByPostId(postId) {
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
export function saveTelegramVersion(versionId, scheduleDate, postId, messageDate, contentHash, scheduleData, snapshotId, changeType) {
  // Перевіряємо чи вже є версія з таким post_id
  const existing = getTelegramVersionByPostId(postId);
  if (existing) {
    Logger.debug('Database', `Telegram version ${versionId} already exists, skipping`);
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
    Logger.error('Database', `Failed to save Telegram version ${versionId}`, error);
    return false;
  }
}

/**
 * Отримати всі версії графіка для дати (з обох джерел)
 * @param {string} scheduleDate - Дата графіка
 * @param {string|null} source - Джерело ('zoe', 'telegram', або null для всіх)
 * @returns {Array} Масив версій
 */
export function getAllVersionsForDate(scheduleDate, source = null) {
  if (source === 'zoe') {
    const stmt = db.prepare(`
      SELECT
        version_id,
        schedule_date,
        version_number as version_info,
        detected_at,
        content_hash,
        schedule_data,
        change_type,
        'zoe' as source,
        site_update_time as metadata
      FROM zoe_schedule_versions
      WHERE schedule_date = ?
      ORDER BY version_number DESC
    `);
    return stmt.all(scheduleDate);
  } else if (source === 'telegram') {
    const stmt = db.prepare(`
      SELECT
        version_id,
        schedule_date,
        post_id as version_info,
        detected_at,
        content_hash,
        schedule_data,
        change_type,
        'telegram' as source,
        message_date as metadata
      FROM telegram_schedule_versions
      WHERE schedule_date = ?
      ORDER BY post_id DESC
    `);
    return stmt.all(scheduleDate);
  } else {
    // Обидва джерела
    const stmt = db.prepare(`
      SELECT
        version_id,
        schedule_date,
        version_number as version_info,
        detected_at,
        content_hash,
        schedule_data,
        change_type,
        'zoe' as source,
        site_update_time as metadata
      FROM zoe_schedule_versions
      WHERE schedule_date = ?
      UNION ALL
      SELECT
        version_id,
        schedule_date,
        post_id as version_info,
        detected_at,
        content_hash,
        schedule_data,
        change_type,
        'telegram' as source,
        message_date as metadata
      FROM telegram_schedule_versions
      WHERE schedule_date = ?
      ORDER BY detected_at DESC
    `);
    return stmt.all(scheduleDate, scheduleDate);
  }
}

/**
 * Отримати статистику версій
 * @returns {Object} Статистика
 */
export function getVersionStats() {
  const zoeStats = db.prepare(`
    SELECT
      COUNT(DISTINCT schedule_date) as dates_count,
      COUNT(*) as versions_count,
      AVG(version_number) as avg_versions_per_date
    FROM zoe_schedule_versions
  `).get();

  const tgStats = db.prepare(`
    SELECT
      COUNT(DISTINCT schedule_date) as dates_count,
      COUNT(*) as versions_count
    FROM telegram_schedule_versions
  `).get();

  return {
    zoe: {
      datesCount: zoeStats.dates_count,
      versionsCount: zoeStats.versions_count,
      avgVersionsPerDate: zoeStats.avg_versions_per_date?.toFixed(2) || 0
    },
    telegram: {
      datesCount: tgStats.dates_count,
      versionsCount: tgStats.versions_count
    }
  };
}

export { db };
