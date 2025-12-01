import {
  getNewSchedules,
  getUpdatedSchedules
} from '../db.js';
import { ResponseFormatter } from '../utils/responseFormatter.js';

export class UpdateController {
  static getNewSchedules(req, res) {
    // Валідація виконується в middleware validateHoursQuery
    // req.validatedHours містить валідоване значення або 24 за замовчуванням
    const hoursAgo = req.validatedHours;

    const newSchedules = getNewSchedules(hoursAgo);

    res.json(ResponseFormatter.success({
      hours: hoursAgo,
      count: newSchedules.length,
      schedules: newSchedules.map(s => ResponseFormatter.formatNewSchedule(s))
    }));
  }

  static getUpdatedSchedules(req, res) {
    // Валідація виконується в middleware validateHoursQuery
    // req.validatedHours містить валідоване значення або 24 за замовчуванням
    const hoursAgo = req.validatedHours;

    const updatedSchedules = getUpdatedSchedules(hoursAgo);

    res.json(ResponseFormatter.success({
      hours: hoursAgo,
      count: updatedSchedules.length,
      schedules: updatedSchedules.map(s => ResponseFormatter.formatUpdatedSchedule(s))
    }));
  }
}
