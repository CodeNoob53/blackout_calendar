import { extractDate } from "./utils.js";

export function parseScheduleMessage(text) {
  const date = extractDate(text);

  const queues = [];

  // Знаходимо всі черги у тексті (можуть бути в одному рядку або в багатьох)
  // Формат: "1.1: 00:00 – 05:30" або "1.1: 00-00 – 05-30" (Zoe змінює формат!)
  // Підтримуємо обидва формати часу: з двокрапкою (16:00) і з тире (16-00/16‐00)
  // Включаємо всі типи тире: - (U+002D), ‐ (U+2010), − (U+2212)
  const queuePattern = /(\d\.\d)\s*:\s*([0-9:–\-‐−\s,]+?)\.?(?=\s*(?:\d\.\d\s*:|Перелік|Дізнатися|Також|З \d{2}:|$))/g;
  const matches = [...text.matchAll(queuePattern)];

  for (const match of matches) {
    const queueId = match[1];
    const timeString = match[2].trim();

    // Парсимо часові інтервали
    // Підтримуємо ОБА формати: 16:00 (двокрапка) і 16-00 (тире/дефіс)
    // Zoe часто міняє формат, тому обробляємо всі варіанти:
    // : - colon, - - hyphen-minus, ‐ - hyphen, − - minus sign
    const timePattern = /(\d{1,2})[:‐\-−](\d{2})\s*[–\-—]\s*(\d{1,2})[:‐\-−](\d{2})/g;
    const intervals = [];
    let timeMatch;

    while ((timeMatch = timePattern.exec(timeString)) !== null) {
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

    if (intervals.length > 0) {
      queues.push({ queue: queueId, intervals });
    }
  }

  return { date, queues };
}
