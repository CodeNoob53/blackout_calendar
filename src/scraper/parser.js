import { extractDate } from "./utils.js";

export function parseScheduleMessage(text) {
  const date = extractDate(text);

  const queues = [];

  // Знаходимо всі черги у тексті (можуть бути в одному рядку або в багатьох)
  // Формат: "1.1: 00:00 – 05:30, 09:00 – 16:00"
  const queuePattern = /(\d\.\d)\s*:\s*([0-9:–\-\s,]+?)(?=\d\.\d\s*:|Перелік|Дізнатися|Також|З \d{2}:|$)/g;
  const matches = [...text.matchAll(queuePattern)];

  for (const match of matches) {
    const queueId = match[1];
    const timeString = match[2].trim();

    // Парсимо часові інтервали
    const timePattern = /(\d{1,2}):(\d{2})\s*[–\-—]\s*(\d{1,2}):(\d{2})/g;
    const intervals = [];
    let timeMatch;

    while ((timeMatch = timePattern.exec(timeString)) !== null) {
      const startHour = timeMatch[1].padStart(2, "0");
      const startMin = timeMatch[2];
      const endHour = timeMatch[3].padStart(2, "0");
      const endMin = timeMatch[4];

      intervals.push({
        start: `${startHour}:${startMin}`,
        end: `${endHour}:${endMin}`
      });
    }

    if (intervals.length > 0) {
      queues.push({ queue: queueId, intervals });
    }
  }

  return { date, queues };
}
