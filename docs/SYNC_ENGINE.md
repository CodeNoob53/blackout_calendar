# Sync Engine - Система синхронізації графіків

## Опис

**Sync Engine** - система для об'єднання та синхронізації графіків відключень з двох джерел:
- **Telegram** - точний час публікації, обмежена історія (4-5 днів)
- **Zoe (zoe.com.ua)** - повна історія, але без точного часу, можливі лайнографіки

## Проблема

Без Sync Engine обидва scraper'и пишуть в БД незалежно, що призводить до:
- ❌ Дублювання графіків
- ❌ Неправильного `update_count` (просто інкрементується)
- ❌ Порушеної логіки змін (Telegram може перезаписати Zoe)
- ❌ Збереження лайнографіків (помилкові старі дати)

## Рішення

Sync Engine об'єднує дані з обох джерел в єдину хронологію за наступними правилами:

### 1. Фільтрація лайнографіків

```javascript
// Лайнографік = графік з датою меншою за сьогодні
if (parsed.date < today) {
  // ІГНОРУВАТИ - це помилкова публікація
}
```

**Приклад:**
- Сьогодні: 26 листопада
- Дата графіка: 25 листопада
- Результат: ❌ Ігнорується як лайнографік

### 2. Пріоритет контенту над джерелом

Джерело визначається не по назві, а по **часу появи контенту**:

```javascript
// Zoe без messageDate = ранній апдейт
if (!zoeUpdate.messageDate && telegramUpdate.messageDate) {
  priority = 'zoe'; // Zoe був раніше
}

// При однаковому контенті - пріоритет раннього
if (contentEquals(update1, update2)) {
  if (update1.time < update2.time) {
    useFinal = update1; // Ранній має пріоритет
  }
}
```

**Приклад:**
- Zoe опублікував графік на 27.11 (час невідомий, але раніше)
- Telegram опублікував той самий графік о 14:30
- Результат: ✅ Використовується Zoe (як пріоритетний), Telegram ігнорується як дублікат

### 3. Один день = один запис

```javascript
// В БД зберігається тільки фінальний стан
timeline = [update1, update2, update3]; // 3 апдейти за день
finalUpdate = timeline[timeline.length - 1]; // Останній

// В БД:
outages -> фінальний графік
schedule_history -> тільки фінальний апдейт
schedule_metadata -> update_count = 2 (не 3, бо перший = new)
```

### 4. Правильний update_count

```javascript
// update_count = реальна кількість ЗМІН (не включаючи перший запис)
timeline = [update1, update2, update3];
update_count = timeline.length - 1; // = 2 зміни

// НЕ просто інкремент!
```

## Архітектура

```
┌─────────────────────────────────────────────────────────────┐
│                         SyncEngine                           │
│                                                              │
│  ┌──────────────┐           ┌──────────────┐               │
│  │   Telegram   │           │     Zoe      │               │
│  │   Scraper    │           │   Scraper    │               │
│  └──────┬───────┘           └──────┬───────┘               │
│         │                          │                        │
│         └──────────┬───────────────┘                        │
│                    │                                        │
│         ┌──────────▼──────────┐                            │
│         │  Fetch All Updates  │                            │
│         │    (dry-run)        │                            │
│         └──────────┬──────────┘                            │
│                    │                                        │
│         ┌──────────▼──────────┐                            │
│         │ Filter Lineographs  │ ← parsed.date < today      │
│         └──────────┬──────────┘                            │
│                    │                                        │
│         ┌──────────▼──────────┐                            │
│         │   Group By Date     │                            │
│         └──────────┬──────────┘                            │
│                    │                                        │
│         ┌──────────▼──────────┐                            │
│         │  Build Timeline     │ ← Sort, deduplicate        │
│         └──────────┬──────────┘                            │
│                    │                                        │
│         ┌──────────▼──────────┐                            │
│         │  Write Final State  │ ← Only last update         │
│         └──────────┬──────────┘                            │
│                    │                                        │
│         ┌──────────▼──────────┐                            │
│         │ Invalidate Cache    │                            │
│         └─────────────────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

## Використання

### 1. Налаштування

У `.env` додайте:

```env
# Використовувати SyncEngine (рекомендовано)
USE_SYNC_ENGINE=true

