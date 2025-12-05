# Деплой на Render.com

Інструкція для розгортання Blackout Calendar API на Render.com.

## Налаштування на Render.com

### 1. Створення Web Service

1. Перейдіть на [Render.com](https://render.com) та увійдіть в аккаунт
2. Натисніть **New** → **Web Service**
3. Підключіть GitHub репозиторій

### 2. Налаштування Build & Deploy

Встановіть наступні параметри:

#### **Build Command:**
```bash
npm install && npm run build
```

#### **Start Command:**
```bash
npm start
```

#### **Environment:**
- Runtime: `Node`
- Node Version: `18.x` або новіша

### 3. Environment Variables

Додайте наступні змінні оточення:

| Змінна | Значення | Опис |
|--------|----------|------|
| `NODE_ENV` | `production` | Режим роботи |
| `PORT` | `3000` | Порт сервера (Render автоматично встановить) |
| `TELEGRAM_BOT_TOKEN` | `ваш_токен` | Токен Telegram бота |
| `TELEGRAM_CHANNEL_ID` | `@your_channel` | ID Telegram каналу |
| `USE_SYNC_ENGINE` | `true` | Використовувати SyncEngine |
| `AUTO_UPDATE_ENABLED` | `true` | Автоматичні оновлення |
| `AUTO_UPDATE_CRON` | `*/5 * * * *` | Розклад оновлень (кожні 5 хвилин) |
| `ZOE_SKIP_SSL_VERIFY` | `false` | SSL верифікація для zoe.com.ua |

### 4. Що відбувається при деплої

1. **Install:** `npm install` - встановлення залежностей
2. **Build:** `npm run build` - запускає `scripts/init-db.js`:
   - Створює структуру БД (таблиці)
   - Перевіряє чи БД порожня
   - Якщо порожня → запускає **bootstrap** для заповнення даними
   - Якщо вже є дані → пропускає bootstrap
3. **Start:** `npm start` - запускає сервер
4. **Auto-sync:** Сервер автоматично запускає sync кожні 5 хвилин

## Перший деплой

При першому деплої:

```
[Build] Installing dependencies...
[Build] Running build script...
[InitDB] === Initializing production database ===
[InitDB] ✓ Database schema initialized
[InitDB] Database is empty, running bootstrap...
[SyncEngine] === BOOTSTRAP: Starting initial sync ===
[SyncEngine] Fetching Telegram updates...
[SyncEngine] Fetching Zoe updates...
[SyncEngine] ✓ Synced 2025-12-04: 3 updates, final=zoe
[SyncEngine] ✓ Synced 2025-12-05: 1 updates, final=telegram
[InitDB] ✓ Bootstrap completed successfully
[InitDB] === Production database ready ===

[Deploy] Starting server...
[Server] 🚀 Blackout Calendar API v2.0.0
[Server] Running at https://your-app.onrender.com
```

## Наступні деплої

При наступних деплоях:

```
[Build] Installing dependencies...
[Build] Running build script...
[InitDB] === Initializing production database ===
[InitDB] ✓ Database schema initialized
[InitDB] Database already has 2 schedules, skipping bootstrap
[InitDB] === Production database ready ===

[Deploy] Starting server...
```

## Моніторинг

### Перевірка стану API:

```bash
curl https://your-app.onrender.com/api/schedules/today
```

### Перевірка останніх оновлень:

```bash
curl https://your-app.onrender.com/api/updates/changed
```

## Troubleshooting

### Проблема: БД не ініціалізується

**Рішення:** Перевірте логи білда в Render Dashboard → Logs

### Проблема: Bootstrap завершується з помилкою

**Рішення:**
1. Перевірте що `TELEGRAM_BOT_TOKEN` правильний
2. Перевірте що бот має доступ до каналу
3. Перевірте логи: `Environment` → `Logs`

### Проблема: Старі дані після редеплою

**Рішення:** Render зберігає БД між деплоями. Якщо потрібно очистити:
1. Shell → `rm data/blackout.db`
2. Редеплой (Build & Deploy → Manual Deploy → Deploy)

## Оптимізація

### Persistent Disk

Для збереження БД між деплоями:

1. Dashboard → Settings → Disks
2. Add Disk:
   - Name: `blackout-db`
   - Mount Path: `/opt/render/project/src/data`
   - Size: `1 GB`

### Health Checks

1. Dashboard → Settings → Health Check Path
2. Path: `/api/schedules/today`

## Автоматичні оновлення

Сервер автоматично:
- Кожні 5 хвилин запускає `orchestrator` (останні 7 днів)
- Оновлює тільки змінені графіки
- Інвалідує кеш при змінах

## Додаткові команди

Запуск вручну через Render Shell:

```bash
# Bootstrap (повна синхронізація)
npm run sync:bootstrap

# Orchestrator (останні 7 днів)
npm run sync:orchestrator

# Синхронізація конкретної дати
npm run sync:date 2025-12-04
```

## Корисні посилання

- [Render Documentation](https://render.com/docs)
- [Node.js на Render](https://render.com/docs/deploy-node-express-app)
- [Environment Variables](https://render.com/docs/environment-variables)
