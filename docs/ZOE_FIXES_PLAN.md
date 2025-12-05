# План виправлень для ZoeScraper

## На основі аналізу реальних даних (графіки порівняння.csv)

### Виявлені факти:

1. ✅ Zoe публікує ЕКСКЛЮЗИВНІ оновлення (яких немає в Telegram):
   - 04.12 о 21:34 - тільки Zoe
   - 05.12 о 18:31 - тільки Zoe

2. ✅ На 05.12 було 5 версій графіка:
   - Початкова публікація
   - Оновлення о 06:47
   - Оновлення о 09:30
   - Оновлення о 18:31 (ексклюзив Zoe!)
   - Оновлення о 19:37

3. ✅ Порядок на сайті обернений (новіші вгорі)

4. ✅ Є реальні зміни між версіями (різні інтервали для черг)

### Що НЕ працює зараз:

❌ **Фільтрація дублікатів втрачає версії**
```javascript
// В parseZoeHTML - Map фільтрує за контентом
const key = `${parsed.date}-${parsed.queues.length}-${JSON.stringify(parsed.queues[0])}`;
if (!seenDates.has(key)) {
  // Зберігаємо
} else {
  // ПРОПУСКАЄМО - але це може бути реальне оновлення!
}
```

❌ **extractUpdateTime не знає реальної дати публікації**
- Оновлення "о 21:34" на 04.12 може бути опубліковане 05.12 о 21:34
- Функція створить: 2024-12-04T21:34:00 (неправильно!)

## Рішення PHASE 1 (мінімальні зміни):

### 1. Видалити фільтрацію дублікатів в parseZoeHTML

**Файл:** `src/scraper/zoeScraper.js`

**Було:**
```javascript
const seenDates = new Map();
// ... код парсингу ...
const key = `${parsed.date}-${parsed.queues.length}-${JSON.stringify(parsed.queues[0])}`;

if (!seenDates.has(key)) {
  schedules.push(newSchedule);
  seenDates.set(key, index);
} else {
  const existingIndex = seenDates.get(key);
  // Заміна якщо новий має messageDate
}
```

**Стає:**
```javascript
// ВИДАЛЯЄМО Map і логіку фільтрації
// Просто додаємо всі знайдені графіки
schedules.push(newSchedule);
```

**Чому це безпечно:**
- Система версіонування (хешування) вже обробляє дублікати
- Ми отримаємо ВСІ оновлення включно з ексклюзивними

### 2. Додати pagePosition метадату

**Додати в parseZoeHTML:**
```javascript
export function parseZoeHTML(html) {
  const $ = cheerio.load(html);
  const schedules = [];
  let positionIndex = 0; // ДОДАТИ

  headers.each((_, el) => {
    // ... існуючий код ...

    schedules.push({
      parsed,
      source: 'zoe',
      messageDate: updateTime,
      rawText: content.substring(0, 300),
      pagePosition: positionIndex++ // ДОДАТИ
    });
  });

  return schedules;
}
```

**Оновити updateFromZoe щоб передавати pagePosition:**
```javascript
for (const { parsed, source, messageDate, rawText, pagePosition } of parsedSchedules) {
  // ... існуючий код генерації версії ...

  // Зберігаємо з pagePosition
  const saved = saveZoeVersion(
    versionId,
    scheduleDate,
    versionNumber,
    contentHash,
    parsed,
    snapshotId,
    changeType,
    messageDate,
    pagePosition // ДОДАТИ
  );
}
```

### 3. Додати колонку page_position в БД

**Міграція в db.js:**
```javascript
// Додати в initDatabase після створення zoe_schedule_versions
const hasPagePosition = db.prepare("PRAGMA table_info(zoe_schedule_versions)")
  .all()
  .some(col => col.name === 'page_position');

if (!hasPagePosition) {
  db.exec(`ALTER TABLE zoe_schedule_versions ADD COLUMN page_position INTEGER`);
  Logger.success('Database', 'Migration: Added page_position to zoe_schedule_versions');
}
```