# Обов'язково увімкніть обидва джерела
ENABLE_ZOE_SCRAPER=true
```

### 2. Bootstrap (початкова синхронізація)

```bash
# Синхронізація всіх даних
npm run sync:bootstrap
```

Що відбувається:
1. Збирає ВСІ дані з Telegram і Zoe (без запису в БД)
2. Фільтрує лайнографіки
3. Групує по датах
4. Будує timeline для кожної дати
5. Записує тільки фінальний стан
6. Оновлює `update_count`

**Коли запускати:**
- При першому запуску
- Після зміни даних в БД вручну
- При підозрі на inconsistency

### 3. Orchestrator (регулярна синхронізація)

```bash
# Синхронізація останніх 7 днів
npm run sync:orchestrator
```

Та сама логіка, але тільки для останніх 7 днів.

**Запускається автоматично:**
- Кожні 30 хвилин (або згідно `UPDATE_INTERVAL`)
- Якщо `USE_SYNC_ENGINE=true` в `.env`
- Замість окремих викликів `updateFromTelegram()` та `updateFromZoe()`

### 4. Синхронізація конкретної дати

```bash
# Для тестування або дебагу
npm run sync:date -- 2024-11-26
```

## Приклад роботи

### Вхідні дані

**Telegram:**
```javascript
[
  { id: 2535, messageDate: '2024-11-26T10:00:00Z', date: '2024-11-27', queues: [...] },
  { id: 2536, messageDate: '2024-11-26T14:30:00Z', date: '2024-11-27', queues: [...] }, // той самий
  { id: 2537, messageDate: '2024-11-26T16:00:00Z', date: '2024-11-27', queues: [... інший] }
]
```

**Zoe:**
```javascript
[
  { date: '2024-11-25', queues: [...] }, // лайнографік
  { date: '2024-11-27', queues: [...] }, // той самий що id:2535
  { date: '2024-11-28', queues: [...] }
]
```

### Обробка

```
1. Фільтрація лайнографіків:
   Zoe 2024-11-25 → ❌ ВИДАЛЕНО (< today)

2. Групування по датах:
   2024-11-27: [TG:2535, TG:2536, TG:2537, Zoe:27]
   2024-11-28: [Zoe:28]

3. Timeline для 2024-11-27:
   - Сортування: [Zoe:27 (немає messageDate), TG:2535 (10:00), TG:2536 (14:30), TG:2537 (16:00)]
   - Дедуплікація: [Zoe:27, TG:2537] (TG:2535 та TG:2536 = дублікати Zoe:27)
   - update_count = 2 - 1 = 1

4. Timeline для 2024-11-28:
   - [Zoe:28]
   - update_count = 1 - 1 = 0 (new)

5. Запис в БД:
   2024-11-27: finalUpdate = TG:2537, update_count = 1
   2024-11-28: finalUpdate = Zoe:28, update_count = 0
```

### Результат в БД

```sql
-- outages: тільки фінальний графік
SELECT * FROM outages WHERE date = '2024-11-27';
-- Графік з TG:2537

-- schedule_metadata: коректний update_count
SELECT * FROM schedule_metadata WHERE date = '2024-11-27';
-- { date: '2024-11-27', update_count: 1, source: 'telegram', source_msg_id: 2537 }

-- schedule_history: тільки фінальний апдейт
SELECT * FROM schedule_history WHERE date = '2024-11-27';
-- Один запис з TG:2537
```

## Порівняння з/без SyncEngine

### Без SyncEngine

```javascript
// Окремі scraper'и пишуть незалежно
updateFromTelegram(); // Записує TG:2535
updateFromTelegram(); // Записує TG:2536 (update_count++)
updateFromTelegram(); // Записує TG:2537 (update_count++)
updateFromZoe();      // Записує Zoe:27 (може перезаписати!)

// Результат:
// ❌ update_count = 3 (неправильно, є дублікати)
// ❌ Можливо збережено лайнографік
// ❌ Невідомо який графік фінальний
```

### З SyncEngine

```javascript
// Orchestrator об'єднує дані
orchestrator();

// Результат:
// ✅ update_count = 1 (коректно)
// ✅ Лайнографіки відфільтровані
// ✅ Фінальний стан відомий (TG:2537)
```

## Тестування

```bash
# Запустити bootstrap і перевірити логи
npm run sync:bootstrap

# Перевірити результат
sqlite3 data/blackout.db "SELECT date, update_count, source FROM schedule_metadata ORDER BY date DESC LIMIT 10;"

