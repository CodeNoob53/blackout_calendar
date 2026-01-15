# Інструкції з деплою виправлення парсера

## 🐛 Проблема

**Сервер:** https://blackout-calendar-122838488015.us-west1.run.app/

**Симптом:** API повертає тільки 1 чергу (6.2) замість 12 черг

**Причина:** На продакшн сервері старий код parser.js, який не вміє парсити формат без слова "Черга"

**Приклад проблемного формату (пост 2745):**
```
1.1: 09:00 – 14:00, 18:00 – 23:00
1.2: 00:00 – 05:00, 09:00 – 14:00
```

## ✅ Виправлення

**Гілка:** `claude/update-message-format-jLOQa`

**Коміти:**
- `510791f` - Додано підтримку формату з "до"
- `5ba712c` - **КРИТИЧНЕ**: Виправлено парсинг без слова "Черга"
- `d74c391` - Документація

**Що виправлено:**
- ✅ Формат з "до": `Черга 1.1: 00:00 до 02:00`
- ✅ Формат БЕЗ "Черга": `1.1: 09:00 – 14:00`
- ✅ Всі 12 черг тепер парсяться коректно

## 🚀 Як задеплоїти

### Варіант 1: Через Pull Request (найбезпечніший)

```bash
# 1. Створіть PR
gh pr create --base main --head claude/update-message-format-jLOQa \
  --title "fix: Support all queue message formats in parser" \
  --body "Critical fix: parser now handles queues without 'Черга' prefix.

  Fixes:
  - Post 2733 format: Черга 1.1: 00:00 до 02:00
  - Post 2745 format: 1.1: 09:00 – 14:00

  Testing: all 12 queues parsed correctly"

# 2. Merge PR на GitHub

# 3. Якщо автодеплой налаштований - чекайте ~5 хвилин
# Якщо НІ - деплойте вручну:
gcloud run deploy blackout-calendar \
  --source . \
  --region us-west1
```

### Варіант 2: Прямий деплой з гілки

```bash
# 1. Checkout гілки
git fetch origin
git checkout claude/update-message-format-jLOQa

# 2. Деплой на Cloud Run
gcloud run deploy blackout-calendar \
  --source . \
  --region us-west1 \
  --allow-unauthenticated

# Деплой займе ~3-5 хвилин
```

### Варіант 3: Злити локально і задеплоїти

```bash
# 1. Злити гілку в main
git checkout main
git merge claude/update-message-format-jLOQa
git push origin main

# 2. Деплой
gcloud run deploy blackout-calendar \
  --source . \
  --region us-west1 \
  --allow-unauthenticated
```

## ✅ Перевірка після деплою

### 1. Перевірте що всі 12 черг парсяться:

```bash
# Повинні бути ВСІ 12 черг: 1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 4.1, 4.2, 5.1, 5.2, 6.1, 6.2
curl -s "https://blackout-calendar-122838488015.us-west1.run.app/api/schedules/latest" | jq '.queues | length'

# Має вивести: 12 (або скільки є в останньому графіку)
```

### 2. Перевірте конкретний графік:

```bash
# Перевірте що є всі черги
curl -s "https://blackout-calendar-122838488015.us-west1.run.app/api/schedules/2026-01-15" \
  | jq '.queues[] | .queue'

# Має вивести всі номери черг, а не тільки 6.2
```

### 3. Перевірте доступні дати:

```bash
curl -s "https://blackout-calendar-122838488015.us-west1.run.app/api/schedules/dates" \
  | jq '.dates'

# Має показати список дат з графіками
```

### 4. Якщо бази даних порожня - форсуйте bootstrap:

```bash
# SSH в контейнер або через Cloud Console:
npm run sync:bootstrap

# Або через API (якщо є admin ключ):
curl -X POST https://blackout-calendar-122838488015.us-west1.run.app/api/updates/trigger \
  -H "X-API-Key: your-admin-key"
```

## 🔍 Діагностика проблем

### Якщо після деплою досі тільки 1 черга:

1. **Перевірте версію коду:**
   ```bash
   # Подивіться в логах Cloud Run чи правильний commit задеплоєний
   gcloud run services describe blackout-calendar --region us-west1
   ```

2. **Перевірте чи bootstrap запустився:**
   ```bash
   # В Cloud Run Logs шукайте:
   # "Bootstrap completed: X dates synced"
   ```

3. **Форсуйте повторний bootstrap:**
   ```bash
   # Видаліть базу даних (УВАГА: видалить всі дані!)
   # В Cloud Console або через SSH:
   rm -f data/blackout.db

   # Перезапустіть сервіс
   gcloud run services update blackout-calendar --region us-west1
   ```

4. **Перевірте логи парсера:**
   ```bash
   gcloud run services logs read blackout-calendar \
     --region us-west1 \
     --limit 100 | grep -i "parsed\|queue"
   ```

## 📊 Очікуваний результат

**До виправлення:**
```json
{
  "success": true,
  "date": "2026-01-15",
  "queues": [
    {"queue": "6.2", "intervals": [...]}
  ]
}
```

**Після виправлення:**
```json
{
  "success": true,
  "date": "2026-01-15",
  "queues": [
    {"queue": "1.1", "intervals": [...]},
    {"queue": "1.2", "intervals": [...]},
    {"queue": "2.1", "intervals": [...]},
    {"queue": "2.2", "intervals": [...]},
    {"queue": "3.1", "intervals": [...]},
    {"queue": "3.2", "intervals": [...]},
    {"queue": "4.1", "intervals": [...]},
    {"queue": "4.2", "intervals": [...]},
    {"queue": "5.1", "intervals": [...]},
    {"queue": "5.2", "intervals": [...]},
    {"queue": "6.1", "intervals": [...]},
    {"queue": "6.2", "intervals": [...]}
  ]
}
```

## 🎯 Підтримка

Якщо після деплою проблеми залишаються:

1. Перевірте логи: `gcloud run services logs read blackout-calendar --region us-west1 --limit 200`
2. Перевірте що в базі є дані: Check `/api/schedules/dates`
3. Форсуйте bootstrap: `npm run sync:bootstrap`
4. Перевірте що TELEGRAM_CHANNEL_URL правильно налаштований в змінних оточення Cloud Run

---

**Дата створення:** 2026-01-15
**Автор:** Claude
**Версія:** 1.0
