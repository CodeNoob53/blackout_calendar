#!/usr/bin/env node

/**
 * Ініціалізація бази даних для production
 * Використовується при першому деплої на Render.com
 */

import { initDatabase } from '../src/db.js';
import { bootstrap } from '../src/services/SyncEngine.js';
import Logger from '../src/utils/logger.js';

async function initProductionDB() {
  try {
    Logger.info('InitDB', '=== Initializing production database ===');

    // Ініціалізуємо БД (створюємо таблиці якщо не існують)
    initDatabase();
    Logger.success('InitDB', 'Database schema initialized');

    // Перевіряємо чи БД порожня
    const db = (await import('../src/db.js')).db;
    const count = db.prepare('SELECT COUNT(*) as count FROM schedule_metadata').get();

    if (count.count === 0) {
      Logger.info('InitDB', 'Database is empty');
      Logger.info('InitDB', 'Bootstrap will run automatically when server starts');
      // НЕ робимо bootstrap під час build - він запуститься коли сервер стартує
      // await bootstrap();
    } else {
      Logger.info('InitDB', `Database already has ${count.count} schedules`);
    }

    Logger.success('InitDB', '=== Production database ready ===');
    process.exit(0);
  } catch (error) {
    Logger.error('InitDB', 'Failed to initialize database:', error);
    process.exit(1);
  }
}

initProductionDB();
