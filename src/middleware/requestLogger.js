import Logger from '../utils/logger.js';

/**
 * Middleware для логування HTTP запитів
 */
export function requestLogger(req, res, next) {
  const startTime = Date.now();

  // Логуємо вхідний запит
  const method = req.method;
  const url = req.originalUrl || req.url;
  const ip = req.ip || req.connection.remoteAddress;

  // Після завершення відповіді логуємо результат
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    
    // Визначаємо рівень логування на основі статус коду
    const logLevel = statusCode >= 500 ? 'error' : 
                     statusCode >= 400 ? 'warning' : 
                     'info';
    
    const message = `${method} ${url} ${statusCode} - ${duration}ms - ${ip}`;
    
    Logger[logLevel]('HTTP', message);
  });

  next();
}


