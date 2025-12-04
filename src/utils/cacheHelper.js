import cache from './cache.js';
import Logger from './logger.js';

/**
 * Централізована інвалідація кешу розкладів
 * Використовується після оновлення даних з будь-якого джерела
 *
 * Запобігає race conditions та дублюванню коду
 */
export function invalidateScheduleCaches() {
  const deletedCount = cache.deletePattern('schedules:*');

  if (deletedCount > 0) {
    Logger.debug('Cache', `Invalidated ${deletedCount} schedule cache entries`);
  }
}

/**
 * Інвалідувати кеш для конкретної дати
 * @param {string} date - Дата у форматі YYYY-MM-DD
 */
export function invalidateScheduleByDate(date) {
  cache.delete(`schedule:${date}`);
  cache.delete(`schedules:${date}:*`);

  // Також інвалідуємо загальні кеші, бо вони можуть містити цю дату
  cache.delete('schedules:all-dates');
  cache.delete('schedules:latest');
  cache.delete('schedules:today-status');

  Logger.debug('Cache', `Invalidated cache for date ${date}`);
}

/**
 * Інвалідувати всі кеші пов'язані з розкладами
 * Використовується при масових оновленнях
 */
export function invalidateAllScheduleCaches() {
  cache.clear();
  Logger.debug('Cache', 'Cleared all cache');
}
