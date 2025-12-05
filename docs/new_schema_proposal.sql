-- =====================================================
-- НОВА СХЕМА ДЛЯ ЗБЕРЕЖЕННЯ ІСТОРІЇ ГРАФІКІВ
-- =====================================================

-- Таблиця для збереження RAW даних від Zoe (кожен fetch)
CREATE TABLE zoe_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Коли ми зробили fetch
  fetch_timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Оригінальний HTML з сайту
  raw_html TEXT NOT NULL,

  -- Розпарсений JSON (масив всіх знайдених графіків)
  parsed_json TEXT,

  -- Статус обробки
  processing_status TEXT DEFAULT 'pending', -- pending, processed, failed
  processing_error TEXT,

  -- Індекс для швидкого пошуку
  UNIQUE(fetch_timestamp)
);

-- Таблиця для збереження RAW даних від Telegram (кожен post)
CREATE TABLE telegram_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Реальний ID поста з Telegram
  post_id INTEGER NOT NULL UNIQUE,

  -- Коли пост був опублікований в Telegram (з datetime атрибуту)
  message_date DATETIME NOT NULL,

  -- Коли ми зробили fetch
  fetch_timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Оригінальний текст поста
  raw_text TEXT NOT NULL,

  -- HTML якщо потрібно (опціонально)
  raw_html TEXT,

  -- Розпарсений JSON
  parsed_json TEXT,

  -- Статус обробки
  processing_status TEXT DEFAULT 'pending',
  processing_error TEXT,

  -- Індекси
  UNIQUE(post_id)
);

-- Таблиця для версій графіків від Zoe
CREATE TABLE zoe_schedule_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- ID формату: "zoe-2025-12-05-v001"
  version_id TEXT NOT NULL UNIQUE,

  -- Дата графіка (для якої дати цей графік)
  schedule_date TEXT NOT NULL,

  -- Номер версії для цієї дати (1, 2, 3...)
  version_number INTEGER NOT NULL,

  -- Коли ми виявили цю версію (коли зробили fetch)
  detected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Час оновлення з сайту "(оновлено о 21:34)" якщо є
  -- Це тільки ЧАС, без дати!
  site_update_time TEXT,

  -- Хеш контенту графіка (для швидкого порівняння)
  content_hash TEXT NOT NULL,

  -- Розпарсені дані графіка (JSON)
  schedule_data TEXT NOT NULL,

  -- Посилання на snapshot звідки взято
  snapshot_id INTEGER NOT NULL,

  -- Чи є це оновлення чи новий графік
  change_type TEXT NOT NULL, -- new, updated

  FOREIGN KEY (snapshot_id) REFERENCES zoe_snapshots(id),
  UNIQUE(schedule_date, version_number)
);

-- Таблиця для версій графіків від Telegram
CREATE TABLE telegram_schedule_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- ID формату: "tg-2537"
  version_id TEXT NOT NULL UNIQUE,

  -- Дата графіка
  schedule_date TEXT NOT NULL,

  -- Реальний post_id з Telegram
  post_id INTEGER NOT NULL,

  -- Коли пост був опублікований в Telegram
  message_date DATETIME NOT NULL,

  -- Коли ми виявили цю версію
  detected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Хеш контенту
  content_hash TEXT NOT NULL,

  -- Розпарсені дані графіка (JSON)
  schedule_data TEXT NOT NULL,

  -- Посилання на snapshot
  snapshot_id INTEGER NOT NULL,

  -- Тип зміни
  change_type TEXT NOT NULL, -- new, updated

  FOREIGN KEY (snapshot_id) REFERENCES telegram_snapshots(id),
  UNIQUE(post_id)
);

-- Unified view для всіх версій графіків (з обох джерел)
CREATE VIEW all_schedule_versions AS
SELECT
  version_id,
  schedule_date,
  detected_at,
  content_hash,
  schedule_data,
  change_type,
  'zoe' as source,
  site_update_time as source_metadata
FROM zoe_schedule_versions
UNION ALL
SELECT
  version_id,
  schedule_date,
  detected_at,
  content_hash,
  schedule_data,
  change_type,
  'telegram' as source,
  message_date as source_metadata
FROM telegram_schedule_versions
ORDER BY schedule_date DESC, detected_at DESC;

-- Індекси для швидкого пошуку
CREATE INDEX idx_zoe_versions_date ON zoe_schedule_versions(schedule_date, version_number DESC);
CREATE INDEX idx_zoe_versions_detected ON zoe_schedule_versions(detected_at DESC);
CREATE INDEX idx_zoe_versions_hash ON zoe_schedule_versions(content_hash);

CREATE INDEX idx_tg_versions_date ON telegram_schedule_versions(schedule_date, post_id DESC);
CREATE INDEX idx_tg_versions_detected ON telegram_schedule_versions(detected_at DESC);
CREATE INDEX idx_tg_versions_post ON telegram_schedule_versions(post_id);
CREATE INDEX idx_tg_versions_hash ON telegram_schedule_versions(content_hash);

CREATE INDEX idx_zoe_snapshots_fetch ON zoe_snapshots(fetch_timestamp DESC);
CREATE INDEX idx_tg_snapshots_msg ON telegram_snapshots(message_date DESC);

-- =====================================================
-- ПРИКЛАДИ ВИКОРИСТАННЯ
-- =====================================================

-- 1. Отримати всі версії графіка на конкретну дату (з обох джерел)
-- SELECT * FROM all_schedule_versions
-- WHERE schedule_date = '2025-12-05'
-- ORDER BY detected_at DESC;

-- 2. Отримати останню версію графіка на дату (тільки від Zoe)
-- SELECT * FROM zoe_schedule_versions
-- WHERE schedule_date = '2025-12-05'
-- ORDER BY version_number DESC
-- LIMIT 1;

-- 3. Порівняти дві версії графіка
-- SELECT
--   v1.version_id as old_version,
--   v2.version_id as new_version,
--   v1.content_hash as old_hash,
--   v2.content_hash as new_hash,
--   v1.schedule_data as old_data,
--   v2.schedule_data as new_data
-- FROM zoe_schedule_versions v1
-- JOIN zoe_schedule_versions v2 ON v1.schedule_date = v2.schedule_date
-- WHERE v1.schedule_date = '2025-12-05'
--   AND v1.version_number = 1
--   AND v2.version_number = 2;

-- 4. Знайти всі дати які мають оновлення (більше 1 версії)
-- SELECT
--   schedule_date,
--   COUNT(*) as version_count,
--   MIN(detected_at) as first_seen,
--   MAX(detected_at) as last_updated
-- FROM zoe_schedule_versions
-- GROUP BY schedule_date
-- HAVING version_count > 1
-- ORDER BY last_updated DESC;
