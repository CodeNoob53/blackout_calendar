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
import { errorHandler } from "./middleware/errorHandler.js";
import Logger from "./utils/logger.js";
import swaggerUi from "swagger-ui-express";
import { specs } from "./config/swagger.js";
import rateLimit from "express-rate-limit";

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

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: "Too many requests, please try again later.",
  },
});
app.use("/api/", limiter);

// Swagger UI
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

// Головна сторінка з документацією API
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Blackout Calendar API 🚀",
    version: "2.0.0",
    endpoints: {
      schedules: {
        "GET /api/schedules/latest": "Отримати останній доступний графік",
        "GET /api/schedules/dates": "Список всіх доступних дат",
        "GET /api/schedules/:date": "Отримати графік на дату (YYYY-MM-DD)",
        "GET /api/schedules/:date/metadata": "Метадані графіку (час оновлення, кількість змін)",
        "GET /api/schedules/:date/history": "Історія всіх змін для дати",
        "GET /api/schedules/:date/queues/:queue": "Графік для конкретної черги на дату"
      },
      updates: {
        "POST /api/updates/trigger": "Оновити графік з Telegram (ручне)",
        "GET /api/updates/recent": "Останні оновлення (?limit=10)",
        "GET /api/updates/new": "Нові графіки за останні N годин (?hours=24)",
        "GET /api/updates/changed": "Змінені графіки за останні N годин (?hours=24)"
      }
    },
    changes: {
      v2: [
        "Переписано на класову архітектуру",
        "Додано валідацію параметрів запитів",
        "Оновлено структуру URL (більш RESTful)",
        "Покращено обробку помилок",
        "Додано форматування відповідей"
      ]
    }
  });
});

// API Routes
app.use("/api/schedules", scheduleRoutes);
app.use("/api/updates", updateRoutes);

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
