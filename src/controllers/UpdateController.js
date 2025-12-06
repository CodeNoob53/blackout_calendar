import { ScheduleService } from '../services/ScheduleService.js';
import { ResponseFormatter } from '../utils/responseFormatter.js';

export class UpdateController {
  static getNewSchedules(req, res) {
    // Валідація виконується в middleware validateHoursQuery
    // req.validatedHours містить валідоване значення або 24 за замовчуванням
    const hoursAgo = req.validatedHours;

    const result = ScheduleService.getNewSchedules(hoursAgo);

    res.json(ResponseFormatter.success(result));
  }

  static getUpdatedSchedules(req, res) {
    // Валідація виконується в middleware validateHoursQuery
    // req.validatedHours містить валідоване значення або 24 за замовчуванням
    const hoursAgo = req.validatedHours;

    const result = ScheduleService.getUpdatedSchedules(hoursAgo);

    res.json(ResponseFormatter.success(result));
  }
}
