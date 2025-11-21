import uk from './locales/uk.js';
import en from './locales/en.js';

const locales = { uk, en };
const defaultLocale = 'uk';

/**
 * Отримати мову з заголовка Accept-Language або query параметра
 * @param {Object} req - Express request object
 * @returns {string} - Код мови (uk або en)
 */
export function getLocale(req) {
  // 1. Перевіряємо query параметр ?lang=en
  if (req.query.lang && locales[req.query.lang]) {
    return req.query.lang;
  }

  // 2. Перевіряємо заголовок Accept-Language
  const acceptLanguage = req.headers['accept-language'];
  if (acceptLanguage) {
    // Парсимо заголовок: "en-US,en;q=0.9,uk;q=0.8"
    const languages = acceptLanguage
      .split(',')
      .map(lang => {
        const parts = lang.trim().split(';');
        const code = parts[0].split('-')[0]; // en-US -> en
        const quality = parts[1] ? parseFloat(parts[1].split('=')[1]) : 1.0;
        return { code, quality };
      })
      .sort((a, b) => b.quality - a.quality);

    // Шукаємо першу підтримувану мову
    for (const lang of languages) {
      if (locales[lang.code]) {
        return lang.code;
      }
    }
  }

  // 3. Повертаємо мову за замовчуванням
  return defaultLocale;
}

/**
 * Отримати переклад за ключем
 * @param {string} locale - Код мови
 * @param {string} key - Ключ перекладу (наприклад: 'errors.invalidDateFormat')
 * @param {Object} params - Параметри для підстановки (наприклад: {date: '2025-11-21'})
 * @returns {string} - Переклад
 */
export function t(locale, key, params = {}) {
  const translation = locales[locale] || locales[defaultLocale];

  // Розбиваємо ключ на частини: 'errors.invalidDateFormat' -> ['errors', 'invalidDateFormat']
  const keys = key.split('.');
  let result = translation;

  for (const k of keys) {
    if (result && typeof result === 'object') {
      result = result[k];
    } else {
      return key; // Якщо ключ не знайдено, повертаємо сам ключ
    }
  }

  // Підставляємо параметри: "Schedule for {{date}}" + {date: '2025-11-21'} -> "Schedule for 2025-11-21"
  if (typeof result === 'string' && params) {
    return result.replace(/\{\{(\w+)\}\}/g, (match, paramKey) => {
      return params[paramKey] !== undefined ? params[paramKey] : match;
    });
  }

  return result || key;
}

/**
 * Middleware для додавання функцій i18n до req об'єкту
 */
export function i18nMiddleware(req, res, next) {
  const locale = getLocale(req);

  req.locale = locale;
  req.t = (key, params) => t(locale, key, params);

  next();
}

/**
 * Отримати всі локалі
 */
export function getAvailableLocales() {
  return Object.keys(locales);
}

/**
 * Експорт локалей для прямого доступу
 */
export { uk, en };
