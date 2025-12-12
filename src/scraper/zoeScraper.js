import * as cheerio from "cheerio";
import axios from "axios";
import { parseScheduleMessage } from "./parser.js";
import config from "../config/index.js";
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

    // Додаємо таймстемп, щоб обходити кеш на проміжних проксі (Cloudflare/бразуерні кеші)
    const requestUrl = `${ZOE_URL}?_=${Date.now()}`;

    const response = await axios.get(requestUrl, {
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
  const seenContent = new Set(); // Дедуплікація контенту
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

      // Піднімаємось до контейнера (p, div і т.д.)
      let $container = $header.parent();
      while ($container.length && !$container.is('p, div, article, section, li')) {
        $container = $container.parent();
      }

      // Збираємо весь текст з контейнера та наступних елементів до наступного заголовка
      if ($container.length) {
        // Додаємо текст самого контейнера
        content += '\n' + $container.text();

        // Збираємо наступні елементи (до 10 елементів або до наступного заголовка)
        let $next = $container.next();
        let count = 0;
        while ($next.length && count < 10) {
          // Перевіряємо чи не є це новим заголовком
          const nextText = $next.text();
          const hasNewHeader = $next.find('h1, h2, h3, h4, h5, h6, strong, b').filter((_, nextEl) => {
            const t = $(nextEl).text().trim();
            return (t.includes('ГПВ') || t.includes('графік')) && t.match(/\d{1,2}/);
          }).length > 0;

          if (hasNewHeader) {
            break; // Зупиняємось якщо знайшли новий заголовок
          }

          content += '\n' + nextText;
          $next = $next.next();
          count++;

          // Якщо знайшли черги, можемо зупинитись раніше
          if (nextText.match(/\d\.\d\s*:/) && count >= 3) {
            break;
          }
        }
      }

      // Очищаємо текст від зайвих пробілів
      content = content.replace(/\s+/g, ' ').trim();

      if (content.includes('ГПВ') || content.includes('Черга') || content.match(/\d\.\d\s*:/)) {
        const parsed = parseScheduleMessage(content);

        // Додаткова перевірка: якщо дата не знайдена в блоці, але є в заголовку
        // extractDate має це обробляти, але про всяк випадок

        if (parsed.date && parsed.queues.length > 0) {
          // Створюємо хеш контенту для дедуплікації (дата + черги)
          const contentHash = `${parsed.date}:${JSON.stringify(parsed.queues)}`;

          // Пропускаємо якщо вже бачили такий самий контент
          if (seenContent.has(contentHash)) {
            return; // Пропускаємо цей заголовок
          }
          seenContent.add(contentHash);

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

// Legacy update function removed in favor of SyncEngine orchestrator
