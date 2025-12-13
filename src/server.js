import express from "express";
import cors from "cors";
import nodeCron from "node-cron";
import { fileURLToPath } from "url";
import { dirname } from "path";
import config from "./config/index.js";
import { initDatabase, db } from "./db.js";
import { orchestrator, bootstrap } from "./services/SyncEngine.js";
import scheduleRoutes from "./routes/scheduleRoutes.js";
import updateRoutes from "./routes/updateRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import emergencyRoutes from "./routes/emergencyRoutes.js";
import { NotificationService } from "./services/NotificationService.js";
import { initScheduleNotificationService } from "./services/ScheduleNotificationService.js";
import EmergencyBlackoutService from "./services/EmergencyBlackoutService.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import Logger from "./utils/logger.js";
import cache from "./utils/cache.js";
import swaggerUi from "swagger-ui-express";
import { specs } from "./config/swagger.js";
import { generalLimiter, scheduleLimiter, updatesLimiter } from "./middleware/rateLimiter.js";
import { i18nMiddleware, getAvailableLocales } from "./i18n/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ініціалізуємо базу даних
initDatabase();

// Ініціалізуємо таблицю для аварійних відключень
EmergencyBlackoutService.initEmergencyBlackoutsTable();

// Ініціалізуємо сервіс повідомлень
NotificationService.init();

// Ініціалізуємо сервіс автоматичних сповіщень про відключення/включення
initScheduleNotificationService();

const app = express();
const PORT = config.server.port;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Request logging middleware - має бути перед роутами, але після CORS
app.use(requestLogger);

// i18n middleware - має бути перед всіма роутами
app.use(i18nMiddleware);

// Rate limiting - загальний для всього API
app.use("/api/", generalLimiter);

// Swagger UI
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

// Головна сторінка з документацією API
app.get("/", (req, res) => {
  res.json({
    status: req.t('api.statusOk'),
    message: req.t('api.message'),
    version: req.t('api.version'),
    language: req.locale,
    availableLanguages: getAvailableLocales(),
    endpoints: {
      schedules: {
        "GET /api/schedules/latest": req.t('api.endpoints.schedules.latest'),
        "GET /api/schedules/today/status": req.t('api.endpoints.schedules.todayStatus'),
        "GET /api/schedules/dates": req.t('api.endpoints.schedules.dates'),
        "GET /api/schedules/queues/:queue/latest": req.t('api.endpoints.schedules.queueLatest'),
        "GET /api/schedules/:date": req.t('api.endpoints.schedules.byDate'),
        "GET /api/schedules/:date/metadata": req.t('api.endpoints.schedules.metadata'),
        "GET /api/schedules/:date/queues/:queue": req.t('api.endpoints.schedules.byQueueAndDate')
      },
      updates: {
        "GET /api/updates/new": req.t('api.endpoints.updates.new'),
        "GET /api/updates/changed": req.t('api.endpoints.updates.changed')
      }
    },
    rateLimits: {
      "/api/schedules": req.t('api.rateLimits.schedules'),
      "/api/updates": req.t('api.rateLimits.updates'),
      "general": req.t('api.rateLimits.general')
    },
    changes: {
      v2: req.t('api.changes.v2')
    }
  });
});

// API Routes з специфічними rate limiters
app.use("/api/schedules", scheduleLimiter, scheduleRoutes);
app.use("/api/updates", updatesLimiter, updateRoutes);
app.use("/api/notifications", generalLimiter, notificationRoutes);
app.use("/api/emergency", generalLimiter, emergencyRoutes);

// Backwards compatibility routes (deprecated)
app.get("/api/schedule/:date", (req, res) => {
  res.redirect(301, `/api/schedules/${req.params.date}`);
});

app.get("/api/schedule/queue/:queue/:date", (req, res) => {
  res.redirect(301, `/api/schedules/${req.params.date}/queues/${req.params.queue}`);
});

app.get("/api/latest", (req, res) => {
  res.redirect(301, "/api/schedules/latest");
});

app.get("/api/dates", (req, res) => {
  res.redirect(301, "/api/schedules/dates");
});

app.post("/api/update", (_req, res) => {
  res.redirect(307, "/api/updates/trigger");
});

// DEBUG ENDPOINT
app.get("/api/debug/history", (req, res) => {
  const history = db.prepare("SELECT * FROM schedule_history ORDER BY detected_at DESC").all();
  res.json({ count: history.length, rows: history });
});

// Health check endpoint
app.get("/health", (req, res) => {
  const cacheStats = cache.getStats();
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.server.env,
    cache: {
      size: cacheStats.size,
      keys: cacheStats.keys
    }
  });
});

// Error handling middleware (має бути останнім)
app.use(errorHandler);

// Автоматичне оновлення
class AutoUpdateService {
  constructor() {
    this.enabled = config.autoUpdate.enabled;
    this.interval = config.autoUpdate.interval;
  }

