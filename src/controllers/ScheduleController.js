import {
  getScheduleByDate,
  getLatestDate,
  getAllDates,
  getScheduleByQueueAndDate,
  getLatestScheduleByQueue,
  getTodayScheduleStatus,
  getScheduleMetadata
} from '../db.js';
import { ResponseFormatter } from '../utils/responseFormatter.js';
import cache from '../utils/cache.js';

export class ScheduleController {
  static getScheduleByDate(req, res) {
    const { date } = req.params;
    // Валідація виконується в middleware validateDateParam

    const schedule = getScheduleByDate(date);

    if (!schedule || schedule.length === 0) {
      const error = ResponseFormatter.notFound(`Графік на ${date} не знайдено`);
      return res.status(error.statusCode).json(error.response);
    }

    const queues = ResponseFormatter.formatScheduleData(schedule);

    res.json(ResponseFormatter.success({ date, queues }));
  }

  static getScheduleByQueue(req, res) {
    const { queue, date } = req.params;
    // Валідація виконується в middleware validateDateParam та validateQueueParam

    const schedule = getScheduleByQueueAndDate(queue, date);

    if (!schedule || schedule.length === 0) {
      const error = ResponseFormatter.notFound(`Графік для черги ${queue} на ${date} не знайдено`);
      return res.status(error.statusCode).json(error.response);
    }

    const intervals = ResponseFormatter.formatQueueSchedule(schedule);

    res.json(ResponseFormatter.success({ queue, date, intervals }));
  }

  static getAllDates(req, res) {
    // Кешуємо список дат на 5 хвилин
    const cacheKey = 'schedules:all-dates';
    let cached = cache.get(cacheKey);
    
    if (!cached) {
      const dates = getAllDates();
      cached = dates.map(d => d.date);
      cache.set(cacheKey, cached, 300); // 5 хвилин
    }
    
    res.json(ResponseFormatter.success({ dates: cached }));
  }

  static getLatestSchedule(req, res) {
    // Кешуємо останній графік на 2 хвилини (оновлюється кожні 5 хв)
    const cacheKey = 'schedules:latest';
    let cached = cache.get(cacheKey);
    
    if (!cached) {
      const latestDate = getLatestDate();

      if (!latestDate) {
        const error = ResponseFormatter.notFound('Немає доступних графіків');
        return res.status(error.statusCode).json(error.response);
      }

      const schedule = getScheduleByDate(latestDate);
      const queues = ResponseFormatter.formatScheduleData(schedule);
      
      cached = { date: latestDate, queues };
      cache.set(cacheKey, cached, 120); // 2 хвилини
    }

    res.json(ResponseFormatter.success(cached));
  }

  static getMetadata(req, res) {
    const { date } = req.params;
    // Валідація виконується в middleware validateDateParam

    const metadata = getScheduleMetadata(date);

    if (!metadata) {
      const error = ResponseFormatter.notFound(`Метадані для ${date} не знайдено`);
      return res.status(error.statusCode).json(error.response);
    }

    res.json(ResponseFormatter.success({
      date,
      metadata: ResponseFormatter.formatMetadata(metadata)
    }));
  }

  static getLatestScheduleByQueue(req, res) {
    const { queue } = req.params;
    // Валідація виконується в middleware validateQueueParam

    const latestDate = getLatestDate();

    if (!latestDate) {
      const error = ResponseFormatter.notFound('Немає доступних графіків');
      return res.status(error.statusCode).json(error.response);
    }

    const schedule = getLatestScheduleByQueue(queue);

    if (!schedule || schedule.length === 0) {
      const error = ResponseFormatter.notFound(`Графік для черги ${queue} не знайдено`);
      return res.status(error.statusCode).json(error.response);
    }

    const intervals = ResponseFormatter.formatQueueSchedule(schedule);

    res.json(ResponseFormatter.success({ queue, date: latestDate, intervals }));
  }

  static getTodayStatus(req, res) {
    // Кешуємо статус на сьогодні на 2 хвилини
    const cacheKey = 'schedules:today-status';
    let cached = cache.get(cacheKey);
    
    if (!cached) {
      const status = getTodayScheduleStatus();
      cached = {
        today: status.date,
        available: status.available,
        message: status.available
          ? 'Графік на сьогодні доступний'
          : 'Графік на сьогодні ще не опублікований'
      };
      cache.set(cacheKey, cached, 120); // 2 хвилини
    }

    res.json(ResponseFormatter.success(cached));
  }
}
