import rateLimit from "express-rate-limit";
import { getLocale, t } from "../i18n/index.js";

const createMessageHandler = (errorKey) => {
  return (req) => ({
    success: false,
    error: t(getLocale(req), errorKey),
  });
};

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: createMessageHandler('errors.tooManyRequests'),
  standardHeaders: true,
  legacyHeaders: false,
});

export const scheduleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: createMessageHandler('errors.tooManyRequests'),
  standardHeaders: true,
  legacyHeaders: false,
});

export const updatesLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: createMessageHandler('errors.tooManyRequestsUpdates'),
  standardHeaders: true,
  legacyHeaders: false,
});