**Оновити saveZoeVersion:**
```javascript
export function saveZoeVersion(
  versionId,
  scheduleDate,
  versionNumber,
  contentHash,
  scheduleData,
  snapshotId,
  changeType,
  siteUpdateTime = null,
  pagePosition = null // ДОДАТИ
) {
  const stmt = db.prepare(`
    INSERT INTO zoe_schedule_versions
    (version_id, schedule_date, version_number, content_hash, schedule_data,
     snapshot_id, change_type, site_update_time, page_position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    stmt.run(
      versionId, scheduleDate, versionNumber, contentHash,
      JSON.stringify(scheduleData), snapshotId, changeType,
      siteUpdateTime, pagePosition // ДОДАТИ
    );
    return true;
  } catch (error) {
    Logger.error('Database', `Failed to save Zoe version ${versionId}`, error);
    return false;
  }
}
```

## Рішення PHASE 2 (складніше, опціонально):

### Покращити extractUpdateTime

**Проблема:** Не знаємо реальну дату публікації оновлення

**Варіант 1:** Використовувати fetch timestamp
```javascript
function extractUpdateTime(text, scheduleDate = null, fetchTimestamp = null) {
  const timeMatch = text.match(/\(оновлено\s+о\s+(\d{1,2}):(\d{2})\)/i);

  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);

    // Використовуємо fetch timestamp як базу
    const fetchDate = fetchTimestamp ? new Date(fetchTimestamp) : new Date();
    const updateTime = new Date(fetchDate);
    updateTime.setHours(hours, minutes, 0, 0);

    // Якщо час в майбутньому - це було вчора
    if (updateTime > fetchDate) {
      updateTime.setDate(updateTime.getDate() - 1);
    }

    return updateTime.toISOString();
  }

  return null;
}
```

**Варіант 2:** Зберігати "час" окремо від "дати"
```javascript
// В БД зберігати:
// - site_update_time: "21:34" (тільки час)
// - detected_at: "2024-12-05T10:30:00" (коли виявили)

// Для сортування використовувати detected_at
```

## Тестування

**Створити тест з реальними даними:**
```javascript
// tests/zoe-real-data-test.js
import { parseZoeHTML } from '../src/scraper/zoeScraper.js';
import fs from 'fs';
import { parse } from 'csv-parse/sync';

// Читаємо реальні дані
const csv = fs.readFileSync('графіки порівняння.csv', 'utf-8');
const records = parse(csv, { columns: false });

// Витягуємо Zoe дані (колонка 0)
const zoeData = records.filter(r => r[0] && r[0].includes('ГРУДНЯ'));

console.log('Знайдено графіків з Zoe:', zoeData.length);

// Очікуємо:
// - 1 графік на 06.12
// - 5 версій на 05.12
// - 4 версії на 04.12
// ВСЬОГО: 10 графіків

// Перевірити що parseZoeHTML знаходить всі
```

## Результат PHASE 1:

✅ Збережемо ВСІ оновлення (включно з ексклюзивними)
✅ Матимемо page_position для відстеження порядку
✅ Система версіонування відфільтрує справжні дублікати через хеш
✅ Зможемо відновити оригінальний порядок на сайті

## Чеклист виконання:

- [ ] 1. Видалити Map фільтрацію в parseZoeHTML
- [ ] 2. Додати pagePosition в parseZoeHTML
- [ ] 3. Додати міграцію для page_position колонки
- [ ] 4. Оновити saveZoeVersion signature
- [ ] 5. Оновити updateFromZoe для передачі pagePosition
- [ ] 6. Запустити тести
- [ ] 7. Перевірити на реальних даних

## Оцінка часу:

**PHASE 1:** ~30 хвилин
**PHASE 2:** ~2 години (з тестуванням)

Рекомендую почати з PHASE 1!
