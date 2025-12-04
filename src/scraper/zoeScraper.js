import * as cheerio from "cheerio";
import axios from "axios";
import { parseScheduleMessage } from "./parser.js";
import { insertParsedSchedule, getScheduleMetadata } from "../db.js";
import config from "../config/index.js";
import cache from "../utils/cache.js";
import Logger from "../utils/logger.js";
import https from "https";

const ZOE_URL = "https://www.zoe.com.ua/%D0%B3%D1%80%D0%B0%D1%84%D1%96%D0%BA%D0%B8-%D0%BF%D0%BE%D0%B3%D0%BE%D0%B4%D0%B8%D0%BD%D0%BD%D0%B8%D1%85-%D1%81%D1%82%D0%B0%D0%B1%D1%96%D0%BB%D1%96%D0%B7%D0%B0%D1%86%D1%96%D0%B9%D0%BD%D0%B8%D1%85/";

/**
 * Отримати HTML з сайту zoe.com.ua
 * Використовуємо axios для кращої обробки помилок та підтримки різних протоколів
 */
export async function fetchZoeUpdates() {
  try {
    const agent = new https.Agent({
      rejectUnauthorized: false
    });

    const response = await axios.get(ZOE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      httpsAgent: agent,
      timeout: 30000, // 30 секунд
      maxRedirects: 5,
      validateStatus: function (status) {
        return status >= 200 && status < 300; // axios вважає помилкою тільки статуси < 200 або >= 300
      }
    });

    const html = response.data;

    if (!html || typeof html !== 'string' || html.length < 100) {
      throw new Error('Received empty or too short HTML response');
    }

    return html;
  } catch (error) {
    // Детальніше логування помилки
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        Logger.warning('ZoeScraper', 'Request timeout while fetching zoe.com.ua (30s)');
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        Logger.warning('ZoeScraper', `Cannot connect to zoe.com.ua: ${error.message}`);
      } else if (error.response) {
        // Сервер відповів з помилковим статус кодом
        Logger.warning('ZoeScraper', `HTTP ${error.response.status}: ${error.response.statusText}`);
      } else if (error.request) {
        // Запит був зроблений, але відповіді не отримано
        Logger.warning('ZoeScraper', 'No response received from zoe.com.ua');
      } else {
        Logger.warning('ZoeScraper', `Request setup error: ${error.message}`);
      }
    } else {
      Logger.error('ZoeScraper', `Failed to fetch from zoe.com.ua: ${error.message}`, error);
    }
    return null;
  }
}

/**
 * Парсити графіки з HTML zoe.com.ua
 * Структура може бути різною, тому потрібна гнучка обробка
 * 
 * Примітка: Якщо на сайті публікують неадекватні графіки (як 12 листопада),
 * валідація відфільтрує їх автоматично
 */
export function parseZoeHTML(html) {
  if (!html) return [];

  const $ = cheerio.load(html);
  const schedules = [];
  const seenDates = new Set(); // Щоб уникнути дублікатів

  try {
    // Стратегія: Розбиваємо сторінку на блоки за заголовками
    // Заголовки зазвичай містять дату, наприклад "ГПВ НА 06 ЛИСТОПАДА"
    // Шукаємо h1-h6 та strong, які можуть бути заголовками
    const headers = $('h1, h2, h3, h4, h5, h6, strong, b').filter((_, el) => {
      const text = $(el).text().trim();
      return (text.includes('ГПВ') || text.includes('графік') || text.includes('відключен')) &&
        (text.match(/\d{1,2}/) || text.includes('сьогодні') || text.includes('завтра'));
    });

    headers.each((_, el) => {
      const $header = $(el);
      let content = $header.text();

      // Збираємо весь текст до наступного заголовка
      let $next = $header.next();
      while ($next.length && !$next.is('h1, h2, h3, h4, h5, h6, strong, b')) {
        content += '\n' + $next.text();
        $next = $next.next();
      }

      // Також перевіряємо батьківський елемент, якщо заголовок всередині p або div
      if ($header.parent().is('p, div') && $header.parent().text().length > $header.text().length + 50) {
        content += '\n' + $header.parent().text();
      }

      // Очищаємо текст від зайвих пробілів
      content = content.replace(/\s+/g, ' ').trim();

      if (content.includes('ГПВ') || content.includes('Черга') || content.match(/\d\.\d\s*:/)) {
        const parsed = parseScheduleMessage(content);

        // Додаткова перевірка: якщо дата не знайдена в блоці, але є в заголовку
        // extractDate має це обробляти, але про всяк випадок

        if (parsed.date && parsed.queues.length > 0) {
          // Генеруємо унікальний ключ для дати та кількості черг, щоб розрізняти оновлення
          const key = `${parsed.date}-${parsed.queues.length}-${JSON.stringify(parsed.queues[0])}`;

          if (!seenDates.has(key)) {
            seenDates.add(key);
            schedules.push({
              parsed,
              source: 'zoe',
              rawText: content.substring(0, 300)
            });
          }
        }
      }
    });

    // Якщо нічого не знайшли за заголовками, спробуємо старий метод (пошук в таблицях або великих блоках)
    if (schedules.length === 0) {
      $('article, .post, .entry-content, .content, .post-content').each((_, el) => {
        const $el = $(el);
        const text = $el.text();

        if (text.includes('ГПВ') || text.includes('Черга') || text.match(/\d\.\d\s*:/)) {
          const parsed = parseScheduleMessage(text);
          if (parsed.date && parsed.queues.length > 0) {
            const key = `${parsed.date}-${parsed.queues.length}`;
            if (!seenDates.has(key)) {
              seenDates.add(key);
              schedules.push({
                parsed,
                source: 'zoe',
                rawText: text.substring(0, 300)
              });
            }
          }
        }
      });
    }

  } catch (error) {
    Logger.error('ZoeScraper', 'Error parsing HTML', error);
  }

  return schedules;
}

