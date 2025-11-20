# Архітектура Проекту

## Огляд
Blackout Calendar API - це backend-сервіс, який автоматично збирає (парсить) дані про графіки відключень електроенергії з офіційного Telegram-каналу Запоріжжяобленерго та надає їх через зручний REST API.

## Технологічний Стек
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: SQLite (better-sqlite3)
- **Parser**: Cheerio
- **Task Scheduler**: node-cron

## Структура
```
src/
├── config/         # Конфігурація (env vars, swagger)
├── controllers/    # Обробники запитів (Schedule, Update)
├── middleware/     # Middleware (Error handling, Rate limiting)
├── routes/         # Маршрути API
├── scraper/        # Логіка парсингу Telegram
├── utils/          # Допоміжні функції (Logger, Validators)
├── db.js           # Робота з БД
└── server.js       # Точка входу
```

## Основні компоненти

### 1. Scraper Service (`src/scraper/`)
Відповідає за отримання HTML сторінки Telegram каналу, парсинг повідомлень та вилучення інформації про графіки (черги, години).

### 2. Auto Update Service
Фоновий процес (cron), який періодично перевіряє канал на наявність нових повідомлень. Якщо знайдено новіший графік (порівнюється ID посту), база даних оновлюється.

### 3. Database (`data/outages.db`)
Зберігає розпарсені графіки. Основна сутність - запис про відключення для конкретної черги на конкретний проміжок часу.

### 4. API Layer
RESTful API для клієнтів (мобільні додатки, веб-сайти). Включає валідацію вхідних даних та документування через Swagger.
