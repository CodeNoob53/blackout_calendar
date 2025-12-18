/**
 * Schedule Notification Service
 * Автоматичні ЗАПЛАНОВАНІ сповіщення на конкретний час згідно графіка
 *
 * Функціонал:
 * - Створює заплановані завдання (scheduled jobs) після оновлення графіка
 * - За 30 хвилин до відключення світла (точний час!)
 * - Після увімкнення світла (точний час!)
 * - При зміні графіка → скасовує старі завдання → створює нові
 */

import schedule from 'node-schedule';
import { db } from '../db.js';
import { NotificationService } from './NotificationService.js';
import Logger from '../utils/logger.js';

/**
 * Зберігаємо всі заплановані завдання
 * Структура: Map<jobId, ScheduledJob>
 * jobId = `{date}:{queue}:{type}:{time}`
 * Приклад: "2025-12-10:1.1:power_off_30min:14:00"
 */
const scheduledJobs = new Map();

/**
 * Скасувати всі заплановані завдання для певної дати
 */
function cancelJobsForDate(date) {
  let cancelledCount = 0;

  for (const [jobId, job] of scheduledJobs) {
    if (jobId.startsWith(`${date}:`)) {
      job.cancel();
      scheduledJobs.delete(jobId);
      cancelledCount++;
    }
  }

  if (cancelledCount > 0) {
    Logger.info('ScheduleNotificationService', `Cancelled ${cancelledCount} jobs for ${date}`);
  }

  return cancelledCount;
}

/**
 * Скасувати ВСІ заплановані завдання
 */
function cancelAllJobs() {
  const count = scheduledJobs.size;

  for (const [, job] of scheduledJobs) {
    job.cancel();
  }

  scheduledJobs.clear();

  if (count > 0) {
    Logger.info('ScheduleNotificationService', `Cancelled all ${count} jobs`);
  }

  return count;
}

/**
 * Розрахувати час для сповіщення "за 30 хв до відключення"
 * ВАЖЛИВО: startTime - це час в Київському часовому поясі (Europe/Kyiv, UTC+2/+3)
 */
function calculateWarningTime(startTime) {
  const [hours, minutes] = startTime.split(':').map(Number);

  // Отримуємо сьогоднішню дату в київському часі
  const now = new Date();
  const kyivDate = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));

  // Створюємо дату з київським часом відключення
  const warningDate = new Date(
    kyivDate.getFullYear(),
    kyivDate.getMonth(),
    kyivDate.getDate(),
    hours,
    minutes,
    0,
    0
  );

  // Віднімаємо 30 хвилин для попередження
  warningDate.setMinutes(warningDate.getMinutes() - 30);

  return warningDate;
}

/**
 * Розрахувати час для сповіщення "світло увімкнулось"
 * ВАЖЛИВО: endTime - це час в Київському часовому поясі (Europe/Kyiv, UTC+2/+3)
 */
function calculatePowerOnTime(endTime) {
  const [hours, minutes] = endTime.split(':').map(Number);

  // Отримуємо сьогоднішню дату в київському часі
  const now = new Date();
  const kyivDate = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));

  // Створюємо дату з київським часом увімкнення
  const powerOnDate = new Date(
    kyivDate.getFullYear(),
    kyivDate.getMonth(),
    kyivDate.getDate(),
    hours,
    minutes,
    0,
    0
  );

  return powerOnDate;
}

/**
 * Створити заплановане завдання для попередження про відключення
 */
function scheduleWarningNotification(date, queue, startTime, endTime) {
  const warningTime = calculateWarningTime(startTime);
  const now = new Date();

  // Якщо час вже минув - пропускаємо
  if (warningTime <= now) {
    Logger.debug('ScheduleNotificationService', `Skipping past warning for ${queue} at ${startTime} (${date})`);
    return null;
  }

  const jobId = `${date}:${queue}:power_off_30min:${startTime}`;

  // Створюємо завдання на конкретний час
  const job = schedule.scheduleJob(warningTime, async () => {
    try {
      await NotificationService.notifyQueueSubscribers(
        queue,
        {
          title: `⚠️ Світло вимкнеться через 30 хв`,
          body: `Черга ${queue}: відключення з ${startTime} до ${endTime}`,
          url: `/?queue=${queue}`
        },
        'power_off_30min'
      );

      Logger.success('ScheduleNotificationService', `Sent power_off_30min for queue ${queue} (${startTime}-${endTime})`);

      // Видаляємо завдання після виконання
      scheduledJobs.delete(jobId);
    } catch (error) {
      Logger.error('ScheduleNotificationService', `Failed to send power_off_30min for queue ${queue}`, error);
    }
  });

  scheduledJobs.set(jobId, job);

  Logger.debug('ScheduleNotificationService', `Scheduled power_off_30min for queue ${queue} at ${warningTime.toLocaleTimeString('uk-UA')} (${date})`);

  return job;
}

/**
 * Створити заплановане завдання для сповіщення про увімкнення
 */
