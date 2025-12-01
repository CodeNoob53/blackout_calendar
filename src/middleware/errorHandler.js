import { ResponseFormatter } from '../utils/responseFormatter.js';
import Logger from '../utils/logger.js';

export function errorHandler(err, req, res, next) {
  // Логуємо помилку через Logger замість console.error
  Logger.error('ErrorHandler', err.message || 'Internal Server Error', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json(
    ResponseFormatter.error(message, statusCode).response
  );
}

export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
