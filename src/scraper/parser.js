import { extractDate } from "./utils.js";

export function parseScheduleMessage(text) {
  const date = extractDate(text);

  const queues = [];

  // Знаходимо всі черги у тексті (можуть бути в одному рядку або в багатьох)
  // Формат: "1.1: 00:00 – 05:30" або "1.1: 00-00 – 05-30" (Zoe змінює формат!)
  // НОВИЙ формат (2026-01): "1.1: 00:00 до 02:00, з 15:00 до 20:00"
  // Також іноді пропускають двокрапку: "4.2 з 11:30 до 15:30"
  // Підтримуємо всі формати: старий (тире) і новий (до)
  const queuePattern = /(\d\.\d)\s*:?\s*([0-9:–\-‐−\s,здоі]+?)\.?(?=\s*(?:Черга\s+\d\.\d|Перелік|Дізнатися|Також|$))/gi;
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
