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
    const dates = getAllDates();
    res.json(ResponseFormatter.success({ dates: dates.map(d => d.date) }));
  }

  static getLatestSchedule(req, res) {
    const latestDate = getLatestDate();

    if (!latestDate) {
      const error = ResponseFormatter.notFound('Немає доступних графіків');
      return res.status(error.statusCode).json(error.response);
    }

    const schedule = getScheduleByDate(latestDate);
    const queues = ResponseFormatter.formatScheduleData(schedule);

    res.json(ResponseFormatter.success({ date: latestDate, queues }));
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
    const status = getTodayScheduleStatus();

    res.json(ResponseFormatter.success({
      today: status.date,
      available: status.available,
      message: status.available
        ? 'Графік на сьогодні доступний'
        : 'Графік на сьогодні ще не опублікований'
    }));
  }
}
