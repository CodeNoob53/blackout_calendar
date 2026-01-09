import * as cheerio from "cheerio";
import config from "../config/index.js";

const CHANNEL_URL = config.telegram.channelUrl;

/**
 * Перевіряє чи є повідомлення про аварійні відключення (ГАВ)
 */
export function isEmergencyBlackoutMessage(text) {
  const normalizedText = text.toLowerCase();

  // Виключаємо повідомлення про відновлення та скасування
  const excludeKeywords = [
    'відновило',
    'повернуло світло',
    'відновлення',
    'усунули',
    'скасовано',
    'скасовуються'
  ];

  if (excludeKeywords.some(keyword => normalizedText.includes(keyword))) {
    return false;
  }

  // Ключові фрази для ГАВ
  const emergencyKeywords = [
    'графіки аварійних відключень',
    'введені графіки аварійних',
    'застосовано графіки аварійних'
  ];

  return emergencyKeywords.some(keyword => normalizedText.includes(keyword));
}

/**
 * Парсить повідомлення про ГАВ
 * Витягує дату та інформацію про те, для кого діють відключення
 */
export function parseEmergencyBlackoutMessage(text) {
  // Витягуємо дату з тексту (наприклад: "сьогодні, 09 грудня")
  const datePatterns = [
    /сьогодні,?\s*(\d{1,2})\s+(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)/i,
    /(\d{1,2})\s+(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)/i
  ];

  const monthMap = {
    'січня': '01', 'лютого': '02', 'березня': '03', 'квітня': '04',
    'травня': '05', 'червня': '06', 'липня': '07', 'серпня': '08',
    'вересня': '09', 'жовтня': '10', 'листопада': '11', 'грудня': '12'
  };

  let date = null;
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      const day = match[1].padStart(2, '0');
      const month = monthMap[match[2].toLowerCase()];
      const year = new Date().getFullYear();
      date = `${year}-${month}-${day}`;
      break;
    }
  }

  // Визначаємо для кого діють відключення
  const affectedGroups = [];
  const normalizedText = text.toLowerCase();

  if (normalizedText.includes('промислов')) {
    affectedGroups.push('industrial');
  }
  if (normalizedText.includes('побутов') || normalizedText.includes('населення')) {
    affectedGroups.push('residential');
  }
  if (normalizedText.includes('бізнес')) {
    affectedGroups.push('business');
  }

  // Якщо не знайшли конкретну групу, вважаємо що для всіх
  if (affectedGroups.length === 0) {
    affectedGroups.push('all');
  }

  return {
    date,
    affectedGroups,
    rawText: text.substring(0, 500) // Зберігаємо перші 500 символів
  };
}

// Fetch raw Telegram channel messages (id, text, datetime)
export async function fetchTelegramUpdates() {
  const response = await fetch(CHANNEL_URL);
  const html = await response.text();
  const $ = cheerio.load(html);

  const messages = [];

  $(".tgme_widget_message_wrap").each((_, el) => {
    const $msg = $(el).find(".tgme_widget_message");
    const text = $msg.find(".tgme_widget_message_text").text().trim();
    const link = $msg.find(".tgme_widget_message_date").attr("href");
    const idMatch = link?.match(/\/(\d+)$/);
    const postId = idMatch ? Number(idMatch[1]) : null;

    const dateElement = $msg.find(".tgme_widget_message_date time");
    const messageDate = dateElement.attr("datetime") || null;

    if (!postId || !text) return;

    messages.push({ id: postId, text, messageDate });
  });

  return messages;
}