/**
 * Валідація розпарсеного графіка
 * Перевіряє чи дані виглядають адекватно
 */
function validateSchedule(parsed) {
  if (!parsed.date || !parsed.queues || parsed.queues.length === 0) {
    return { valid: false, reason: 'Missing date or queues' };
  }

  // Перевіряємо формат дати
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(parsed.date)) {
    return { valid: false, reason: 'Invalid date format' };
  }

  // Перевіряємо чи дата не в минулому (більше ніж 7 днів назад)
  const scheduleDate = new Date(parsed.date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysDiff = (scheduleDate - today) / (1000 * 60 * 60 * 24);

  if (daysDiff < -7) {
    return { valid: false, reason: 'Date too old' };
  }

  // Перевіряємо чи є хоча б одна черга з інтервалами
  let totalIntervals = 0;
  for (const queue of parsed.queues) {
    if (!queue.queue || !queue.intervals || queue.intervals.length === 0) {
      return { valid: false, reason: 'Queue missing intervals' };
    }

    // Перевіряємо формат черги
    if (!/^\d\.\d$/.test(queue.queue)) {
      return { valid: false, reason: `Invalid queue format: ${queue.queue}` };
    }

    // Перевіряємо інтервали
    for (const interval of queue.intervals) {
      if (!interval.start || !interval.end) {
        return { valid: false, reason: 'Interval missing start or end' };
      }

      // Перевіряємо формат часу
      const timeRegex = /^\d{2}:\d{2}$/;
      if (!timeRegex.test(interval.start) || !timeRegex.test(interval.end)) {
        return { valid: false, reason: 'Invalid time format' };
      }

      totalIntervals++;
    }
  }

  // Перевіряємо чи не занадто багато інтервалів (може бути помилка парсингу)
  if (totalIntervals > 50) {
    return { valid: false, reason: `Too many intervals: ${totalIntervals}` };
  }

  // Перевіряємо чи не занадто мало інтервалів (може бути неповний графік)
  if (totalIntervals === 0) {
    return { valid: false, reason: 'No intervals found' };
  }

  return { valid: true };
}

/**
 * Оновити дані з zoe.com.ua
 * Використовується як додаткове джерело, Telegram має пріоритет
 */
export async function updateFromZoe() {
  Logger.info('ZoeScraper', 'Fetching updates from zoe.com.ua...');

  const html = await fetchZoeUpdates();
  if (!html) {
    // Не логуємо як помилку, бо це може бути тимчасовий збій
    Logger.debug('ZoeScraper', 'No HTML received, skipping zoe update');
    return {
      total: 0,
      updated: 0,
      skipped: 0,
      invalid: 0,
      newSchedules: [],
      updatedSchedules: []
    };
  }

  const parsedSchedules = parseZoeHTML(html);
  Logger.info('ZoeScraper', `Found ${parsedSchedules.length} potential schedules`);

  let updated = 0;
  let skipped = 0;
  let invalid = 0;
  const newSchedules = [];
  const updatedSchedules = [];

  for (const { parsed, source, rawText } of parsedSchedules) {
    // Валідуємо графік
    const validation = validateSchedule(parsed);

    if (!validation.valid) {
      Logger.warning('ZoeScraper', `Invalid schedule for ${parsed.date}: ${validation.reason}`);
      Logger.debug('ZoeScraper', `Raw text: ${rawText}`);
      invalid++;
      continue;
    }

    // Використовуємо timestamp як ID для zoe (велике позитивне число)
    // Telegram ID - це малі числа (наприклад 2537), а timestamp - великі (1700000000000)
    const zoeSourceId = Date.now();

    // Перевіряємо чи вже є дані з Telegram для цієї дати
    const metadata = getScheduleMetadata(parsed.date);

    // Якщо є дані з Telegram (ID < 1000000000), пропускаємо, бо Telegram має пріоритет
    if (metadata && metadata.source_msg_id < 1000000000) {
      Logger.debug('ZoeScraper', `Skipped ${parsed.date} - Telegram data exists (priority)`);
      skipped++;
      continue;
    }

    // Вставляємо дані з zoe
    const result = insertParsedSchedule(parsed, zoeSourceId, new Date().toISOString());

    if (!result.updated) {
      skipped++;
    } else {
      updated++;
      Logger.success('ZoeScraper', `Updated ${parsed.date} from zoe.com.ua (${parsed.queues.length} queues)`);

      if (result.changeType === "new") {
        newSchedules.push({
          date: parsed.date,
          messageDate: result.messageDate,
          postId: zoeSourceId,
          source: 'zoe'
        });
      } else if (result.changeType === "updated") {
        updatedSchedules.push({
          date: parsed.date,
          messageDate: result.messageDate,
          postId: zoeSourceId,
          source: 'zoe'
        });
      }
    }
  }

  // Інвалідуємо кеш після оновлення даних
  if (updated > 0) {
    cache.delete('schedules:all-dates');
    cache.delete('schedules:latest');
    cache.delete('schedules:today-status');
  }

  Logger.info('ZoeScraper', `Processed: ${parsedSchedules.length} total, ${updated} updated, ${skipped} skipped, ${invalid} invalid`);

  return {
    total: parsedSchedules.length,
    updated,
    skipped,
    invalid,
    newSchedules,
    updatedSchedules
  };
}

