/**
 * Utilities for Date manipulation in Kyiv timezone
 * Усі функції використовують Europe/Kyiv і не залежать від таймзони сервера
 */

const KYIV_TZ = 'Europe/Kyiv';

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
  // Використовуємо UTC щоб не залежати від таймзони сервера
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);

  const newYear = date.getUTCFullYear();
  const newMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
  const newDay = String(date.getUTCDate()).padStart(2, '0');

  return `${newYear}-${newMonth}-${newDay}`;
}

/**
 * Конвертує дату і час в Київському часовому поясі в UTC Date об'єкт
 * Не залежить від таймзони сервера — використовує Intl для визначення офсету
 *
 * @param {string} dateStr - Дата у форматі YYYY-MM-DD
 * @param {number} hours - Години (0-23)
 * @param {number} minutes - Хвилини (0-59)
 * @returns {Date} UTC Date об'єкт
 */
export function kyivTimeToUTC(dateStr, hours, minutes) {
  // Створюємо приблизну UTC дату для визначення офсету Києва на цей момент
  const [year, month, day] = dateStr.split('-').map(Number);
  const approxUTC = new Date(Date.UTC(year, month - 1, day, hours, minutes));

  // Отримуємо компоненти часу в Києві для цього UTC моменту
  const kyivParts = new Intl.DateTimeFormat('en-US', {
    timeZone: KYIV_TZ,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  }).formatToParts(approxUTC);

  const get = (type) => parseInt(kyivParts.find(p => p.type === type).value, 10);
  const kyivH = get('hour');
  const kyivM = get('minute');

  // Офсет = (Київський час) - (UTC час) в хвилинах
  const kyivTotalMin = kyivH * 60 + kyivM;
  const utcTotalMin = approxUTC.getUTCHours() * 60 + approxUTC.getUTCMinutes();
  let offsetMin = kyivTotalMin - utcTotalMin;

  // Корекція при переході через північ
  if (offsetMin > 720) offsetMin -= 1440;
  if (offsetMin < -720) offsetMin += 1440;

  // Тепер: Київський час (hours:minutes) = UTC + offsetMin
  // Отже: UTC = Київський час - offsetMin
  return new Date(Date.UTC(year, month - 1, day, hours, minutes) - offsetMin * 60000);
}
