import express from "express";
import cors from "cors";
import nodeCron from "node-cron";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";
import config from "./config/index.js";
import { initDatabase } from "./db.js";
import { updateFromTelegram } from "./scraper/telegramScraper.js";
import scheduleRoutes from "./routes/scheduleRoutes.js";
import updateRoutes from "./routes/updateRoutes.js";
import addressRoutes from "./routes/addressRoutes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import Logger from "./utils/logger.js";
import swaggerUi from "swagger-ui-express";
import { specs } from "./config/swagger.js";
import { generalLimiter, searchLimiter, scheduleLimiter, updatesLimiter } from "./middleware/rateLimiter.js";
import { i18nMiddleware, getAvailableLocales } from "./i18n/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Створюємо папку для бази даних
const dataDir = join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  Logger.server("Created data directory");
}

// Ініціалізуємо базу даних
initDatabase();

const app = express();
const PORT = config.server.port;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

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
      },
      addresses: {
        "GET /api/addresses/search?q=query": req.t('api.endpoints.addresses.search'),
        "GET /api/addresses/exact?address=full": req.t('api.endpoints.addresses.exact')
      }
    },
    rateLimits: {
      "/api/schedules": req.t('api.rateLimits.schedules'),
      "/api/updates": req.t('api.rateLimits.updates'),
      "/api/addresses": req.t('api.rateLimits.addresses'),
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
app.use("/api/addresses", searchLimiter, addressRoutes);

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
      const result = await updateFromTelegram();
      Logger.updateSummary(result);
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

    // Запускаємо оновлення при старті
    this.performUpdate("initial");

    // Планове оновлення
    nodeCron.schedule(this.interval, () => {
      this.performUpdate("scheduled");
    });
  }
}

const autoUpdate = new AutoUpdateService();

app.listen(PORT, () => {
  Logger.banner("Blackout Calendar API", "2.0.0", config.server.env);
  Logger.success('Server', `Running at http://localhost:${PORT}`);
  Logger.info('Server', `API Documentation: http://localhost:${PORT}`);
  Logger.divider();

  autoUpdate.start();
});