function schedulePowerOnNotification(date, queue, endTime) {
  const powerOnTime = calculatePowerOnTime(endTime);
  const now = new Date();

  // Якщо час вже минув - пропускаємо
  if (powerOnTime <= now) {
    Logger.debug('ScheduleNotificationService', `Skipping past power_on for ${queue} at ${endTime} (${date})`);
    return null;
  }

  const jobId = `${date}:${queue}:power_on:${endTime}`;

  // Створюємо завдання на конкретний час
  const job = schedule.scheduleJob(powerOnTime, async () => {
    try {
      await NotificationService.notifyQueueSubscribers(
        queue,
        {
          title: `✅ Світло увімкнулось`,
          body: `Черга ${queue}: електропостачання відновлено`,
          url: `/?queue=${queue}`
        },
        'power_on'
      );

      Logger.success('ScheduleNotificationService', `Sent power_on for queue ${queue} (after ${endTime})`);

      // Видаляємо завдання після виконання
      scheduledJobs.delete(jobId);
    } catch (error) {
      Logger.error('ScheduleNotificationService', `Failed to send power_on for queue ${queue}`, error);
    }
  });

  scheduledJobs.set(jobId, job);

  Logger.debug('ScheduleNotificationService', `Scheduled power_on for queue ${queue} at ${powerOnTime.toLocaleTimeString('uk-UA')} (${date})`);

  return job;
}

/**
 * Перепланувати сповіщення для конкретної дати
 * Викликається після оновлення графіка через SyncEngine
 *
 * @param {string} date - Дата у форматі YYYY-MM-DD
 */
export function rescheduleNotifications(date) {
  Logger.info('ScheduleNotificationService', `Rescheduling notifications for ${date}...`);

  // 1. Скасовуємо всі старі завдання для цієї дати
  cancelJobsForDate(date);

  // 2. Отримуємо оновлений графік для цієї дати
  const schedule = db.prepare(`
    SELECT queue, start_time, end_time
    FROM outages
    WHERE date = ?
    ORDER BY queue, start_time
  `).all(date);

  if (schedule.length === 0) {
    Logger.debug('ScheduleNotificationService', `No schedule found for ${date}`);
    return;
  }

  // 3. Створюємо нові заплановані завдання
  let scheduledCount = 0;

  for (const interval of schedule) {
    const { queue, start_time, end_time } = interval;

    // Плануємо попередження за 30 хв
    const warningJob = scheduleWarningNotification(date, queue, start_time, end_time);
    if (warningJob) scheduledCount++;

    // Плануємо сповіщення про увімкнення
    const powerOnJob = schedulePowerOnNotification(date, queue, end_time);
    if (powerOnJob) scheduledCount++;
  }

  Logger.success('ScheduleNotificationService', `Rescheduled ${scheduledCount} notifications for ${date} (${schedule.length} intervals)`);
}

/**
 * Планувати сповіщення для сьогодні та завтра
 * Викликається при старті сервера
 */
export function scheduleUpcomingNotifications() {
  Logger.info('ScheduleNotificationService', 'Scheduling upcoming notifications...');

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  // Плануємо для сьогодні
  rescheduleNotifications(today);

  // Плануємо для завтра
  rescheduleNotifications(tomorrowStr);

  Logger.success('ScheduleNotificationService', 'Upcoming notifications scheduled');
}

/**
 * Щоденне оновлення: планувати завтра, очистити вчора
 * Запускається щодня о 00:01
 */
function scheduleDailyUpdate() {
  // Cron: щодня о 00:01
  const dailyJob = schedule.scheduleJob('1 0 * * *', () => {
    Logger.info('ScheduleNotificationService', 'Daily update: cleaning old jobs and scheduling tomorrow...');

    // Очищаємо завдання для вчорашнього дня
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    cancelJobsForDate(yesterdayStr);

    // Плануємо для завтра
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    rescheduleNotifications(tomorrowStr);

    Logger.success('ScheduleNotificationService', 'Daily update completed');
  });

  Logger.info('ScheduleNotificationService', 'Daily update job scheduled (runs at 00:01)');

  return dailyJob;
}

/**
 * Ініціалізувати сервіс (викликається при старті сервера)
 */
export function initScheduleNotificationService() {
  Logger.success('ScheduleNotificationService', 'Initializing...');

  // Очищаємо всі старі завдання (якщо були)
  cancelAllJobs();

  // Плануємо сповіщення для сьогодні та завтра
  scheduleUpcomingNotifications();

  // Налаштовуємо щоденне оновлення
  scheduleDailyUpdate();

  Logger.success('ScheduleNotificationService', 'Initialized successfully');
}

/**
 * Отримати статистику заплованих завдань (для дебагу)
 */
export function getNotificationStats() {
  const stats = {
    totalJobs: scheduledJobs.size,
    jobs: []
  };

  for (const [jobId, job] of scheduledJobs) {
    const nextInvocation = job.nextInvocation();

    stats.jobs.push({
      id: jobId,
      nextRun: nextInvocation ? nextInvocation.toISOString() : null,
      nextRunLocal: nextInvocation ? nextInvocation.toLocaleString('uk-UA') : null
    });
  }

  // Сортуємо по часу виконання
  stats.jobs.sort((a, b) => {
    if (!a.nextRun) return 1;
    if (!b.nextRun) return -1;
    return new Date(a.nextRun) - new Date(b.nextRun);
  });

  return stats;
}

/**
 * Очистити всі завдання (для тестування)
 */
export function clearAllJobs() {
  return cancelAllJobs();
}
