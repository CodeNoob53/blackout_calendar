# Архітектура Проекту

## Огляд
Blackout Calendar API - це backend-сервіс, який автоматично збирає (парсить) дані про графіки відключень електроенергії з **двох джерел**: офіційного Telegram-каналу Запоріжжяобленерго та офіційного сайту zoe.com.ua. Система автоматично обирає найсвіжіші дані та надає їх через зручний REST API.

## Технологічний Стек
- **Runtime**: Node.js v18+
- **Framework**: Express.js v4
- **Database**: SQLite (better-sqlite3)
- **Parser**: Cheerio, Telegraf
- **Task Scheduler**: node-cron
- **API Documentation**: Swagger (swagger-jsdoc v7, swagger-ui-express)
- **Rate Limiting**: express-rate-limit
- **i18n**: Власна реалізація (українська/англійська)

## Структура
```
src/
├── config/         # Конфігурація (env vars, swagger)
├── controllers/    # Обробники запитів (Schedule, Update)
├── middleware/     # Middleware (Error handling, Rate limiting)
├── routes/         # Маршрути API
├── scraper/        # Логіка парсингу (Telegram + Website)
├── utils/          # Допоміжні функції (Logger, Validators)
├── db.js           # Робота з БД
└── server.js       # Точка входу
```

## Основні компоненти

### 1. Scraper Service (`src/scraper/`)
**Telegram Scraper** (`telegramScraper.js`):
- Отримує HTML сторінки Telegram каналу
- Парсить повідомлення про графіки
- Вилучає інформацію про черги та години

**Zoe Scraper** (`zoeScraper.js`):
- Отримує HTML з офіційного сайту zoe.com.ua
- Парсить графіки за заголовками
- Валідує дати (ігнорує старі графіки)

**Parser** (`parser.js`):
- Універсальний парсер для обох джерел
- Розпізнає дати та черги з тексту
- Витягує інтервали відключень

### 2. Auto Update Service
Фоновий процес (cron), який періодично (кожні 5 хвилин) перевіряє **обидва джерела** на наявність нових даних:
- **Telegram**: Порівнює ID постів
- **Website**: Порівнює timestamp парсингу
- **Логіка оновлення**: 
  - Якщо дані з одного джерела, порівнюються ID
  - Якщо дані з різних джерел, порівнюється час публікації
  - Якщо контент ідентичний, оновлюються тільки метадані

### 3. Database (`data/outages.db`)
Зберігає розпарсені графіки з метаданими про джерело:
- **outages**: Записи про відключення (черга, час, дата)
- **schedule_metadata**: Метадані графіків (джерело, дата оновлення, ID)
- **schedule_history**: Історія змін графіків
- **addresses**: База адрес для пошуку черг

### 4. API Layer
RESTful API для клієнтів (мобільні додатки, веб-сайти). Включає валідацію вхідних даних та документування через Swagger.

## Deployment

### Production Environment
- **Platform**: Render.com
- **URL**: https://blackout-calendar.onrender.com
- **Database**: SQLite (автоматично створюється в `data/blackout.db`)
- **Auto-scaling**: Так (за потреби)
- **Region**: Frankfurt (EU Central)

### Особливості Production
1. **Автоматичне створення директорій**: Директорія `data/` створюється автоматично при ініціалізації БД ([src/db.js](../src/db.js))
2. **Environment Variables**: Налаштовуються через Render Dashboard
3. **Auto-deploy**: Автоматичний deployment при push в `main` branch
4. **Health Checks**: Render автоматично перевіряє статус сервера

### CI/CD
- Використовується yarn.lock для консистентних білдів
- Build Command: `yarn install`
- Start Command: `node src/server.js`
