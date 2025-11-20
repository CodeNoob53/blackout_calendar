import { updateFromTelegram } from '../scraper/telegramScraper.js';
import {
  getRecentUpdates,
  getNewSchedules,
  getUpdatedSchedules
} from '../db.js';
import { ResponseFormatter } from '../utils/responseFormatter.js';
import { DateValidator } from '../utils/validators.js';

export class UpdateController {
  static async triggerUpdate(req, res) {
    console.log('[API] Starting Telegram update...');
    const result = await updateFromTelegram();

    res.json(ResponseFormatter.success({
      message: 'Дані успішно оновлено з Telegram',
      stats: result
    }));
  }

  static getRecentUpdates(req, res) {
    const limit = parseInt(req.query.limit) || 10;

    if (!DateValidator.validateLimit(limit)) {
      const error = ResponseFormatter.error('Limit must be between 1 and 100', 400);
      return res.status(error.statusCode).json(error.response);
    }

    const updates = getRecentUpdates(limit);

    res.json(ResponseFormatter.success({
      updates: updates.map(u => ResponseFormatter.formatUpdate(u))
    }));
  }

  static getNewSchedules(req, res) {
    const hoursAgo = parseInt(req.query.hours) || 24;

    if (!DateValidator.validateHours(hoursAgo)) {
      const error = ResponseFormatter.error('Hours must be between 1 and 720', 400);
      return res.status(error.statusCode).json(error.response);
    }

    const newSchedules = getNewSchedules(hoursAgo);

    res.json(ResponseFormatter.success({
      count: newSchedules.length,
      schedules: newSchedules.map(s => ResponseFormatter.formatNewSchedule(s))
    }));
  }

  static getUpdatedSchedules(req, res) {
    const hoursAgo = parseInt(req.query.hours) || 24;

    if (!DateValidator.validateHours(hoursAgo)) {
      const error = ResponseFormatter.error('Hours must be between 1 and 720', 400);
      return res.status(error.statusCode).json(error.response);
    }

    const updatedSchedules = getUpdatedSchedules(hoursAgo);

    res.json(ResponseFormatter.success({
      count: updatedSchedules.length,
      schedules: updatedSchedules.map(s => ResponseFormatter.formatUpdatedSchedule(s))
    }));
  }
}
