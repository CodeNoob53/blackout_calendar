# Архітектура Проекту

## Огляд
Blackout Calendar API - це backend-сервіс, який автоматично збирає (парсить) дані про графіки відключень електроенергії з **двох джерел**: офіційного Telegram-каналу Запоріжжяобленерго та офіційного сайту zoe.com.ua. Система автоматично обирає найсвіжіші дані та надає їх через зручний REST API.

## Технологічний Стек
- **Runtime**: Node.js v18+
- **Framework**: Express.js v4.19
- **Database**: SQLite (better-sqlite3) з оптимізованими індексами
- **Parser**: Cheerio, Telegraf
- **Task Scheduler**: node-cron
- **API Documentation**: Swagger (swagger-jsdoc v7, swagger-ui-express)
- **Rate Limiting**: express-rate-limit
- **i18n**: Власна реалізація (українська/англійська)
- **Architecture Patterns**:
  - **Repository Pattern**: Абстракція доступу до БД
  - **Service Layer**: Бізнес-логіка та кешування
  - **DTO Pattern**: Валідація структур даних
- **Testing**: Jest з підтримкою ES modules
- **Security**: Custom SSL validation, SQL injection protection

## Структура

### Файлова структура
```
src/
├── config/              # Конфігурація (env vars, swagger, constants)
├── controllers/         # HTTP обробка запитів (Schedule, Address, Update)
├── services/           # Бізнес-логіка + кешування
│   ├── ScheduleService.js
│   └── AddressService.js
├── repositories/       # Абстракція БД
│   ├── ScheduleRepository.js
│   └── AddressRepository.js
├── dto/                # Data Transfer Objects (валідація)
│   ├── BaseDTO.js
│   ├── ScheduleDTO.js   # 8 класів для графіків
│   ├── AddressDTO.js    # 4 класи для адрес
│   ├── ResponseDTO.js   # 5 класів для API відповідей
│   ├── index.js
│   └── README.md
├── middleware/         # Express middleware
├── routes/             # API маршрути
├── scraper/            # Парсери даних
│   ├── telegramScraper.js
│   ├── zoeScraper.js
│   └── parser.js
├── utils/              # Допоміжні функції
│   ├── logger.js
│   ├── cache.js
│   ├── cacheHelper.js
│   ├── responseFormatter.js
│   └── validators.js
├── db.js               # Ініціалізація БД
└── server.js           # Точка входу

tests/
├── dto/                # Тести для DTO (Jest)
├── services/           # Тести для Service Layer
└── repositories/       # Тести для Repository Layer

docs/
├── ARCHITECTURE.md     # Архітектура (цей файл)
├── API.md              # Документація API
└── SETUP.md            # Інструкції з встановлення
```

### Архітектурні шари

```
┌─────────────────────────────────────────────┐
│          HTTP Request (Client)              │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│         Controller Layer                    │
│  • HTTP обробка (req/res)                   │
│  • Валідація параметрів                     │
│  • Формат відповідей                        │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│         Service Layer                       │
│  • Бізнес-логіка                           │
│  • Кешування (TTL)                         │
│  • DTO валідація                           │
│  • Форматування даних                      │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│         Repository Layer                    │
│  • Абстракція БД                           │
│  • SQL запити                              │
│  • CRUD операції                           │
└──────────────────┬──────────────────────────┘
                   ↓
┌─────────────────────────────────────────────┐
│         Database (SQLite)                   │
│  • outages                                 │
│  • schedule_metadata                       │
│  • schedule_history                        │
│  • addresses                               │
└─────────────────────────────────────────────┘
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
- **outages**: Записи про відключення (черга, час, дата) + індекси
- **schedule_metadata**: Метадані графіків (джерело, дата оновлення, ID)
- **schedule_history**: Історія змін графіків
- **addresses**: База адрес для пошуку черг

**Оптимізації БД**:
- 8 індексів для швидких запитів (composite та single-column)
- Prepared statements для безпеки
- Транзакції для атомарності операцій

### 4. Repository Layer (`src/repositories/`)
Абстракція доступу до БД (Repository Pattern):

**ScheduleRepository** (10 методів):
- `findByDate(date)` - отримати графік за датою
- `findByQueueAndDate(queue, date)` - графік для черги
- `findLatestDate()` - найновіша дата (пріоритет: сьогодні)
- `findAllDates(limit, offset)` - список дат з пагінацією
- `countDates()` - кількість дат
- `checkTodayAvailability()` - наявність графіку на сьогодні
- `findMetadataByDate(date)` - метадані графіку
- `findHistoryByDate(date)` - історія змін
- `findNewSchedules(hoursAgo)` - нові графіки
- `findUpdatedSchedules(hoursAgo)` - оновлені графіки

**AddressRepository** (6 методів):
- `findByStreet(street)` - пошук за вулицею (з LIKE escape)
- `findByFullAddress(fullAddress)` - точний пошук
- `findByQueue(queue)` - всі адреси черги
- `findAllStreets()` - унікальні вулиці
- `findAllQueues()` - унікальні черги
- `getStatistics()` - статистика по адресам

### 5. Service Layer (`src/services/`)
Бізнес-логіка + кешування:

**ScheduleService** (9 методів):
- Використовує Repository для БД
- Кешує часто запитувані дані (TTL: 2-10 хв)
- Форматує дані через ResponseFormatter
- Повертає стандартизовані структури

**AddressService** (4 методи):
- Валідує довжину пошукового запиту (мін. 3 символи)
- Обмежує кількість результатів (макс. 100)
- Підтримує пагінацію
- Повертає total + truncated/pagination

**Переваги Service Layer**:
- Чисті контролери (тільки HTTP обробка)
- Централізоване кешування
- Легко тестувати (можна мокати Repository)
- Бізнес-логіка відокремлена від БД

### 6. DTO Layer (`src/dto/`)
Data Transfer Objects для валідації структур даних:

**BaseDTO** - базовий клас:
- Методи валідації (validate, addError, hasErrors)
- Серіалізація (toObject, toJSON)
- Статичні валідатори (isValidDate, isValidQueue, isValidTime)

**ScheduleDTO** - 8 класів:
- OutageIntervalDTO, QueueScheduleDTO
- ScheduleByDateDTO, ScheduleByQueueDTO
- DatesListDTO, TodayStatusDTO
- ScheduleMetadataDTO, UpdatesListDTO

**AddressDTO** - 4 класи:
- AddressDTO, AddressSearchResultDTO
- AddressListDTO, AddressStatisticsDTO

**ResponseDTO** - 5 класів + фабрика:
- SuccessResponseDTO, ErrorResponseDTO
- NotFoundResponseDTO, ValidationErrorResponseDTO
- PaginatedResponseDTO, ResponseDTOFactory

**Переваги DTO**:
- Автоматична валідація
- Стандартизовані структури
- Документація API (самодокументуючий код)
- Типобезпека

### 7. API Layer (Controller + Routes)
RESTful API для клієнтів (мобільні додатки, веб-сайти):

**ScheduleController**:
- getScheduleByDate - графік за датою
- getScheduleByQueue - графік для черги
- getAllDates - список дат (з пагінацією)
- getLatestSchedule - останній графік
- getMetadata - метадані
- getTodayStatus - статус на сьогодні

**AddressController**:
- searchAddresses - пошук адрес (з пагінацією)
- findByExactAddress - точний пошук

**Features**:
- Валідація параметрів (limit, offset, query)
- Підтримка пагінації для великих datasets
- Rate limiting (різні ліміти для різних endpoints)
- Swagger документація

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