  async performUpdate(source = "scheduled") {
    Logger.cron(`Starting ${source} update...`);
    try {
      // Перевіряємо чи база порожня (перший запуск)
      const count = db.prepare('SELECT COUNT(*) as count FROM schedule_metadata').get();
      const isEmpty = count.count === 0;

      let result;
      if (isEmpty && source === "initial") {
        // При першому запуску робимо повний bootstrap
        Logger.info('Scheduler', 'Database is empty, running bootstrap (full sync)');
        result = await bootstrap();
        Logger.success('Scheduler', `Bootstrap completed: ${result.synced} dates synced`);
      } else {
        // При звичайних оновленнях використовуємо orchestrator (останні 7 днів)
        Logger.info('Scheduler', 'Using SyncEngine orchestrator (last 7 days)');
        result = await orchestrator();
        Logger.info('Scheduler', `Synced ${result.synced} dates, skipped ${result.skipped}`);
      }

      // Сканємо аварійні відключення
      try {
        const emergencies = await EmergencyBlackoutService.scanForEmergencyBlackouts();
        if (emergencies > 0) {
          Logger.info('Scheduler', `Found ${emergencies} new emergency blackout(s)`);
        }
      } catch (emergencyError) {
        Logger.error('Scheduler', 'Emergency scan failed (non-critical)', emergencyError);
      }

      return result;
    } catch (error) {
      Logger.error('Scheduler', `${source} update failed`, error);
      throw error;
    }
  }

  start() {
    if (!this.enabled) {
      Logger.warning('Scheduler', 'Auto-update disabled');
      return;
    }

    Logger.success('Scheduler', `Auto-update enabled (${this.interval})`);

    // Запускаємо оновлення при старті (не блокуємо старт сервера)
    this.performUpdate("initial").catch(err => {
      Logger.error('Scheduler', 'Initial update failed (non-critical)', err);
    });

    // Планове оновлення
    nodeCron.schedule(this.interval, () => {
      this.performUpdate("scheduled").catch(err => {
        Logger.error('Scheduler', 'Scheduled update failed (non-critical)', err);
      });
    });
  }
}

const autoUpdate = new AutoUpdateService();

// Keep-alive: Пінгуємо сервер кожні 14 хвилин, щоб не заснув на безкоштовному хостингу
class KeepAliveService {
  constructor() {
    this.enabled = config.server.env === 'production';
    this.interval = 14 * 60 * 1000; // 14 хвилин
  }

  start() {
    if (!this.enabled) {
      Logger.info('KeepAlive', 'Disabled in development mode');
      return;
    }

    Logger.success('KeepAlive', `Self-ping enabled (every 14 minutes)`);

    setInterval(async () => {
      try {
        const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
        const response = await fetch(`${url}/health`);

        if (response.ok) {
          Logger.debug('KeepAlive', `✓ Self-ping successful`);
        } else {
          Logger.warning('KeepAlive', `Self-ping returned ${response.status}`);
        }
      } catch (error) {
        Logger.error('KeepAlive', `Self-ping failed: ${error.message}`);
      }
    }, this.interval);
  }
}

const keepAlive = new KeepAliveService();

const server = app.listen(PORT, () => {
  Logger.banner("Blackout Calendar API", "2.0.0", config.server.env);
  Logger.success('Server', `Running at http://localhost:${PORT}`);
  Logger.info('Server', `API Documentation: http://localhost:${PORT}`);
  Logger.divider();

  autoUpdate.start();
  keepAlive.start();
});

// Обробка помилок при запуску сервера
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    Logger.error('Server', `Port ${PORT} is already in use. Please stop the other process or use a different port.`);
    Logger.info('Server', `To find and kill the process: netstat -ano | findstr :${PORT}`);
    process.exit(1);
  } else {
    Logger.error('Server', 'Failed to start server', error);
    process.exit(1);
  }
});

// Graceful shutdown handling
function gracefulShutdown(signal) {
  Logger.info('Server', `${signal} received, starting graceful shutdown...`);

  // Зупиняємо прийом нових запитів
  server.close((err) => {
    if (err) {
      Logger.error('Server', 'Error during server shutdown', err);
      process.exit(1);
    }

    Logger.success('Server', 'HTTP server closed successfully');

    // Закриваємо з'єднання з базою даних
    try {
      db.close();
      Logger.success('Database', 'Database connection closed');
    } catch (error) {
      Logger.error('Database', 'Error closing database', error);
    }

    // Очищаємо кеш
    try {
      cache.clear();
      Logger.success('Cache', 'Cache cleared');
    } catch (error) {
      Logger.warning('Cache', 'Error clearing cache', error);
    }

    Logger.info('Server', 'Graceful shutdown completed');
    process.exit(0);
  });

  // Якщо сервер не зупиняється за 30 секунд, примусово завершуємо
  setTimeout(() => {
    Logger.error('Server', 'Forced shutdown after timeout (30s)');
    process.exit(1);
  }, 30000);
}

// Обробники сигналів
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Обробка необроблених помилок
process.on('uncaughtException', (error) => {
  Logger.error('Server', 'Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  Logger.error('Server', 'Unhandled Rejection at:', promise, 'reason:', reason);
  // НЕ зупиняємо сервер - може бути некритична помилка (наприклад, fetch timeout)
  // gracefulShutdown('unhandledRejection');
});
