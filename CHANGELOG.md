# Changelog

Всі значні зміни в проєкті документуються в цьому файлі.

Формат базується на [Keep a Changelog](https://keepachangelog.com/uk/1.0.0/),
та проєкт дотримується [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.1] - 2025-11-23

### Fixed
- Виправлено проблему з ініціалізацією бази даних на Render.com
  - Директорія `data/` тепер створюється автоматично в `src/db.js` перед створенням Database
  - Видалено дублікат створення директорії з `src/server.js`

### Changed
- Оновлено `swagger-jsdoc` з `6.2.8` до `7.0.0-rc.6`
  - Усунуто warning'и про застарілі залежності (glob, z-schema, lodash.*)
  - Виправлено memory leak з пакетом `inflight`

### Added
- Додано production deployment на Render.com
  - Live API: https://blackout-calendar.onrender.com
  - Swagger Docs: https://blackout-calendar.onrender.com/api-docs
- Додано секцію "Deployment" в документацію ([docs/SETUP.md](docs/SETUP.md))
- Додано інформацію про production environment в [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Оновлено приклади в [docs/API.md](docs/API.md) для використання production URL

### Documentation
- Оновлено [README.md](README.md) з посиланнями на live API
- Оновлено всі приклади використання API з localhost на production URL
- Додано примітки про використання для локальної розробки

## [2.0.0] - 2025-11-22

### Added
- Повна переробка архітектури з класовим підходом
- Додано валідацію параметрів запитів
- Додано rate limiting для захисту API
- Додано підтримку інтернаціоналізації (українська/англійська)
- Додано пошук адрес по вулицях та чергах
- Додано відстеження нових та змінених графіків
- Додано Swagger документацію
- Додано метадані графіків (час оновлення, кількість змін)

### Changed
- Оновлено структуру URL (більш RESTful)
- Покращено обробку помилок
- Покращено форматування відповідей
- Оновлено логування з кольоровим виводом

### Deprecated
- Старі ендпоінти (з redirect'ами для зворотної сумісності):
  - `/api/schedule/:date` → `/api/schedules/:date`
  - `/api/schedule/queue/:queue/:date` → `/api/schedules/:date/queues/:queue`
  - `/api/latest` → `/api/schedules/latest`
  - `/api/dates` → `/api/schedules/dates`

---

## Типи змін
- **Added** - нові функції
- **Changed** - зміни в існуючому функціоналі
- **Deprecated** - функції, які будуть видалені
- **Removed** - видалені функції
- **Fixed** - виправлення помилок
- **Security** - виправлення вразливостей
