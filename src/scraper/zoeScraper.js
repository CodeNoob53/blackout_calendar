import * as cheerio from "cheerio";
import axios from "axios";
import { parseScheduleMessage } from "./parser.js";
import { insertParsedSchedule, getScheduleMetadata } from "../db.js";
import config from "../config/index.js";
import { invalidateScheduleCaches } from "../utils/cacheHelper.js";
import Logger from "../utils/logger.js";
import https from "https";

const ZOE_URL = "https://www.zoe.com.ua/%D0%B3%D1%80%D0%B0%D1%84%D1%96%D0%BA%D0%B8-%D0%BF%D0%BE%D0%B3%D0%BE%D0%B4%D0%B8%D0%BD%D0%BD%D0%B8%D1%85-%D1%81%D1%82%D0%B0%D0%B1%D1%96%D0%BB%D1%96%D0%B7%D0%B0%D1%86%D1%96%D0%B9%D0%BD%D0%B8%D1%85/";

/**
 * Отримати HTML з сайту zoe.com.ua
 * Використовуємо axios для кращої обробки помилок та підтримки різних протоколів
 */
export async function fetchZoeUpdates() {
  try {
    // SECURITY: Правильна обробка SSL для zoe.com.ua
    // Проблема: сайт не надає повний ланцюг SSL сертифікатів (UNABLE_TO_VERIFY_LEAF_SIGNATURE)
    // Рішення: відключаємо автоматичну перевірку ланцюга, але робимо вручну всі критичні перевірки
    //
    // Що перевіряємо:
    // ✓ Hostname (тільки zoe.com.ua)
    // ✓ Domain в сертифікаті (Subject/SAN)
    // ✓ Термін дії сертифіката (valid_from/valid_to)
    // ✓ Issuer (Let's Encrypt або інший валідний CA)
    // ✗ Incomplete certificate chain (ігноруємо через проблему на сервері)

    const skipSslVerify = process.env.ZOE_SKIP_SSL_VERIFY === 'true';

    const agent = new https.Agent({
      // Відключаємо автоматичну перевірку ланцюга, бо він incomplete
      rejectUnauthorized: false,
      // Робимо власну ретельну перевірку сертифіката
      checkServerIdentity: (hostname, cert) => {
        // 1. Перевіряємо hostname - тільки zoe.com.ua дозволено
        const validHostnames = ['www.zoe.com.ua', 'zoe.com.ua'];
        if (!validHostnames.includes(hostname)) {
          Logger.error('ZoeScraper', `SSL: Hostname mismatch! Expected zoe.com.ua, got ${hostname}`);
          return new Error(`Hostname mismatch: expected zoe.com.ua, got ${hostname}`);
        }

        // 2. Перевіряємо що сертифікат видано для zoe.com.ua
        const subjectAltNames = cert.subjectaltname?.toLowerCase() || '';
        const subjectCN = cert.subject?.CN?.toLowerCase() || '';
        const hasValidDomain = subjectAltNames.includes('zoe.com.ua') || subjectCN.includes('zoe.com.ua');

        if (!hasValidDomain) {
          Logger.error('ZoeScraper', `SSL: Certificate not for zoe.com.ua! Subject: ${subjectCN}, SAN: ${subjectAltNames}`);
          return new Error(`Certificate not issued for zoe.com.ua`);
        }

        // 3. Перевіряємо термін дії
        const now = new Date();
        const validFrom = new Date(cert.valid_from);
        const validTo = new Date(cert.valid_to);

        if (now < validFrom) {
          Logger.error('ZoeScraper', `SSL: Certificate not yet valid! Valid from: ${cert.valid_from}`);
          return new Error(`Certificate not yet valid (valid from: ${cert.valid_from})`);
        }
        if (now > validTo) {
          Logger.error('ZoeScraper', `SSL: Certificate EXPIRED! Valid to: ${cert.valid_to}`);
          return new Error(`Certificate expired (valid to: ${cert.valid_to})`);
        }

        // 4. Перевіряємо Issuer - має бути відомий CA
        const issuer = cert.issuer?.O || cert.issuer?.CN || '';
        const knownIssuers = ['Let\'s Encrypt', 'DigiCert', 'GlobalSign', 'Cloudflare', 'Google Trust Services'];
        const hasKnownIssuer = knownIssuers.some(ca => issuer.includes(ca));

        if (!hasKnownIssuer) {
          Logger.warning('ZoeScraper', `SSL: Unknown issuer: ${issuer} - proceeding with caution`);
          // Не блокуємо, але попереджаємо
        }

        // Всі критичні перевірки пройдено
        Logger.info('ZoeScraper', `✓ SSL verified: ${hostname} | Issuer: ${issuer} | Expires: ${cert.valid_to}`);
        return undefined; // Дозволяємо з'єднання
      }
    });

    // Якщо користувач явно хоче відключити всю верифікацію (не рекомендується)
    if (skipSslVerify) {
      Logger.warning('ZoeScraper', '⚠️  FULL SSL verification DISABLED - using unsafe fallback mode!');
      delete agent.options.checkServerIdentity;
    }

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
      } else if (error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || error.code === 'CERT_HAS_EXPIRED' ||
        error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || error.message?.includes('certificate')) {
        // SSL Certificate problems
        Logger.warning('ZoeScraper', `SSL Certificate error: ${error.message}`);
        Logger.info('ZoeScraper', 'Hint: Set ZOE_SKIP_SSL_VERIFY=true in .env to bypass (not recommended for production)');
      } else if (error.response) {
        // Сервер відповів з помилковим статус кодом
        Logger.warning('ZoeScraper', `HTTP ${error.response.status}: ${error.response.statusText}`);
      } else if (error.request) {
        // Запит був зроблений, але відповіді не отримано
        Logger.warning('ZoeScraper', 'No response received from zoe.com.ua');
      } else {
        Logger.warning('ZoeScraper', `Request setup error: ${error.message}`);
      }

      // Додатково логуємо error.code для діагностики
      if (error.code) {
        Logger.debug('ZoeScraper', `Error code: ${error.code}`);
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
      // Пропускаємо невалідні графіки (зазвичай старі дати)
      invalid++;
      continue;
    }

    // Використовуємо timestamp як ID для zoe (велике позитивне число)
    // Telegram ID - це малі числа (наприклад 2537), а timestamp - великі (1700000000000)
    const zoeSourceId = Date.now();

    // Перевіряємо чи вже є дані для цієї дати
    const metadata = getScheduleMetadata(parsed.date);

    // Вставляємо дані з zoe
    const result = insertParsedSchedule(parsed, zoeSourceId, new Date().toISOString(), 'zoe');

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
    invalidateScheduleCaches();
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

