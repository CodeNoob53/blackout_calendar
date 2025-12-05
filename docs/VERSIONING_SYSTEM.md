# Система Версіонування Графіків

## Огляд

Нова система версіонування вирішує проблеми з відстеженням оновлень графіків від різних джерел (Zoe та Telegram). Тепер кожен графік має стабільний ID та зберігається повна історія змін.

## Проблеми які вирішує

### Проблема 1: ZoeScraper генерував новий ID щоразу
**Було:**
```javascript
const zoeSourceId = Date.now(); // Завжди новий timestamp
```

**Стало:**
```javascript
const versionNumber = getNextZoeVersionNumber(scheduleDate); // 1, 2, 3...
const versionId = generateZoeVersionId(scheduleDate, versionNumber); // "zoe-2025-12-05-v001"
```

### Проблема 2: Неможливо було порівняти версії графіків
**Було:** Тільки одна версія в БД, старі дані затирались

**Стало:** Всі версії зберігаються з хешами контенту для порівняння

### Проблема 3: Відсутня хронологія оновлень
**Було:** Важко зрозуміти коли і що змінилось

**Стало:** Повна історія з timestamps та описом змін

## Структура Version ID

### Для Zoe:
```
Формат: zoe-{DATE}-v{VERSION}
Приклад: zoe-2025-12-05-v001
         zoe-2025-12-05-v002
         zoe-2025-12-06-v001
```

- `DATE`: Дата графіка (YYYY-MM-DD)
- `VERSION`: Номер версії для цієї дати (001, 002, 003...)

### Для Telegram:
```
Формат: tg-{POST_ID}
Приклад: tg-2537
         tg-2538
```

- `POST_ID`: Реальний ID поста з Telegram каналу

## Нові таблиці БД

### 1. `zoe_snapshots`
Зберігає RAW HTML з кожного fetch від Zoe
```sql
CREATE TABLE zoe_snapshots (
  id INTEGER PRIMARY KEY,
  fetch_timestamp DATETIME NOT NULL,
  raw_html TEXT NOT NULL,
  parsed_json TEXT,
  processing_status TEXT DEFAULT 'pending'
);
```

### 2. `telegram_snapshots`
Зберігає RAW текст кожного поста з Telegram
```sql
CREATE TABLE telegram_snapshots (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL UNIQUE,
  message_date DATETIME NOT NULL,
  raw_text TEXT NOT NULL,
  parsed_json TEXT,
  processing_status TEXT DEFAULT 'pending'
);
```

### 3. `zoe_schedule_versions`
Зберігає всі версії графіків від Zoe
```sql
CREATE TABLE zoe_schedule_versions (
  id INTEGER PRIMARY KEY,
  version_id TEXT NOT NULL UNIQUE,
  schedule_date TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  detected_at DATETIME NOT NULL,
  site_update_time TEXT,
  content_hash TEXT NOT NULL,
  schedule_data TEXT NOT NULL,
  snapshot_id INTEGER NOT NULL,
  change_type TEXT NOT NULL
);
```

### 4. `telegram_schedule_versions`
Зберігає всі версії графіків від Telegram
```sql
CREATE TABLE telegram_schedule_versions (
  id INTEGER PRIMARY KEY,
  version_id TEXT NOT NULL UNIQUE,
  schedule_date TEXT NOT NULL,
  post_id INTEGER NOT NULL,
  message_date DATETIME NOT NULL,
  content_hash TEXT NOT NULL,
  schedule_data TEXT NOT NULL,
  snapshot_id INTEGER NOT NULL,
  change_type TEXT NOT NULL
);
```

## Як працює версіонування

### Для ZoeScraper:

1. **Fetch HTML** → Зберігаємо в `zoe_snapshots`
2. **Parse графіки** → Для кожного графіка:
   - Генеруємо хеш контенту
   - Порівнюємо з останньою версією
   - Якщо контент змінився → створюємо нову версію
   - Якщо контент той самий → пропускаємо

```javascript
// Приклад: Графік на 05.12.2025 оновлений 3 рази
// v001 - перша публікація (12:00)
// v002 - оновлення (15:30) - змінено черга 1.1
// v003 - оновлення (18:00) - додано черга 2.2
```

### Для TelegramScraper:

1. **Fetch пости** → Зберігаємо кожен в `telegram_snapshots`
2. **Parse графіки** → Для кожного графіка:
   - Перевіряємо чи цей post_id вже оброблений
   - Генеруємо хеш контенту
   - Порівнюємо з останньою версією
   - Зберігаємо версію з post_id

