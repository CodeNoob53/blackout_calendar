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

export function extractDate(text, baseDateStr = null) {
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

  // Визначаємо базову дату (якщо не передано - сьогодні)
  const baseDate = baseDateStr ? new Date(baseDateStr) : new Date();
  
  // Використовуємо київський час для визначення базового року та місяця
  const kyivFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Kiev',
    year: 'numeric',
    month: '2-digit'
  });
  const parts = kyivFormatter.formatToParts(baseDate);
  const baseYear = parseInt(parts.find(p => p.type === 'year').value, 10);
  const baseMonth = parseInt(parts.find(p => p.type === 'month').value, 10);

  // Спочатку шукаємо дату у форматі "14 листопада"
  const textDateMatch = text.match(/(\d{1,2})\s+(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня|січень|лютий|березень|квітень|травень|червень|липень|серпень|вересень|жовтень|листопад|грудень)/i);

  if (textDateMatch) {
    const day = textDateMatch[1].padStart(2, "0");
    const monthName = textDateMatch[2].toLowerCase();
    const month = monthMap[monthName];
    const parsedMonth = parseInt(month, 10);

    let year = baseYear;

    // Логіка переходу року:
    // Якщо ми зараз у Грудні (12), а парсимо Січень (01) -> це наступний рік
    if (baseMonth === 12 && parsedMonth === 1) {
      year += 1;
    } 
    // Якщо за раз у Січні/Лютому, а парсимо Листопад/Грудень (наприклад, старі повідомлення) -> це минулий рік
    else if (baseMonth <= 2 && parsedMonth >= 11) {
      year -= 1;
    }
    // В інших випадках, якщо місяць сильно відрізняється від поточного (наприклад січень -> грудень)
    // і ми не маємо явного baseDate, це МОЖЕ бути помилкою, але зазвичай використовуємо baseYear.
    // Якщо ми парсимо старі логи (bootstrap), baseDate буде часом повідомлення, тому year буде коректним.

    return `${year}-${month}-${day}`;
  }

  // Якщо не знайшли, шукаємо у форматі DD.MM.YYYY або DD.MM
  const numDateMatch = text.match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?/);
  if (!numDateMatch) return null;

  const day = numDateMatch[1].padStart(2, "0");
  const month = numDateMatch[2].padStart(2, "0");
  const parsedMonth = parseInt(month, 10);
  let year = numDateMatch[3];

  if (!year) {
    year = baseYear;
    if (baseMonth === 12 && parsedMonth === 1) {
      year += 1;
    } else if (baseMonth <= 2 && parsedMonth >= 11) {
      year -= 1;
    }
  }

  return `${year}-${month}-${day}`;
}

