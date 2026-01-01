import { DateValidator } from '../utils/validators.js';
import { ResponseFormatter } from '../utils/responseFormatter.js';

/**
 * Middleware для валідації параметра date у шляху
 */
export function validateDateParam(req, res, next) {
  const { date } = req.params;

  if (!DateValidator.isValidDateFormat(date)) {
    const error = ResponseFormatter.error('Invalid date format. Use YYYY-MM-DD', 400);
    return res.status(error.statusCode).json(error.response);
  }

  next();
}

/**
 * Middleware для валідації параметра queue у шляху
 */
export function validateQueueParam(req, res, next) {
  const { queue } = req.params;

  if (!DateValidator.isValidQueue(queue)) {
    const error = ResponseFormatter.error('Invalid queue format. Use X.X', 400);
    return res.status(error.statusCode).json(error.response);
  }

  next();
}

/**
 * Middleware для валідації query параметра hours
 * Встановлює req.validatedHours з валідованим значенням або значенням за замовчуванням
 */
export function validateHoursQuery(req, res, next) {
  const hoursParam = req.query.hours;
  let hoursAgo = 24;

  if (hoursParam !== undefined) {
    // Використовуємо Number() замість parseInt для коректної обробки некоректних значень
    const parsed = Number(hoursParam);
    if (isNaN(parsed) || !DateValidator.validateHours(parsed)) {
      const error = ResponseFormatter.error('Hours must be between 1 and 720', 400);
      return res.status(error.statusCode).json(error.response);
    }
    hoursAgo = parsed;
  }

  // Зберігаємо валідоване значення в req для використання в контролері
  req.validatedHours = hoursAgo;
  next();
}