```javascript
// Приклад: Графік на 05.12.2025 з Telegram
// tg-2537 - перша публікація
// tg-2541 - оновлення (новий пост)
// tg-2545 - ще оновлення
```

## Хешування контенту

Для визначення чи змінився графік використовується SHA256 хеш:

```javascript
const hash = generateScheduleHash({
  date: '2025-12-05',
  queues: [
    { queue: '1.1', intervals: [...] },
    { queue: '1.2', intervals: [...] }
  ]
});
// hash: "ec41bbce85d7e8041e5a3e8b4c9f2d1a..."
```

**Важливо:** Порядок черг та інтервалів нормалізується перед хешуванням, тому різний порядок не впливає на хеш.

## Порівняння версій

Система автоматично визначає різницю між версіями:

```javascript
const differences = findScheduleDifferences(oldSchedule, newSchedule);
// {
//   hasChanges: true,
//   queuesAdded: ['2.2'],
//   queuesRemoved: [],
//   queuesModified: [
//     { queue: '1.1', oldIntervals: [...], newIntervals: [...] }
//   ]
// }

const description = formatDifferencesDescription(differences);
// "Додано черг: 2.2; Змінено інтервали в чергах: 1.1"
```

## API для роботи з версіями

### Отримати всі версії графіка на дату
```javascript
import { getAllVersionsForDate } from './src/db.js';

// Всі версії з обох джерел
const versions = getAllVersionsForDate('2025-12-05');

// Тільки від Zoe
const zoeVersions = getAllVersionsForDate('2025-12-05', 'zoe');

// Тільки від Telegram
const tgVersions = getAllVersionsForDate('2025-12-05', 'telegram');
```

### Отримати статистику
```javascript
import { getVersionStats } from './src/db.js';

const stats = getVersionStats();
// {
//   zoe: {
//     datesCount: 10,
//     versionsCount: 25,
//     avgVersionsPerDate: 2.5
//   },
//   telegram: {
//     datesCount: 15,
//     versionsCount: 30
//   }
// }
```

### Отримати останню версію
```javascript
import { getLatestZoeVersion, getLatestTelegramVersion } from './src/db.js';

const latestZoe = getLatestZoeVersion('2025-12-05');
// { version_id: 'zoe-2025-12-05-v003', content_hash: '...', ... }

const latestTg = getLatestTelegramVersion('2025-12-05');
// { version_id: 'tg-2541', content_hash: '...', ... }
```

## Логування

Система детально логує всі операції:

```
[ZoeScraper] Saved snapshot #42
[ZoeScraper] Found 3 potential schedules
[ZoeScraper] Schedule for 2025-12-05 unchanged (hash: ec41bbce...)
[ZoeScraper] Schedule for 2025-12-06 changed: Змінено інтервали в чергах: 1.1
[ZoeScraper] New 2025-12-06 version 1 (zoe-2025-12-06-v001)
[ZoeScraper] Updated 2025-12-07 version 2 (zoe-2025-12-07-v002)
```

## Backward Compatibility

Система зберігає дані і в старих таблицях (`outages`, `schedule_metadata`, `schedule_history`) для сумісності. Поступово можна буде перейти повністю на нову систему.

## Міграція

Міграція виконується автоматично при запуску `initDatabase()`:
- Перевіряє наявність нових таблиць
- Створює їх якщо не існують
- Створює індекси для швидкого пошуку

## Тестування

Запустити тести:
```bash
node scripts/test-versioning.js
```

Тести перевіряють:
- ✅ Міграцію БД
- ✅ Генерацію version ID
- ✅ Парсинг version ID
- ✅ Хешування контенту
- ✅ Знаходження відмінностей
- ✅ Отримання статистики

## Наступні кроки

### TODO (опціонально):

1. **API endpoints** для перегляду історії:
   - `GET /api/schedule/versions/:date` - всі версії
   - `GET /api/schedule/versions/:date/compare?v1=...&v2=...` - порівняння

2. **Очищення старих snapshots** (для економії місця):
   - Зберігати snapshots тільки за останні N днів
   - Версії зберігаються завжди (вони компактніші)

3. **Візуалізація** в UI:
   - Показувати історію оновлень графіка
   - Diff viewer для порівняння версій

## Переваги нової системи

✅ **Стабільні ID** - не змінюються при перезапуску
✅ **Повна історія** - зберігаються всі версії
✅ **Порівняння** - легко побачити що змінилось
✅ **Окремі джерела** - Zoe та Telegram не конфліктують
✅ **Хронологія** - правильний порядок оновлень
✅ **Відновлення** - можна перепарсити raw дані
✅ **Аудит** - повний trace всіх змін
