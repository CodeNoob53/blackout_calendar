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
import { initScheduleNotificationService, getNotificationStats } from "./services/ScheduleNotificationService.js";
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

const app = express();
app.set('trust proxy', 1); // Довіряємо першому проксі (Render/Nginx)
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
  const notificationStats = getNotificationStats();
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: Logger.environment,
    cache: {
      size: cacheStats.size,
      keys: cacheStats.keys
    },
    scheduledNotifications: {
      total: notificationStats.totalJobs,
      jobsCount: notificationStats.jobs.length
    }
  });
});

// Alias for Render health check
app.get("/healthz", (req, res) => {
  res.status(200).send("ok");
});

// Error handling middleware (має бути останнім)
app.use(errorHandler);

// Автоматичне оновлення
class AutoUpdateService {
  constructor() {
    this.enabled = config.autoUpdate.enabled;
    this.interval = config.autoUpdate.interval;
  }

  async performUpdate() {
    try {
      // Використовуємо orchestrator (останні 7 днів)
      const result = await orchestrator();

      if (result.synced > 0) {
        Logger.info('Scheduler', `Synced ${result.synced} dates`);
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
      Logger.error('Scheduler', 'Update failed', error);
      throw error;
    }
  }

  start() {
    if (!this.enabled) {
      Logger.warning('Scheduler', 'Auto-update disabled');
      return;
    }

    Logger.success('Scheduler', `Auto-update enabled (${this.interval})`);

    // Планове оновлення
    nodeCron.schedule(this.interval, () => {
      this.performUpdate().catch(err => {
        Logger.error('Scheduler', 'Scheduled update failed (non-critical)', err);
      });
    });
  }
}

const autoUpdate = new AutoUpdateService();

// Keep-alive: Пінгуємо сервер кожні 14 хвилин, щоб не заснув на безкоштовному хостингу
class KeepAliveService {
  constructor() {
    this.enabled = Logger.environment === 'production';
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
  // 1. Банер сервера
  Logger.banner("Blackout Calendar API", "2.0.0", Logger.environment);
  Logger.success('Server', `Running at http://localhost:${PORT}`);
  Logger.info('Server', `API Documentation: http://localhost:${PORT}`);
  Logger.divider();

  // 2. Ініціалізація бази даних
  Logger.info('Server', 'Initializing database...');
  initDatabase();
  EmergencyBlackoutService.initEmergencyBlackoutsTable();

  // 3. Перевірка чи потрібен bootstrap
  const count = db.prepare('SELECT COUNT(*) as count FROM schedule_metadata').get();
  const isEmpty = count.count === 0;

  if (isEmpty) {
    Logger.info('Server', 'Database is empty, running bootstrap...');
    bootstrap().then(result => {
      Logger.success('Server', `Bootstrap completed: ${result.synced} dates synced`);

      // 4. Ініціалізація сервісів сповіщень (після bootstrap)
      NotificationService.init();
      initScheduleNotificationService();

      // 5. Запуск автооновлення та keep-alive
      autoUpdate.start();
      keepAlive.start();
    }).catch(err => {
      Logger.error('Server', 'Bootstrap failed', err);
      process.exit(1);
    });
  } else {
    Logger.info('Server', `Database has ${count.count} schedules`);

    // 4. Ініціалізація сервісів сповіщень
    NotificationService.init();
    initScheduleNotificationService();

    // 5. Запуск автооновлення та keep-alive
    autoUpdate.start();
    keepAlive.start();
  }
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
