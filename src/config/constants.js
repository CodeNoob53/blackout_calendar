/**
 * Константи для використання по всьому проекту
 * Централізоване управління magic numbers
 */

// ========== Кеш TTL (Time To Live) в секундах ==========
export const CACHE_TTL = {
  LATEST_SCHEDULE: 120,        // 2 хвилини - часто змінюється
  ALL_DATES: 300,              // 5 хвилин - змінюється рідше
  TODAY_STATUS: 120,           // 2 хвилини - важливо бути актуальним
  SCHEDULE_BY_DATE: 600        // 10 хвилин - не змінюється часто
};

// ========== Валідація ==========
export const VALIDATION = {
  // Розклади
  MAX_SCHEDULE_AGE_DAYS: 7,          // Максимальний вік графіка (дні)
  MAX_INTERVALS_PER_SCHEDULE: 50,    // Максимальна кількість інтервалів

  // Пошук адрес
  MIN_SEARCH_QUERY_LENGTH: 3,        // Мінімальна довжина пошукового запиту
  MAX_SEARCH_RESULTS: 100,           // Максимум результатів пошуку

  // Пагінація
  DEFAULT_PAGE_SIZE: 50,             // Розмір сторінки за замовчуванням
  MAX_PAGE_SIZE: 100,                // Максимальний розмір сторінки
  MIN_PAGE_SIZE: 1,                  // Мінімальний розмір сторінки

  // Часові рамки
  MIN_HOURS_LOOKBACK: 1,             // Мінімум годин назад для пошуку оновлень
  MAX_HOURS_LOOKBACK: 720,           // Максимум годин назад (30 днів)
  DEFAULT_HOURS_LOOKBACK: 24         // За замовчуванням 24 години
};

// ========== Timeouts ==========
export const TIMEOUTS = {
  HTTP_REQUEST: 30000,               // 30 секунд для HTTP запитів
  GRACEFUL_SHUTDOWN: 30000,          // 30 секунд для graceful shutdown
  ZOE_SCRAPER_TIMEOUT: 30000         // 30 секунд для Zoe scraper
};

// ========== Rate Limits ==========
export const RATE_LIMITS = {
  WINDOW_MS: 15 * 60 * 1000,         // 15 хвилин

  GENERAL: 300,                      // 300 запитів за вікно
  SCHEDULE: 200,                     // 200 запитів для розкладів
  UPDATES: 60,                       // 60 запитів для оновлень
  SEARCH: 30,                        // 30 запитів для пошуку (найстрогіший)

  // Для окремих endpoint
  SEARCH_WINDOW_MS: 5 * 60 * 1000   // 5 хвилин для пошуку
};

// ========== Scraper ==========
export const SCRAPER = {
  MIN_HTML_LENGTH: 100,              // Мінімальна довжина валідної HTML відповіді
  MAX_REDIRECTS: 5,                  // Максимум редиректів

  // Zoe scraper
  ZOE_MIN_SCHEDULE_LENGTH: 50,      // Мінімальна довжина тексту графіка

  // Known Certificate Issuers (для SSL validation)
  KNOWN_CA_ISSUERS: [
    'Let\'s Encrypt',
    'DigiCert',
    'GlobalSign',
    'Cloudflare',
    'Google Trust Services',
    'Amazon',
    'Sectigo'
  ]
};

// ========== Database ==========
export const DATABASE = {
  DEFAULT_LIMIT: 10,                 // Limit за замовчуванням для запитів
  MAX_LIMIT: 100                     // Максимальний limit
};

// ========== Server ==========
export const SERVER = {
  DEFAULT_PORT: 3000,
  SHUTDOWN_TIMEOUT: 30000            // 30 секунд для graceful shutdown
};