# Запустити orchestrator вручну
npm run sync:orchestrator
```

## Логування

Sync Engine детально логує кожен крок:

```
[SyncEngine] === ORCHESTRATOR: Starting periodic sync ===
[SyncEngine] Fetching Telegram updates (dry-run)...
[SyncEngine] Fetched 15 Telegram updates
[SyncEngine] Fetching Zoe updates (dry-run)...
[SyncEngine] Fetched 8 Zoe updates
[SyncEngine] Total updates before filtering: 23
[SyncEngine] Filtered lineograph: date=2024-11-25 (today=2024-11-26)
[SyncEngine] Updates after filtering: 22 (removed 1 lineographs)
[SyncEngine] Grouped into 5 dates
[SyncEngine] Processing 2024-11-27: 4 updates
[SyncEngine] Timeline for 2024-11-27: 2 unique updates (removed 2 duplicates)
[SyncEngine] Writing synced data for 2024-11-27: 2 updates, final from telegram
[SyncEngine] Synced 2024-11-27: 2 updates, final=telegram
[SyncEngine] === ORCHESTRATOR COMPLETED ===
[SyncEngine] Total dates: 5, Synced: 5, Skipped: 0
```

## Best Practices

1. **Завжди використовуйте SyncEngine** для production
2. **Запустіть bootstrap** після встановлення або міграції
3. **Моніторте логи** для виявлення проблем
4. **Не змінюйте дані в БД вручну** без повторного bootstrap
5. **Використовуйте `sync:date`** для тестування конкретних дат

## Troubleshooting

### Проблема: Дублікати все ще з'являються

**Рішення:**
```bash
# Запустити bootstrap для пересинхронізації
npm run sync:bootstrap
```

### Проблема: update_count неправильний

**Рішення:**
```bash
# Видалити всі дані і запустити bootstrap
sqlite3 data/blackout.db "DELETE FROM outages; DELETE FROM schedule_history; DELETE FROM schedule_metadata;"
npm run sync:bootstrap
```

### Проблема: Лайнографіки зберігаються

**Причина:** `USE_SYNC_ENGINE=false` або не налаштовано

**Рішення:**
```bash
# Перевірити .env
grep USE_SYNC_ENGINE .env

# Встановити USE_SYNC_ENGINE=true
# Перезапустити сервер
```

## Міграція з старої системи

```bash
# 1. Зробити backup
cp data/blackout.db data/blackout.db.backup

# 2. Встановити USE_SYNC_ENGINE=true в .env
echo "USE_SYNC_ENGINE=true" >> .env

# 3. Запустити bootstrap
npm run sync:bootstrap

# 4. Перевірити результат
npm test

# 5. Запустити сервер
npm start
```

## API

### `bootstrap()`

Початкова синхронізація всіх даних з обох джерел.

```javascript
import { bootstrap } from './services/SyncEngine.js';

const result = await bootstrap();
// {
//   total: 10,      // Всього дат
//   synced: 10,     // Синхронізовано
//   skipped: 0,     // Пропущено
//   dates: [...]    // Деталі
// }
```

### `orchestrator()`

Регулярна синхронізація останніх 7 днів.

```javascript
import { orchestrator } from './services/SyncEngine.js';

const result = await orchestrator();
// Та сама структура що й bootstrap()
```

### `syncDate(date)`

Синхронізація конкретної дати.

```javascript
import { syncDate } from './services/SyncEngine.js';

const result = await syncDate('2024-11-26');
```

## Внутрішня структура

### Формат Update

```javascript
{
  sourceId: 2537,                        // ID з джерела
  source: 'telegram',                    // 'telegram' або 'zoe'
  messageDate: '2024-11-26T14:30:00Z',  // Час публікації (null для Zoe)
  parsed: {
    date: '2024-11-27',
    queues: [
      {
        queue: '1.1',
        intervals: [
          { start: '08:00', end: '12:00' }
        ]
      }
    ]
  }
}
```

### Timeline

```javascript
[
  { sourceId: 123, source: 'zoe', messageDate: null, parsed: {...} },      // Ранній (Zoe)
  { sourceId: 2537, source: 'telegram', messageDate: '...', parsed: {...} } // Пізніший
]
```

## Подальший розвиток

- [ ] Метрики та моніторинг
- [ ] Webhooks для нотифікацій про зміни
- [ ] UI для перегляду timeline
- [ ] Rollback до попередніх версій графіків
- [ ] Автоматичне виявлення аномалій
