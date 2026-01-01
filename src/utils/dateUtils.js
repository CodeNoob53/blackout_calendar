/**
 * Utilities for Date manipulation in Kyiv timezone (UTC+2)
 * Україна постійно використовує UTC+2 (без переходу на літній час з 2011 року)
 */

/**
 * Повертає поточну дату в київському часі у форматі YYYY-MM-DD
 * @returns {string} Дата у форматі YYYY-MM-DD
 */
export function getKyivDate() {
  return getKyivDateFor(new Date());
}

/**
 * Конвертує Date об'єкт в київську дату у форматі YYYY-MM-DD
 * @param {Date} date - Date об'єкт
 * @returns {string} Дата у форматі YYYY-MM-DD
 */
export function getKyivDateFor(date) {
  // Використовуємо 'en-CA' locale який дає формат YYYY-MM-DD
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
}

/**
 * Повертає компоненти поточного часу в київському часовому поясі
 * @returns {Object} {hours, minutes, seconds}
 */
export function getKyivTimeComponents() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Kyiv',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const [hours, minutes, seconds] = formatter.format(now).split(':').map(Number);
  return { hours, minutes, seconds };
}

/**
 * Додає/віднімає дні від дати у форматі YYYY-MM-DD
 * @param {string} dateStr - Дата у форматі YYYY-MM-DD
 * @param {number} days - Кількість днів (може бути від'ємною)
 * @returns {string} Нова дата у форматі YYYY-MM-DD
 */
export function addDays(dateStr, days) {
  // Парсимо дату як локальну (не UTC) щоб уникнути зсувів
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day); // Місяці з 0
  date.setDate(date.getDate() + days);

  // Форматуємо назад в YYYY-MM-DD
  const newYear = date.getFullYear();
  const newMonth = String(date.getMonth() + 1).padStart(2, '0');
  const newDay = String(date.getDate()).padStart(2, '0');

  return `${newYear}-${newMonth}-${newDay}`;
}
