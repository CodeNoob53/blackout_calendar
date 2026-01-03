export function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Отримує поточний рік в київському часовому поясі
 */
function getKyivYear() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Kiev',
    year: 'numeric'
  });
  return parseInt(formatter.format(now), 10);
}

/**
 * Отримує поточний місяць в київському часовому поясі (1-12)
 */
function getKyivMonth() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Kiev',
    month: '2-digit'
  });
  return parseInt(formatter.format(now), 10);
}

export function extractDate(text) {
  // Мапа українських назв місяців
  const monthMap = {
    "січня": "01", "січень": "01",
    "лютого": "02", "лютий": "02",
    "березня": "03", "березень": "03",
    "квітня": "04", "квітень": "04",
    "травня": "05", "травень": "05",
    "червня": "06", "червень": "06",
    "липня": "07", "липень": "07",
    "серпня": "08", "серпень": "08",
    "вересня": "09", "вересень": "09",
    "жовтня": "10", "жовтень": "10",
    "листопада": "11", "листопад": "11",
    "грудня": "12", "грудень": "12"
  };

  // Спочатку шукаємо дату у форматі "14 листопада"
  const textDateMatch = text.match(/(\d{1,2})\s+(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня|січень|лютий|березень|квітень|травень|червень|липень|серпень|вересень|жовтень|листопад|грудень)/i);

  if (textDateMatch) {
    const day = textDateMatch[1].padStart(2, "0");
    const monthName = textDateMatch[2].toLowerCase();
    const month = monthMap[monthName];

    // Використовуємо київський час для визначення року
    let year = getKyivYear();
    const currentMonth = getKyivMonth();
    const parsedMonth = parseInt(month, 10);

    // Якщо місяць у повідомленні менший за поточний, це наступний рік
    // Наприклад: зараз грудень (12), а в повідомленні січень (01) -> наступний рік
    if (parsedMonth < currentMonth) {
      year += 1;
    }

    return `${year}-${month}-${day}`;
  }

  // Якщо не знайшли, шукаємо у форматі DD.MM.YYYY або DD.MM
  const numDateMatch = text.match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?/);
  if (!numDateMatch) return null;

  const day = numDateMatch[1].padStart(2, "0");
  const month = numDateMatch[2].padStart(2, "0");
  let year = numDateMatch[3];

  if (!year) {
    // Якщо рік не вказаний, визначаємо його
    year = getKyivYear();
    const currentMonth = getKyivMonth();
    const parsedMonth = parseInt(month, 10);

    // Якщо місяць менший за поточний, це наступний рік
    if (parsedMonth < currentMonth) {
      year += 1;
    }
  }

  return `${year}-${month}-${day}`;
}

