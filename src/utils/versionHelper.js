import crypto from "crypto";

/**
 * Генерує хеш контенту графіка для порівняння версій
 * Використовуємо тільки значущі дані (дата, черги, інтервали)
 * Ігноруємо метадані які не впливають на сам графік
 *
 * @param {Object} scheduleData - Розпарсений графік
 * @returns {string} SHA256 хеш
 */
export function generateScheduleHash(scheduleData) {
  // Нормалізуємо дані для хешування
  const normalized = {
    date: scheduleData.date,
    queues: scheduleData.queues
      .map(q => ({
        queue: q.queue,
        intervals: q.intervals
          .map(i => ({
            start: i.start,
            end: i.end
          }))
          .sort((a, b) => a.start.localeCompare(b.start))
      }))
      .sort((a, b) => a.queue.localeCompare(b.queue))
  };

  const dataString = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(dataString, 'utf8').digest('hex');
}

/**
 * Генерує стабільний version ID для Zoe графіка
 *
 * @param {string} scheduleDate - Дата графіка (YYYY-MM-DD)
 * @param {number} versionNumber - Номер версії (1, 2, 3...)
 * @returns {string} Формат: "zoe-2025-12-05-v001"
 */
export function generateZoeVersionId(scheduleDate, versionNumber) {
  const versionStr = String(versionNumber).padStart(3, '0');
  return `zoe-${scheduleDate}-v${versionStr}`;
}

/**
 * Генерує version ID для Telegram графіка
 *
 * @param {number} postId - ID поста з Telegram
 * @returns {string} Формат: "tg-2537"
 */
export function generateTelegramVersionId(postId) {
  return `tg-${postId}`;
}

/**
 * Парсить version ID і повертає компоненти
 *
 * @param {string} versionId - Version ID (наприклад "zoe-2025-12-05-v001" або "tg-2537")
 * @returns {Object|null} { source, date?, versionNumber?, postId? }
 */
export function parseVersionId(versionId) {
  if (!versionId || typeof versionId !== 'string') {
    return null;
  }

  // Telegram format: "tg-2537"
  const tgMatch = versionId.match(/^tg-(\d+)$/);
  if (tgMatch) {
    return {
      source: 'telegram',
      postId: parseInt(tgMatch[1], 10)
    };
  }

  // Zoe format: "zoe-2025-12-05-v001"
  const zoeMatch = versionId.match(/^zoe-(\d{4}-\d{2}-\d{2})-v(\d+)$/);
  if (zoeMatch) {
    return {
      source: 'zoe',
      date: zoeMatch[1],
      versionNumber: parseInt(zoeMatch[2], 10)
    };
  }

  return null;
}

/**
 * Порівнює два графіки і повертає чи вони ідентичні
 *
 * @param {string} hash1 - Хеш першого графіка
 * @param {string} hash2 - Хеш другого графіка
 * @returns {boolean}
 */
export function schedulesAreIdentical(hash1, hash2) {
  return hash1 === hash2;
}

/**
 * Знаходить відмінності між двома графіками
 * Корисно для детального логування змін
 *
 * @param {Object} oldSchedule - Старий графік
 * @param {Object} newSchedule - Новий графік
 * @returns {Object} Об'єкт з описом змін
 */
export function findScheduleDifferences(oldSchedule, newSchedule) {
  const differences = {
    hasChanges: false,
    dateChanged: false,
    queuesAdded: [],
    queuesRemoved: [],
    queuesModified: []
  };

  // Перевірка дати
  if (oldSchedule.date !== newSchedule.date) {
    differences.hasChanges = true;
    differences.dateChanged = true;
  }

  // Створюємо мапи черг для порівняння
  const oldQueues = new Map();
  const newQueues = new Map();

  oldSchedule.queues.forEach(q => {
    oldQueues.set(q.queue, q);
  });

  newSchedule.queues.forEach(q => {
    newQueues.set(q.queue, q);
  });

  // Знаходимо видалені черги
  for (const [queueId] of oldQueues) {
    if (!newQueues.has(queueId)) {
      differences.hasChanges = true;
      differences.queuesRemoved.push(queueId);
    }
  }

  // Знаходимо додані та змінені черги
  for (const [queueId, newQueue] of newQueues) {
    const oldQueue = oldQueues.get(queueId);

    if (!oldQueue) {
      // Нова черга
      differences.hasChanges = true;
      differences.queuesAdded.push(queueId);
    } else {
      // Перевіряємо чи змінилися інтервали
      const oldIntervals = JSON.stringify(oldQueue.intervals.sort((a, b) => a.start.localeCompare(b.start)));
      const newIntervals = JSON.stringify(newQueue.intervals.sort((a, b) => a.start.localeCompare(b.start)));

      if (oldIntervals !== newIntervals) {
        differences.hasChanges = true;
        differences.queuesModified.push({
          queue: queueId,
          oldIntervals: oldQueue.intervals,
          newIntervals: newQueue.intervals
        });
      }
    }
  }

  return differences;
}

/**
 * Форматує опис змін для логування
 *
 * @param {Object} differences - Результат findScheduleDifferences
 * @returns {string} Людино-читабельний опис змін
 */
export function formatDifferencesDescription(differences) {
  if (!differences.hasChanges) {
    return 'Немає змін';
  }

  const parts = [];

  if (differences.dateChanged) {
    parts.push('Змінено дату графіка');
  }

  if (differences.queuesAdded.length > 0) {
    parts.push(`Додано черг: ${differences.queuesAdded.join(', ')}`);
  }

  if (differences.queuesRemoved.length > 0) {
    parts.push(`Видалено черг: ${differences.queuesRemoved.join(', ')}`);
  }

  if (differences.queuesModified.length > 0) {
    const modifiedQueues = differences.queuesModified.map(m => m.queue).join(', ');
    parts.push(`Змінено інтервали в чергах: ${modifiedQueues}`);
  }

  return parts.join('; ');
}

/**
 * Валідує version ID
 *
 * @param {string} versionId - Version ID для перевірки
 * @returns {boolean}
 */
export function isValidVersionId(versionId) {
  const parsed = parseVersionId(versionId);
  return parsed !== null;
}
