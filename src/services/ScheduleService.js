/**
 * Schedule Service
 * Бізнес-логіка для роботи з розкладами
 * Використовує Repository для БД + Cache для оптимізації
 */

import { ScheduleRepository } from '../repositories/ScheduleRepository.js';
import { ResponseFormatter } from '../utils/responseFormatter.js';
import cache from '../utils/cache.js';
import { CACHE_TTL } from '../config/constants.js';

export class ScheduleService {
  /**
   * Отримати розклад за датою з кешуванням
   * @param {string} date - Дата у форматі YYYY-MM-DD
   * @returns {Object|null} Форматований розклад або null
   */
  static getScheduleByDate(date) {
    const schedule = ScheduleRepository.findByDate(date);

    if (!schedule || schedule.length === 0) {
      return null;
    }

    return {
      date,
      queues: ResponseFormatter.formatScheduleData(schedule)
    };
  }

  /**
   * Отримати розклад за чергою та датою
   * @param {string} queue - Номер черги
   * @param {string} date - Дата
   * @returns {Object|null} Форматований розклад для черги або null
   */
  static getScheduleByQueue(queue, date) {
    const schedule = ScheduleRepository.findByQueueAndDate(queue, date);

    if (!schedule || schedule.length === 0) {
      return null;
    }

    return {
      queue,
      date,
      intervals: ResponseFormatter.formatQueueSchedule(schedule)
    };
  }

  /**
   * Отримати останній доступний розклад (з кешуванням)
   * @returns {Object|null} Останній розклад або null
   */
  static getLatestSchedule() {
    const cacheKey = 'schedules:latest';
    let cached = cache.get(cacheKey);

    if (!cached) {
      const latestDate = ScheduleRepository.findLatestDate();

      if (!latestDate) {
        return null;
      }

      const schedule = ScheduleRepository.findByDate(latestDate);
      const queues = ResponseFormatter.formatScheduleData(schedule);

      cached = { date: latestDate, queues };
      cache.set(cacheKey, cached, CACHE_TTL.LATEST_SCHEDULE);
    }

    return cached;
  }

  /**
   * Отримати всі доступні дати (з кешуванням)
   * @param {Object} options - Опції {limit, offset}
   * @returns {Object} {dates, pagination}
   */
  static getAllDates(options = {}) {
    const { limit, offset } = options;

    // Якщо без пагінації - кешуємо
    if (!limit) {
      const cacheKey = 'schedules:all-dates';
      let cached = cache.get(cacheKey);

      if (!cached) {
        const dates = ScheduleRepository.findAllDates();
        cached = dates.map(d => d.date);
        cache.set(cacheKey, cached, CACHE_TTL.ALL_DATES);
      }

      return { dates: cached };
    }

    // З пагінацією - не кешуємо
    const dates = ScheduleRepository.findAllDates(limit, offset);
    const total = ScheduleRepository.countDates();

    return {
      dates: dates.map(d => d.date),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    };
  }

  /**
   * Перевірити наявність розкладу на сьогодні (з кешуванням)
   * @returns {Object} Статус доступності
   */
  static getTodayStatus() {
    const cacheKey = 'schedules:today-status';
    let cached = cache.get(cacheKey);

    if (!cached) {
      const status = ScheduleRepository.checkTodayAvailability();
      cached = {
        today: status.date,
        available: status.available
      };
      cache.set(cacheKey, cached, CACHE_TTL.TODAY_STATUS);
    }

    return cached;
  }

  /**
   * Отримати метадані для дати
   * @param {string} date - Дата
   * @returns {Object|null} Форматовані метадані або null
   */
  static getMetadata(date) {
    const metadata = ScheduleRepository.findMetadataByDate(date);

    if (!metadata) {
      return null;
    }

    return {
      date,
      metadata: ResponseFormatter.formatMetadata(metadata)
    };
  }

  /**
   * Отримати останній розклад для черги
   * @param {string} queue - Номер черги
   * @returns {Object|null} Розклад для черги або null
   */
  static getLatestScheduleByQueue(queue) {
    const latestDate = ScheduleRepository.findLatestDate();

    if (!latestDate) {
      return null;
    }

    const schedule = ScheduleRepository.findByQueueAndDate(queue, latestDate);

    if (!schedule || schedule.length === 0) {
      return null;
    }

    return {
      queue,
      date: latestDate,
      intervals: ResponseFormatter.formatQueueSchedule(schedule)
    };
  }

  /**
   * Отримати нові розклади
   * @param {number} hoursAgo - Кількість годин назад
   * @returns {Object} Список нових розкладів
   */
  static getNewSchedules(hoursAgo = 24) {
    const schedules = ScheduleRepository.findNewSchedules(hoursAgo);

    return {
      hours: hoursAgo,
      count: schedules.length,
      schedules: schedules
    };
  }

  /**
   * Отримати оновлені розклади
   * @param {number} hoursAgo - Кількість годин назад
   * @returns {Object} Список оновлених розкладів
   */
  static getUpdatedSchedules(hoursAgo = 24) {
    const schedules = ScheduleRepository.findUpdatedSchedules(hoursAgo);

    return {
      hours: hoursAgo,
      count: schedules.length,
      schedules: schedules
    };
  }
}
