import { extractDate } from "./utils.js";

/**
 * Перевіряє чи є повідомлення тільки попередженням про зміни (без фактичного графіку)
 * Такі повідомлення часто містять ключові слова, але не мають черг і часів
 */
export function isOnlyChangeWarning(text) {
  const normalizedText = text.toLowerCase();

  // Ключові фрази які вказують на попередження без графіку
  const warningPhrases = [
    'може змінитися',
    'можливі зміни',
    'можуть бути зміни',
    'очікуйте на оновлення',
    'інформуватимемо додатково',
    'буде оприлюднено',
    'буде повідомлено',
    'слідкуйте за оновленнями',
    'інформація буде надана',
    'графік буде оновлено',
    'очікується зміна'
  ];

  // Перевіряємо чи є попереджувальні фрази
  const hasWarningPhrase = warningPhrases.some(phrase =>
    normalizedText.includes(phrase)
  );

  if (!hasWarningPhrase) {
    return false; // Немає попереджувальних фраз - це не попередження
  }

  // Перевіряємо чи є конкретні часи (HH:mm)
  const hasTimePattern = /\d{1,2}:\d{2}/.test(text);

  // Якщо є попередження але немає конкретних часів - це тільки попередження
  return !hasTimePattern;
}

/**
 * Чи схоже повідомлення на графік відключень (за ключовими словами).
 * Старі формати: "ГПВ", "Години відсутності", "ОНОВЛЕНО".
 * Новий формат (2026-11): "оновлено графік погодинних відключень" + "⚡ Черга X.Y".
 */
export function hasScheduleKeywords(text) {
  return text.includes('ГПВ') ||
    text.includes('Години відсутності') ||
    text.includes('ОНОВЛЕНО') ||
    /погодинних\s+відключень/i.test(text) ||
    /оновлено\s+графік/i.test(text);
}

export function parseScheduleMessage(text, baseDateStr = null) {
  const date = extractDate(text, baseDateStr);

  const queues = [];

  // Знаходимо всі черги у тексті (можуть бути в одному рядку або в багатьох)
  // Формат 1: "Черга 1.1: 00:00 до 02:00" (з словом "Черга")
  // Формат 2: "1.1: 00:00 – 05:30" (без слова "Черга")
  // Формат 3: "1.1: 00-00 – 05-30" (тире замість двокрапки в часі)
  // Формат 4: "4.2 з 11:30 до 15:30" (без двокрапки після номера)
  // Lookahead шукає: наступну чергу (з "Черга" або без), ключові слова, або кінець тексту
  // Формат 5 (2026-11): "⚡ Черга 1.1\n з 09:00 до 13:00\n з 16:00 до 20:00" (маркер ⚡, інтервали в окремих рядках)
  const bullet = '(?:[🔹⚡]\\uFE0F?\\s*)?';
  const queuePattern = new RegExp(
    bullet + '(?:Черга\\s+)?(\\d\\.\\d)\\s*:?\\s*([0-9:–\\-‐−\\s,;здоі]+?)\\.?' +
    '(?=\\s*' + bullet + '(?:Черга\\s+)?\\d\\.\\d\\s*:?|\\s*(?:Перелік|Дізнатися|Також|$))',
    'giu'
  );
  const matches = [...text.matchAll(queuePattern)];

  for (const match of matches) {
    const queueId = match[1];
    const timeString = match[2].trim();

    // Парсимо часові інтервали
    // НОВИЙ формат (2026-01): "00:00 до 02:00" або "з 15:00 до 20:00"
    // СТАРИЙ формат: "00:00-02:00" або "00-00-02-00" (з різними типами тире)
    // Пробуємо спершу новий формат з "до", потім старий з тире
    const newTimePattern = /(?:з\s+)?(\d{1,2}):(\d{2})\s+до\s+(\d{1,2}):(\d{2})/g;
    const oldTimePattern = /(\d{1,2})[:‐\-−](\d{2})\s*[–\-—]\s*(\d{1,2})[:‐\-−](\d{2})/g;
    const intervals = [];
    let timeMatch;

    // Спочатку пробуємо новий формат з "до"
    while ((timeMatch = newTimePattern.exec(timeString)) !== null) {
      let startHour = parseInt(timeMatch[1], 10);
      let startMin = parseInt(timeMatch[2], 10);
      let endHour = parseInt(timeMatch[3], 10);
      let endMin = parseInt(timeMatch[4], 10);

      // Normalize time >= 24:00 (handle creative Telegram admins 😅)
      // Examples: 24:00 → 00:00, 24:30 → 00:30, 25:15 → 01:15
      // This ensures compatibility with time validation and database storage
      if (startHour >= 24) {
        startHour = startHour % 24; // 24→0, 25→1, 26→2, etc.
      }
      if (endHour >= 24) {
        endHour = endHour % 24;
      }

      // Also handle invalid minutes (just in case they write 14:90 or something)
      if (startMin >= 60) {
        startHour += Math.floor(startMin / 60);
        startMin = startMin % 60;
        if (startHour >= 24) startHour = startHour % 24;
      }
      if (endMin >= 60) {
        endHour += Math.floor(endMin / 60);
        endMin = endMin % 60;
        if (endHour >= 24) endHour = endHour % 24;
      }

      intervals.push({
        start: `${String(startHour).padStart(2, "0")}:${String(startMin).padStart(2, "0")}`,
        end: `${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}`
      });
    }

    // Якщо новий формат не знайшов інтервалів, пробуємо старий формат з тире
    if (intervals.length === 0) {
      while ((timeMatch = oldTimePattern.exec(timeString)) !== null) {
      let startHour = parseInt(timeMatch[1], 10);
      let startMin = parseInt(timeMatch[2], 10);
      let endHour = parseInt(timeMatch[3], 10);
      let endMin = parseInt(timeMatch[4], 10);

      // Normalize time >= 24:00 (handle creative Telegram admins 😅)
      // Examples: 24:00 → 00:00, 24:30 → 00:30, 25:15 → 01:15
      // This ensures compatibility with time validation and database storage
      if (startHour >= 24) {
        startHour = startHour % 24; // 24→0, 25→1, 26→2, etc.
      }
      if (endHour >= 24) {
        endHour = endHour % 24;
      }

      // Also handle invalid minutes (just in case they write 14:90 or something)
      if (startMin >= 60) {
        startHour += Math.floor(startMin / 60);
        startMin = startMin % 60;
        if (startHour >= 24) startHour = startHour % 24;
      }
      if (endMin >= 60) {
        endHour += Math.floor(endMin / 60);
        endMin = endMin % 60;
        if (endHour >= 24) endHour = endHour % 24;
      }

        intervals.push({
          start: `${String(startHour).padStart(2, "0")}:${String(startMin).padStart(2, "0")}`,
          end: `${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}`
        });
      }
    }

    if (intervals.length > 0) {
      queues.push({ queue: queueId, intervals });
    }
  }

  return { date, queues };
}
