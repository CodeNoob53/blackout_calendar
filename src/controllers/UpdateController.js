import {
  getNewSchedules,
  getUpdatedSchedules
} from '../db.js';
import { ResponseFormatter } from '../utils/responseFormatter.js';
import { DateValidator } from '../utils/validators.js';

export class UpdateController {
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
