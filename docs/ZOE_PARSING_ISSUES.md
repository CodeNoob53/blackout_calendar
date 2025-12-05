# Проблеми парсингу Zoe та рекомендації

## Виявлені проблеми

### 1. **Порядок на сайті - обернений хронології**

**Проблема:** На сайті Zoe.com.ua графіки розміщені в оберненому порядку:
```
[Сторінка - зверху вниз]
- Графік на 07.12 (новіший)        ← ВИЩЕ
- Оновлення 06.12 (о 18:00)
- Оновлення 06.12 (о 15:00)
- Початковий 06.12 (о 12:00)       ← НИЖЧЕ
```

**Наслідки:**
- Позиція на сторінці НЕ відповідає хронології
- Парсер збирає в порядку появи (зверху вниз)
- Для відновлення хронології потрібен час оновлення

### 2. **extractUpdateTime використовує дату графіка, а не дату публікації**

**Код:**
```javascript
function extractUpdateTime(text, scheduleDate = null) {
  const timeMatch = text.match(/\(оновлено\s+о\s+(\d{1,2}):(\d{2})\)/i);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);

    if (scheduleDate) {
      // ПРОБЛЕМА: Використовується дата графіка!
      const [year, month, day] = scheduleDate.split('-').map(Number);
      updateDate = new Date(year, month - 1, day, hours, minutes, 0);
    }
  }
}
```

**Приклад проблеми:**
- Графік на 06.12 оновлений 05.12 о 23:00
- extractUpdateTime створить: `2025-12-06T23:00:00` (неправильно!)
- Має бути: `2025-12-05T23:00:00`

**Наслідки:**
- Неправильна хронологія для пізніх оновлень
- Оновлення в різні дні виглядають як одного дня

### 3. **parseZoeHTML фільтрує дублікати за контентом**

**Код:**
```javascript
const seenDates = new Map();
const key = `${parsed.date}-${parsed.queues.length}-${JSON.stringify(parsed.queues[0])}`;

if (!seenDates.has(key)) {
  schedules.push(newSchedule);
  seenDates.set(key, index);
} else {
  // ПРОБЛЕМА: Пропускаємо дублікат, навіть якщо це оновлення!
}
```

**Наслідки:**
- Втрачаються оновлення якщо контент схожий
- Не зберігається історія публікацій

### 4. **Немає метаданих про позицію на сторінці**

**Проблема:** Не зберігається порядок появи на сторінці, що може бути корисним для:
- Відновлення оригінального порядку
- Дебагу проблем з парсингом
- Розуміння як сайт структурує дані

## Рекомендації для вирішення

### Рекомендація 1: Додати метадату позиції

```javascript
export function parseZoeHTML(html) {
  const schedules = [];
  let positionIndex = 0; // Додати лічильник

  headers.each((_, el) => {
    // ... парсинг ...

    const newSchedule = {
      parsed,
      source: 'zoe',
      messageDate: updateTime,
      rawText: content.substring(0, 300),
      pagePosition: positionIndex++ // ДОДАТИ позицію
    };

    schedules.push(newSchedule);
  });

  return schedules;
}
```

### Рекомендація 2: Не фільтрувати дублікати в parseZoeHTML

Система версіонування вже обробляє дублікати через хешування:
```javascript
// ВИДАЛИТИ фільтрацію в parseZoeHTML
// if (!seenDates.has(key)) { ... }

// ЗАМІНИТИ на просте додавання
schedules.push(newSchedule);
```

**Чому це добре:**
- Проста логіка парсингу (просто витягуємо все)
- Вся фільтрація в одному місці (updateFromZoe через хеші)
- Зберігається повна історія

### Рекомендація 3: Покращити extractUpdateTime

**Варіант А:** Додати параметр для дати публікації
```javascript
function extractUpdateTime(text, scheduleDate = null, publishDate = null) {
  const timeMatch = text.match(/\(оновлено\s+о\s+(\d{1,2}):(\d{2})\)/i);

  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);

    // Використовуємо дату публікації якщо є, інакше дату графіка
    const baseDate = publishDate || scheduleDate;

    if (baseDate) {
      const [year, month, day] = baseDate.split('-').map(Number);
      return new Date(year, month - 1, day, hours, minutes, 0).toISOString();
    }
  }

  return null;
}
```

**Варіант Б:** Використовувати timestamp fetch для відносного визначення
```javascript
function extractUpdateTime(text, scheduleDate = null) {
  const timeMatch = text.match(/\(оновлено\s+о\s+(\d{1,2}):(\d{2})\)/i);

  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);

    // Використовуємо час fetch як базу
    const now = new Date();
    const updateTime = new Date(now);
    updateTime.setHours(hours, minutes, 0, 0);

    // Якщо час в майбутньому - це було вчора
    if (updateTime > now) {
      updateTime.setDate(updateTime.getDate() - 1);
    }

    return updateTime.toISOString();
  }

  return null;
}
```

### Рекомендація 4: Зберігати в БД додаткові метадані

**Додати колонки в zoe_schedule_versions:**
```sql
ALTER TABLE zoe_schedule_versions ADD COLUMN page_position INTEGER;
ALTER TABLE zoe_schedule_versions ADD COLUMN fetch_time DATETIME;
```

**Використання:**
```javascript
saveZoeVersion(
  versionId,
  scheduleDate,
  versionNumber,
  contentHash,
  parsed,
  snapshotId,
  changeType,
  messageDate,
  pagePosition,        // НОВИЙ параметр
  new Date().toISOString() // fetch_time
);
```

## Тестування

**Створити тест з реальними даними:**
```javascript
// tests/zoe-real-world-order.js
import { parseZoeHTML } from '../src/scraper/zoeScraper.js';

// HTML з реального сайту з кількома оновленнями
const realHTML = `...`;

const schedules = parseZoeHTML(realHTML);

// Перевірити:
1. Чи всі оновлення знайдені
2. Чи правильно витягнуто час
3. Чи правильний порядок після сортування за messageDate
4. Чи pagePosition збережено
```

## Пріоритети реалізації

**Мінімальні зміни (рекомендовано зараз):**
1. ✅ Додати pagePosition в parseZoeHTML
2. ✅ Видалити фільтрацію дублікатів (довіритись версіонуванню)
3. ✅ Зберігати pagePosition в БД

**Складніші покращення (опціонально):**
4. ⚠️ Покращити extractUpdateTime (потребує розуміння паттернів публікації)
5. ⚠️ Додати heuristics для визначення дати публікації

## Поточний стан

**Що працює:**
- ✅ Система версіонування з хешуванням
- ✅ Зберігання snapshots
- ✅ Порівняння версій

**Що потребує покращення:**
- ⚠️ Визначення хронології для Zoe оновлень
- ⚠️ Втрата історії через фільтрацію дублікатів
- ⚠️ Відсутність метаданих про позицію

## Висновки

1. **Порядок на сайті != хронологія** - потрібен час оновлення
2. **extractUpdateTime не ідеальний** - використовує дату графіка замість дати публікації
3. **Фільтрація дублікатів зайва** - система версіонування вже це робить
4. **Додаткові метадані корисні** - pagePosition, fetch_time

**Рекомендована стратегія:**
- Короткостроково: видалити фільтрацію, додати pagePosition
- Довгостроково: покращити визначення дати публікації через аналіз паттернів
