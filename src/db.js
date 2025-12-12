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
export const db = new Database(dbPath);

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

  if (!tableNames.includes('push_subscriptions')) {
    db.exec(`
      CREATE TABLE push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint TEXT NOT NULL UNIQUE,
        keys_p256dh TEXT NOT NULL,
        keys_auth TEXT NOT NULL,
        user_agent TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
        failure_count INTEGER DEFAULT 0
      );
    `);
    Logger.success('Database', 'Migration: Created push_subscriptions table');
  }

  // MIGRATION: Розширення push_subscriptions для персоналізованих сповіщень
  const pushSubsInfo = db.prepare("PRAGMA table_info(push_subscriptions)").all();
  const hasSelectedQueue = pushSubsInfo.some(col => col.name === 'selected_queue');
  const hasNotificationTypes = pushSubsInfo.some(col => col.name === 'notification_types');

  if (!hasSelectedQueue) {
    db.exec(`ALTER TABLE push_subscriptions ADD COLUMN selected_queue TEXT`);
    Logger.success('Database', 'Migration: Added selected_queue to push_subscriptions');
  }

  if (!hasNotificationTypes) {
    // JSON масив типів сповіщень: ["all", "schedule_change", "tomorrow_schedule", "power_off_30min", "power_on", "emergency"]
    // За замовчуванням - всі загальні сповіщення
    db.exec(`ALTER TABLE push_subscriptions ADD COLUMN notification_types TEXT DEFAULT '["all","schedule_change","tomorrow_schedule"]'`);
    Logger.success('Database', 'Migration: Added notification_types to push_subscriptions');
  }
}
