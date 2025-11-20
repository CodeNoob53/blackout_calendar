export function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
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
    const year = new Date().getFullYear();
    return `${year}-${month}-${day}`;
  }

  // Якщо не знайшли, шукаємо у форматі DD.MM.YYYY або DD.MM
  const numDateMatch = text.match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?/);
  if (!numDateMatch) return null;

  const day = numDateMatch[1].padStart(2, "0");
  const month = numDateMatch[2].padStart(2, "0");
  const year = numDateMatch[3] || new Date().getFullYear();

  return `${year}-${month}-${day}`;
}

