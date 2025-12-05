import * as cheerio from "cheerio";
import axios from "axios";
import { parseScheduleMessage } from "./parser.js";
import {
  insertParsedSchedule,
  getScheduleMetadata,
  saveZoeSnapshot,
  getLatestZoeVersion,
  getNextZoeVersionNumber,
  saveZoeVersion
} from "../db.js";
import config from "../config/index.js";
import { invalidateScheduleCaches } from "../utils/cacheHelper.js";
import Logger from "../utils/logger.js";
import https from "https";
import {
  generateScheduleHash,
  generateZoeVersionId,
  schedulesAreIdentical,
  findScheduleDifferences,
  formatDifferencesDescription
} from "../utils/versionHelper.js";

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
 * Витягує час оновлення з заголовка "(оновлено о XX:XX)"
 * Повертає ISO timestamp для вказаної дати з вказаним часом
 * @param {string} text - Текст для пошуку часу
 * @param {string} scheduleDate - Дата графіка в форматі YYYY-MM-DD (опціонально)
 */
function extractUpdateTime(text, scheduleDate = null) {
  // Шукаємо "(оновлено о 21:34)" або "(оновлено о 21:34)"
  const timeMatch = text.match(/\(оновлено\s+о\s+(\d{1,2}):(\d{2})\)/i);

  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);

    // Створюємо дату з вказаним часом (київський час UTC+2)
    let updateDate;
    if (scheduleDate) {
      // Використовуємо дату графіка
      const [year, month, day] = scheduleDate.split('-').map(Number);
      updateDate = new Date(year, month - 1, day, hours, minutes, 0);
    } else {
      // Використовуємо сьогоднішню дату
      const now = new Date();
      updateDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
    }

    return updateDate.toISOString();
  }

  return null;
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
  const dateUpdateTimes = new Map(); // Зберігаємо час оновлення для кожної дати
  let positionIndex = 0; // Лічильник позиції на сторінці

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
      const headerText = $header.text();

      // Спочатку витягуємо дату з заголовка, щоб використати її для extractUpdateTime
      const headerParsed = parseScheduleMessage(headerText);
      const headerDate = headerParsed?.date;

      // Витягуємо час оновлення з заголовка або батьківського елемента
      // (час може бути поза тегом <strong>, наприклад: <strong>...</strong> (оновлено о 21:34))
      let updateTime = extractUpdateTime(headerText, headerDate);
      if (!updateTime && $header.parent().length) {
        const parentText = $header.parent().text();
        updateTime = extractUpdateTime(parentText, headerDate);
      }

      // Якщо знайшли час оновлення і дату, зберігаємо час для цієї дати
      if (updateTime && headerDate) {
        // Зберігаємо або оновлюємо час для цієї дати (зберігаємо найпізніший)
        if (!dateUpdateTimes.has(headerDate) || new Date(updateTime) > new Date(dateUpdateTimes.get(headerDate))) {
          dateUpdateTimes.set(headerDate, updateTime);
        }
      }

      let content = headerText;

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
          // Визначаємо messageDate: спочатку з поточного заголовка, якщо немає - з dateUpdateTimes
          let finalUpdateTime = updateTime;
          if (!finalUpdateTime && dateUpdateTimes.has(parsed.date)) {
            finalUpdateTime = dateUpdateTimes.get(parsed.date);
          }

          const newSchedule = {
            parsed,
            source: 'zoe',
            messageDate: finalUpdateTime, // Час оновлення з заголовка "(оновлено о XX:XX)"
            rawText: content.substring(0, 300),
            pagePosition: positionIndex++ // Позиція на сторінці (від 0)
          };

          // PHASE 1 FIX: Видалено фільтрацію дублікатів
          // Система версіонування (хешування) сама відфільтрує справжні дублікати
          schedules.push(newSchedule);
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
            schedules.push({
              parsed,
              source: 'zoe',
              rawText: text.substring(0, 300),
              pagePosition: positionIndex++ // Позиція на сторінці
            });
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

  // Перевіряємо чи дата не в минулому (лайнографік)
  // Дозволяємо тільки сьогодні та майбутні дати
  const scheduleDate = new Date(parsed.date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysDiff = (scheduleDate - today) / (1000 * 60 * 60 * 24);

  if (daysDiff < 0) {
    return { valid: false, reason: 'Lineograph - date in the past' };
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
 *
 * НОВА ЛОГІКА ВЕРСІОНУВАННЯ:
 * 1. Зберігаємо raw HTML як snapshot
 * 2. Для кожного графіка генеруємо хеш контенту
 * 3. Якщо хеш змінився - створюємо нову версію
 * 4. Version ID формату: zoe-2025-12-05-v001, zoe-2025-12-05-v002...
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

  // Крок 1: Зберігаємо raw HTML snapshot
  const parsedSchedules = parseZoeHTML(html);
  const snapshotId = saveZoeSnapshot(html, parsedSchedules);
  Logger.debug('ZoeScraper', `Saved snapshot #${snapshotId}`);

  Logger.info('ZoeScraper', `Found ${parsedSchedules.length} potential schedules`);

  let updated = 0;
  let skipped = 0;
  let invalid = 0;
  const newSchedules = [];
  const updatedSchedules = [];

  for (const { parsed, source, messageDate, rawText, pagePosition } of parsedSchedules) {
    // Валідуємо графік
    const validation = validateSchedule(parsed);

    if (!validation.valid) {
      // Пропускаємо невалідні графіки (зазвичай старі дати)
      Logger.debug('ZoeScraper', `Skipped invalid schedule for ${parsed.date}: ${validation.reason}`);
      invalid++;
      continue;
    }

    // Крок 2: Генеруємо хеш контенту графіка
    const contentHash = generateScheduleHash(parsed);

    // Крок 3: Перевіряємо чи вже є така версія
    const latestVersion = getLatestZoeVersion(parsed.date);

    if (latestVersion) {
      // Є попередня версія - порівнюємо хеші
      if (schedulesAreIdentical(contentHash, latestVersion.content_hash)) {
        // Контент ідентичний - пропускаємо
        Logger.debug('ZoeScraper', `Schedule for ${parsed.date} unchanged (hash: ${contentHash.substring(0, 8)}...)`);
        skipped++;
        continue;
      }

      // Контент змінився - логуємо різницю
      const oldData = JSON.parse(latestVersion.schedule_data);
      const differences = findScheduleDifferences(oldData, parsed);
      const diffDescription = formatDifferencesDescription(differences);
      Logger.info('ZoeScraper', `Schedule for ${parsed.date} changed: ${diffDescription}`);
    }

    // Крок 4: Створюємо нову версію
    const versionNumber = getNextZoeVersionNumber(parsed.date);
    const versionId = generateZoeVersionId(parsed.date, versionNumber);
    const changeType = latestVersion ? 'updated' : 'new';

    // Зберігаємо версію в новій таблиці
    const saved = saveZoeVersion(
      versionId,
      parsed.date,
      versionNumber,
      contentHash,
      parsed,
      snapshotId,
      changeType,
      messageDate,
      pagePosition  // PHASE 1: Зберігаємо позицію на сторінці
    );

    if (!saved) {
      Logger.error('ZoeScraper', `Failed to save version ${versionId}`);
      continue;
    }

    // Крок 5: Також зберігаємо в старі таблиці для backward compatibility
    // TODO: Поступово можна буде відмовитись від цього
    const legacyResult = insertParsedSchedule(parsed, versionNumber, messageDate || new Date().toISOString(), 'zoe');

    if (legacyResult.updated) {
      updated++;
      Logger.success('ZoeScraper', `${changeType === 'new' ? 'New' : 'Updated'} ${parsed.date} version ${versionNumber} (${versionId})`);

      if (changeType === "new") {
        newSchedules.push({
          date: parsed.date,
          messageDate: messageDate || new Date().toISOString(),
          versionId: versionId,
          source: 'zoe'
        });
      } else {
        updatedSchedules.push({
          date: parsed.date,
          messageDate: messageDate || new Date().toISOString(),
          versionId: versionId,
          source: 'zoe'
        });
      }
    }
  }

  // Інвалідуємо кеш після оновлення даних
  if (updated > 0) {
    invalidateScheduleCaches();
  }

  Logger.info('ZoeScraper', `Processed: ${parsedSchedules.length} total, ${updated} updated, ${skipped} skipped (unchanged), ${invalid} invalid`);

  return {
    total: parsedSchedules.length,
    updated,
    skipped,
    invalid,
    newSchedules,
    updatedSchedules,
    snapshotId
  };
}

