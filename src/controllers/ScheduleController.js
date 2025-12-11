import { ScheduleService } from '../services/ScheduleService.js';
import { ResponseFormatter } from '../utils/responseFormatter.js';

export class ScheduleController {
  static getScheduleByDate(req, res) {
    const { date } = req.params;
    // Валідація виконується в middleware validateDateParam

    const result = ScheduleService.getScheduleByDate(date);

    if (!result) {
      // Замість 404 повертаємо валідну відповідь з інформацією
      return res.json(ResponseFormatter.success({
        date,
        available: false,
        message: req.t('errors.scheduleNotFound', { date }),
        queues: []
      }));
    }

    res.json(ResponseFormatter.success({
      ...result,
      available: true
    }));
  }

  static getScheduleByQueue(req, res) {
    const { queue, date } = req.params;
    // Валідація виконується в middleware validateDateParam та validateQueueParam

    const result = ScheduleService.getScheduleByQueue(queue, date);

    if (!result) {
      // Замість 404 повертаємо валідну відповідь з інформацією
      return res.json(ResponseFormatter.success({
        date,
        queue,
        available: false,
        message: req.t('errors.queueNotFound', { queue }),
        intervals: []
      }));
    }

    res.json(ResponseFormatter.success({
      ...result,
      available: true
    }));
  }

  static getAllDates(req, res) {
    // Пагінація через query параметри: ?limit=10&offset=0
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset, 10) : 0;

    // Валідація параметрів
    if (limit !== undefined && (isNaN(limit) || limit <= 0)) {
      const error = ResponseFormatter.error('Invalid limit parameter', 400);
      return res.status(error.statusCode).json(error.response);
    }

    if (isNaN(offset) || offset < 0) {
      const error = ResponseFormatter.error('Invalid offset parameter', 400);
      return res.status(error.statusCode).json(error.response);
    }

    const options = limit !== undefined ? { limit, offset } : {};
    const result = ScheduleService.getAllDates(options);
    res.json(ResponseFormatter.success(result));
  }

  static getLatestSchedule(req, res) {
    const result = ScheduleService.getLatestSchedule();

    if (!result) {
      const error = ResponseFormatter.notFound(req.t('errors.noSchedulesAvailable'));
      return res.status(error.statusCode).json(error.response);
    }

    res.json(ResponseFormatter.success(result));
  }

  static getMetadata(req, res) {
    const { date } = req.params;
    // Валідація виконується в middleware validateDateParam

    const result = ScheduleService.getMetadata(date);

    if (!result) {
      // Замість 404 повертаємо валідну відповідь з інформацією
      return res.json(ResponseFormatter.success({
        date,
        available: false,
        message: req.t('errors.metadataNotFound', { date }),
        metadata: null
      }));
    }

    res.json(ResponseFormatter.success({
      ...result,
      available: true
    }));
  }

  static getLatestScheduleByQueue(req, res) {
    const { queue } = req.params;
    // Валідація виконується в middleware validateQueueParam

    const result = ScheduleService.getLatestScheduleByQueue(queue);

    if (!result) {
      const error = ResponseFormatter.notFound(req.t('errors.queueNotFound', { queue }));
      return res.status(error.statusCode).json(error.response);
    }

    res.json(ResponseFormatter.success(result));
  }

  static getTodayStatus(req, res) {
    const result = ScheduleService.getTodayStatus();

    // Add translated message
    const message = result.available
      ? req.t('schedule.todayAvailable')
      : req.t('schedule.todayNotAvailable');

    res.json(ResponseFormatter.success({
      ...result,
      message
    }));
  }
}
