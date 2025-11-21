import rateLimit from "express-rate-limit";
import { getLocale, t } from "../i18n/index.js";

/**
 * Створює handler повідомлення з підтримкою i18n
 */
const createMessageHandler = (errorKey) => {
  return (req) => ({
    success: false,
    error: t(getLocale(req), errorKey),
  });
};

/**
 * Загальний rate limiter для всіх API endpoints
 * 100 запитів на 15 хвилин з одного IP
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 хвилин
  max: 100,
  message: createMessageHandler('errors.tooManyRequests'),
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

/**
 * Строгий rate limiter для пошуку адрес
 * 30 запитів на 5 хвилин з одного IP
 * Причина: Пошук по базі даних - ресурсномісткий
 */
export const searchLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 хвилин
  max: 30,
  message: createMessageHandler('errors.tooManyRequestsSearch'),
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * М'який rate limiter для читання графіків
 * 200 запитів на 15 хвилин з одного IP
 * Причина: Читання даних - не дуже ресурсномістке
 */
export const scheduleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 хвилин
  max: 200,
  message: createMessageHandler('errors.tooManyRequests'),
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Середній rate limiter для updates endpoints
 * 60 запитів на 15 хвилин з одного IP
 * Причина: Бот перевіряє кожні 30 хв, але потрібен запас
 */
export const updatesLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 хвилин
  max: 60,
  message: createMessageHandler('errors.tooManyRequestsUpdates'),
  standardHeaders: true,
  legacyHeaders: false,
});
