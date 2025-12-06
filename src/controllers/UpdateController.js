import { ScheduleService } from '../services/ScheduleService.js';
import { ResponseFormatter } from '../utils/responseFormatter.js';

export class UpdateController {
  static getNewSchedules(req, res) {
    // Валідація виконується в middleware validateHoursQuery
    // req.validatedHours містить валідоване значення або 24 за замовчуванням
    const hoursAgo = req.validatedHours;

    const result = ScheduleService.getNewSchedules(hoursAgo);

    // Format schedules with translation
    const formatted = {
      ...result,
      schedules: result.schedules.map(s => ResponseFormatter.formatNewSchedule(s, req.t))
    };

    res.json(ResponseFormatter.success(formatted));
  }

  static getUpdatedSchedules(req, res) {
    // Валідація виконується в middleware validateHoursQuery
    // req.validatedHours містить валідоване значення або 24 за замовчуванням
    const hoursAgo = req.validatedHours;

    const result = ScheduleService.getUpdatedSchedules(hoursAgo);

    const formatted = {
      ...result,
      schedules: result.schedules.map(s => ResponseFormatter.formatUpdatedSchedule(s, req.t))
    };

    res.json(ResponseFormatter.success(formatted));
  }
}
